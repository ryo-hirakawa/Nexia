"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { isValidDateStr } from "@/lib/daily";
import { PAYMENT_METHODS } from "@/lib/bar-preset";
import { latestRecordedDate } from "@/lib/monthly-server";

/** 記録がある一番新しい営業日（フォーム送信後に「最新日」へ切り替えるため）。 */
export async function getLatestRecordedDate(
  storeId: string,
): Promise<string | null> {
  await requireMembership();
  return latestRecordedDate(storeId);
}

export type SavePayload = {
  storeId: string;
  businessDate: string;
  weather: string | null;
  note: string | null;
  totalSales: number;
  guestCount: number;
  groupCount: number;
  categories: { category: string; amount: number }[];
  payments: { method: string; amount: number }[];
  costs: {
    cost_class: "cogs" | "labor" | "variable";
    item: string;
    amount: number;
    note?: string | null;
  }[];
  receivables: {
    direction: "incurred" | "collected";
    counterparty: string | null;
    amount: number;
    note?: string | null;
  }[];
  casts: {
    cast_name: string;
    nominate_amount: number;
    table_amount: number;
    companion_amount: number;
    back_amount: number;
  }[];
  confirm: boolean;
};

type Result =
  | { ok: true; status: "draft" | "confirmed" }
  | { ok: false; error: string };

const n0 = (v: number) => Math.max(0, Math.round(Number(v) || 0));

export async function saveDailyRecord(p: SavePayload): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  if (!isValidDateStr(p.businessDate)) {
    return { ok: false, error: "日付が不正です" };
  }

  const total = n0(p.totalSales);
  const catSum = p.categories.reduce((s, c) => s + n0(c.amount), 0);

  // 売掛「発生」の合計 → 決済の売掛はここから自動（二重入力しない）
  const incurredSum = p.receivables
    .filter((r) => r.direction === "incurred")
    .reduce((s, r) => s + n0(r.amount), 0);
  const castBackSum = p.casts.reduce((s, c) => s + n0(c.back_amount), 0);

  const normPayments = PAYMENT_METHODS.map((m) => {
    if (m.key === "receivable")
      return { method: "receivable", amount: incurredSum };
    const found = p.payments.find((x) => x.method === m.key);
    return { method: m.key as string, amount: n0(found?.amount ?? 0) };
  });
  const paySum = normPayments.reduce((s, c) => s + n0(c.amount), 0);

  if (p.confirm) {
    if (total <= 0) return { ok: false, error: "総売上を入力してください" };
    if (p.categories.some((c) => c.amount) && catSum !== total) {
      return {
        ok: false,
        error: `売上内訳の合計（¥${catSum.toLocaleString("ja-JP")}）が総売上（¥${total.toLocaleString("ja-JP")}）と一致しません`,
      };
    }
    if (normPayments.some((c) => c.amount > 0) && paySum !== total) {
      return {
        ok: false,
        error: `決済の合計（¥${paySum.toLocaleString("ja-JP")}）が総売上（¥${total.toLocaleString("ja-JP")}）と一致しません`,
      };
    }
  }

  // 親レコード upsert（RLS の with check で他店は弾かれる）
  const { data: rec, error: upErr } = await supabase
    .from("daily_records")
    .upsert(
      {
        store_id: p.storeId,
        business_date: p.businessDate,
        weather: p.weather || null,
        note: p.note || null,
        total_sales: total,
        guest_count: n0(p.guestCount),
        group_count: n0(p.groupCount),
        status: p.confirm ? "confirmed" : "draft",
        ...(p.confirm ? { confirmed_at: new Date().toISOString() } : {}),
      },
      { onConflict: "store_id,business_date" },
    )
    .select("id")
    .single();

  if (upErr || !rec) {
    return { ok: false, error: upErr?.message ?? "保存に失敗しました（権限をご確認ください）" };
  }

  const rid = rec.id;

  // 子テーブルを入れ替え（TODO: RPC で原子化）
  await Promise.all([
    supabase.from("daily_sales_categories").delete().eq("daily_record_id", rid),
    supabase.from("daily_payments").delete().eq("daily_record_id", rid),
    supabase.from("daily_costs").delete().eq("daily_record_id", rid),
    supabase.from("daily_receivable_entries").delete().eq("daily_record_id", rid),
    supabase.from("daily_cast_sales").delete().eq("daily_record_id", rid),
  ]);

  const catRows = p.categories
    .filter((c) => n0(c.amount) > 0)
    .map((c, i) => ({
      daily_record_id: rid,
      category: c.category,
      amount: n0(c.amount),
      sort_order: i,
    }));
  const payRows = normPayments
    .filter((c) => n0(c.amount) > 0)
    .map((c) => ({ daily_record_id: rid, method: c.method, amount: n0(c.amount) }));

  const costRows = p.costs
    .filter(
      (c) => n0(c.amount) > 0 && c.item.trim() !== "" && c.item.trim() !== "キャストバック",
    )
    .map((c, i) => ({
      daily_record_id: rid,
      cost_class: c.cost_class,
      item: c.item.trim(),
      amount: n0(c.amount),
      note: c.note?.trim() || null,
      sort_order: i,
    }));
  if (castBackSum > 0) {
    costRows.push({
      daily_record_id: rid,
      cost_class: "labor",
      item: "キャストバック",
      amount: castBackSum,
      note: null,
      sort_order: costRows.length,
    });
  }

  const recvRows = p.receivables
    .filter((r) => n0(r.amount) > 0)
    .map((r, i) => ({
      daily_record_id: rid,
      direction: r.direction,
      counterparty: r.counterparty?.trim() || null,
      amount: n0(r.amount),
      note: r.note?.trim() || null,
      sort_order: i,
    }));
  const castRows = p.casts
    .filter(
      (c) =>
        c.cast_name.trim() !== "" &&
        n0(c.nominate_amount) +
          n0(c.table_amount) +
          n0(c.companion_amount) +
          n0(c.back_amount) >
          0,
    )
    .map((c, i) => ({
      daily_record_id: rid,
      cast_name: c.cast_name.trim(),
      nominate_amount: n0(c.nominate_amount),
      table_amount: n0(c.table_amount),
      companion_amount: n0(c.companion_amount),
      back_amount: n0(c.back_amount),
      sort_order: i,
    }));

  const inserts = [];
  if (catRows.length)
    inserts.push(supabase.from("daily_sales_categories").insert(catRows));
  if (payRows.length)
    inserts.push(supabase.from("daily_payments").insert(payRows));
  if (costRows.length) inserts.push(supabase.from("daily_costs").insert(costRows));
  if (recvRows.length)
    inserts.push(supabase.from("daily_receivable_entries").insert(recvRows));
  if (castRows.length)
    inserts.push(supabase.from("daily_cast_sales").insert(castRows));

  const results = await Promise.all(inserts);
  const childErr = results.find((r) => r.error);
  if (childErr?.error) return { ok: false, error: childErr.error.message };

  revalidatePath(`/input/${p.storeId}/${p.businessDate}`);
  revalidatePath("/dashboard");
  return { ok: true, status: p.confirm ? "confirmed" : "draft" };
}

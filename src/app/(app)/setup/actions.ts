"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";

const n0 = (v: number) => Math.max(0, Math.round(Number(v) || 0));
const isMonthKey = (s: string) => /^\d{4}-\d{2}-01$/.test(s);

export type MonthlySetupPayload = {
  storeId: string;
  yearMonth: string; // "2026-09-01"
  fixed: { item: string; category: string; amount: number }[];
  staff: { name: string; amount: number }[];
  salesTarget: number;
};

type Result = { ok: true } | { ok: false; error: string };

export async function saveMonthlySetup(
  p: MonthlySetupPayload,
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  if (!isMonthKey(p.yearMonth)) return { ok: false, error: "対象月が不正です" };

  const { data: ms, error: upErr } = await supabase
    .from("monthly_setups")
    .upsert(
      { store_id: p.storeId, year_month: p.yearMonth },
      { onConflict: "store_id,year_month" },
    )
    .select("id")
    .single();

  if (upErr || !ms) {
    return {
      ok: false,
      error: upErr?.message ?? "保存に失敗しました（権限をご確認ください）",
    };
  }

  const sid = ms.id;
  await Promise.all([
    supabase.from("fixed_cost_lines").delete().eq("monthly_setup_id", sid),
    supabase.from("monthly_staff").delete().eq("monthly_setup_id", sid),
  ]);

  const fixedRows = p.fixed
    .filter((l) => l.item.trim() !== "" && n0(l.amount) > 0)
    .map((l, i) => ({
      monthly_setup_id: sid,
      item: l.item.trim(),
      category: l.category.trim() || "その他",
      amount_monthly: n0(l.amount),
      sort_order: i,
    }));
  const staffRows = p.staff
    .filter((l) => l.name.trim() !== "" && n0(l.amount) > 0)
    .map((l, i) => ({
      monthly_setup_id: sid,
      staff_name: l.name.trim(),
      amount_monthly: n0(l.amount),
      sort_order: i,
    }));

  const inserts = [];
  if (fixedRows.length)
    inserts.push(supabase.from("fixed_cost_lines").insert(fixedRows));
  if (staffRows.length)
    inserts.push(supabase.from("monthly_staff").insert(staffRows));
  const results = await Promise.all(inserts);
  const err = results.find((r) => r.error);
  if (err?.error) return { ok: false, error: err.error.message };

  // 月間売上目標
  const target = n0(p.salesTarget);
  const { error: tErr } = await supabase.from("monthly_targets").upsert(
    { store_id: p.storeId, year_month: p.yearMonth, sales_target: target },
    { onConflict: "store_id,year_month" },
  );
  if (tErr) return { ok: false, error: tErr.message };

  revalidatePath(`/setup/${p.storeId}/${p.yearMonth.slice(0, 7)}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function saveVariableItems(
  storeId: string,
  names: string[],
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  const clean = [
    ...new Set(names.map((s) => s.trim()).filter((s) => s !== "")),
  ].slice(0, 60);

  await supabase.from("variable_cost_items").delete().eq("store_id", storeId);

  if (clean.length) {
    const { error } = await supabase.from("variable_cost_items").insert(
      clean.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/setup/${storeId}`);
  return { ok: true };
}

export async function saveSalesCategories(
  storeId: string,
  names: string[],
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  const clean = [
    ...new Set(names.map((s) => s.trim()).filter((s) => s !== "")),
  ].slice(0, 30);

  await supabase.from("sales_categories").delete().eq("store_id", storeId);

  if (clean.length) {
    const { error } = await supabase.from("sales_categories").insert(
      clean.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/setup/${storeId}`);
  revalidatePath("/input");
  return { ok: true };
}

/**
 * id付きの行は更新、id無しは新規、既存にあって送られてこなかったものは削除。
 * (日次入力の daily_costs.staff_id から参照されるため、取引先マスタ等のような
 * 「全削除して入れ直す」方式は使えない。)
 */
export async function saveStaffMembers(
  storeId: string,
  rows: { id?: string; name: string; hourlyWage: number }[],
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  const clean = rows
    .map((r) => ({ id: r.id, name: r.name.trim(), hourlyWage: n0(r.hourlyWage) }))
    .filter((r) => r.name !== "")
    .slice(0, 30);

  const { data: existing } = await supabase.from("staff_members").select("id").eq("store_id", storeId);
  const existingIds = new Set((existing ?? []).map((r) => r.id));
  const keepIds = new Set(clean.filter((r) => r.id).map((r) => r.id as string));
  const toDelete = [...existingIds].filter((id) => !keepIds.has(id));

  if (toDelete.length) {
    const { error } = await supabase.from("staff_members").delete().in("id", toDelete);
    if (error) return { ok: false, error: error.message };
  }

  for (let i = 0; i < clean.length; i++) {
    const r = clean[i];
    if (r.id) {
      const { error } = await supabase
        .from("staff_members")
        .update({ name: r.name, hourly_wage: r.hourlyWage, sort_order: i })
        .eq("id", r.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase
        .from("staff_members")
        .insert({ store_id: storeId, name: r.name, hourly_wage: r.hourlyWage, sort_order: i });
      if (error) return { ok: false, error: error.message };
    }
  }

  revalidatePath(`/setup/${storeId}`);
  revalidatePath("/input");
  return { ok: true };
}

export async function saveVendors(
  storeId: string,
  names: string[],
): Promise<Result> {
  await requireMembership();
  const supabase = await createClient();

  const clean = [
    ...new Set(names.map((s) => s.trim()).filter((s) => s !== "")),
  ].slice(0, 60);

  await supabase.from("vendors").delete().eq("store_id", storeId);

  if (clean.length) {
    const { error } = await supabase.from("vendors").insert(
      clean.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/setup/${storeId}`);
  revalidatePath("/input");
  return { ok: true };
}

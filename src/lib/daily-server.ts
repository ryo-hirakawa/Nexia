import { createClient } from "@/lib/supabase/server";
import { type PaymentKey } from "@/lib/bar-preset";
import {
  emptyPayments,
  type DailyRecordForm,
  type RecordStatus,
  type CostClass,
  type ReceivableDirection,
} from "@/lib/daily";

/**
 * 指定した店舗・営業日の日次レコードを子テーブルごと取得。
 * 無ければ空のフォーム初期値を返す。RLS が効くので他店は取れない。
 */
export async function loadDailyRecord(
  storeId: string,
  businessDate: string,
): Promise<DailyRecordForm> {
  const supabase = await createClient();

  const { data: rec, error } = await supabase
    .from("daily_records")
    .select(
      "id, store_id, business_date, status, weather, note, total_sales, guest_count, group_count, confirmed_at, updated_at",
    )
    .eq("store_id", storeId)
    .eq("business_date", businessDate)
    .maybeSingle();

  if (error) throw error;

  // この営業日より前の売掛残高（店舗の累計: 発生 − 回収）
  const { data: priorRows } = await supabase
    .from("daily_receivable_entries")
    .select("direction, amount, daily_records!inner(store_id, business_date)")
    .eq("daily_records.store_id", storeId)
    .lt("daily_records.business_date", businessDate);

  const priorReceivableBalance = (priorRows ?? []).reduce(
    (s, r) =>
      s +
      (r.direction === ("incurred" as ReceivableDirection)
        ? Number(r.amount)
        : -Number(r.amount)),
    0,
  );

  const base: DailyRecordForm = {
    id: null,
    storeId,
    businessDate,
    status: "draft",
    weather: null,
    note: null,
    totalSales: 0,
    guestCount: 0,
    groupCount: 0,
    categories: [],
    payments: emptyPayments(),
    costs: [],
    receivables: [],
    casts: [],
    priorReceivableBalance,
    confirmedAt: null,
    updatedAt: null,
  };

  if (!rec) return base;

  const [
    { data: cats },
    { data: pays },
    { data: costs },
    { data: recvs },
    { data: casts },
  ] = await Promise.all([
    supabase
      .from("daily_sales_categories")
      .select("category, amount, sort_order")
      .eq("daily_record_id", rec.id)
      .order("sort_order"),
    supabase
      .from("daily_payments")
      .select("method, amount")
      .eq("daily_record_id", rec.id),
    supabase
      .from("daily_costs")
      .select("cost_class, item, amount, note, sort_order")
      .eq("daily_record_id", rec.id)
      .order("sort_order"),
    supabase
      .from("daily_receivable_entries")
      .select("direction, counterparty, amount, note, sort_order")
      .eq("daily_record_id", rec.id)
      .order("sort_order"),
    supabase
      .from("daily_cast_sales")
      .select(
        "cast_name, nominate_amount, table_amount, companion_amount, back_amount, sort_order",
      )
      .eq("daily_record_id", rec.id)
      .order("sort_order"),
  ]);

  const payments = emptyPayments();
  for (const p of pays ?? []) {
    payments[p.method as PaymentKey] = Number(p.amount);
  }

  return {
    ...base,
    id: rec.id,
    status: rec.status as RecordStatus,
    weather: rec.weather,
    note: rec.note,
    totalSales: Number(rec.total_sales),
    guestCount: rec.guest_count,
    groupCount: rec.group_count,
    categories: (cats ?? []).map((c) => ({
      category: c.category,
      amount: Number(c.amount),
    })),
    payments,
    costs: (costs ?? []).map((c) => ({
      cost_class: c.cost_class as CostClass,
      item: c.item,
      amount: Number(c.amount),
      note: c.note,
    })),
    receivables: (recvs ?? []).map((r) => ({
      direction: r.direction as ReceivableDirection,
      counterparty: r.counterparty,
      amount: Number(r.amount),
      note: r.note,
    })),
    casts: (casts ?? []).map((c) => ({
      cast_name: c.cast_name,
      nominate_amount: Number(c.nominate_amount),
      table_amount: Number(c.table_amount),
      companion_amount: Number(c.companion_amount),
      back_amount: Number(c.back_amount),
    })),
    priorReceivableBalance,
    confirmedAt: rec.confirmed_at,
    updatedAt: rec.updated_at,
  };
}

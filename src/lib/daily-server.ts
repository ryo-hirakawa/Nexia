import { createClient } from "@/lib/supabase/server";
import { type PaymentKey } from "@/lib/bar-preset";
import {
  emptyPayments,
  type DailyRecordForm,
  type RecordStatus,
  type CostClass,
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
    confirmedAt: null,
    updatedAt: null,
  };

  if (!rec) return base;

  const [{ data: cats }, { data: pays }, { data: costs }] = await Promise.all([
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
    confirmedAt: rec.confirmed_at,
    updatedAt: rec.updated_at,
  };
}

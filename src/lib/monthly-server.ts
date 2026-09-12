import { createClient } from "@/lib/supabase/server";
import type { MonthlySetupForm } from "@/lib/monthly";
import type { MonthlySetupData } from "@/lib/finance";
import { monthKeyOf } from "@/lib/finance";

async function loadByMonthKey(
  storeId: string,
  yearMonth: string,
): Promise<MonthlySetupForm> {
  const supabase = await createClient();

  // Supabase(東京)とVercelの実行環境(米国)の往復は1回あたり数百msかかる。
  // 「monthly_setups.id を取ってから fixed/staff を取る」という2段階の
  // 直列往復を避け、fixed_cost_lines/monthly_staff は
  // monthly_setups!inner(store_id, year_month) の埋め込みJOINで
  // store_id×年月から直接引く。4クエリとも互いに依存しないので
  // 1回の往復(Promise.all)にまとめる。
  const [{ data: tgt }, { data: ms }, { data: fixed }, { data: staff }] =
    await Promise.all([
      supabase
        .from("monthly_targets")
        .select("sales_target")
        .eq("store_id", storeId)
        .eq("year_month", yearMonth)
        .maybeSingle(),
      supabase
        .from("monthly_setups")
        .select("id, updated_at")
        .eq("store_id", storeId)
        .eq("year_month", yearMonth)
        .maybeSingle(),
      supabase
        .from("fixed_cost_lines")
        .select(
          "item, category, amount_monthly, sort_order, monthly_setups!inner(store_id, year_month)",
        )
        .eq("monthly_setups.store_id", storeId)
        .eq("monthly_setups.year_month", yearMonth)
        .order("sort_order"),
      supabase
        .from("monthly_staff")
        .select(
          "staff_name, amount_monthly, sort_order, monthly_setups!inner(store_id, year_month)",
        )
        .eq("monthly_setups.store_id", storeId)
        .eq("monthly_setups.year_month", yearMonth)
        .order("sort_order"),
    ]);
  const salesTarget = Number(tgt?.sales_target ?? 0);

  if (!ms) {
    return {
      id: null,
      storeId,
      yearMonth,
      fixed: [],
      staff: [],
      salesTarget,
      updatedAt: null,
    };
  }

  return {
    id: ms.id,
    storeId,
    yearMonth,
    salesTarget,
    updatedAt: ms.updated_at,
    fixed: (fixed ?? []).map((l) => ({
      item: l.item,
      category: l.category,
      amount: Number(l.amount_monthly),
    })),
    staff: (staff ?? []).map((l) => ({
      name: l.staff_name,
      amount: Number(l.amount_monthly),
    })),
  };
}

export function loadMonthlySetup(storeId: string, yearMonth: string) {
  return loadByMonthKey(storeId, yearMonth);
}

/** その営業日が属する月の月初セットアップを finance 用の形で返す */
export async function loadSetupDataForDate(
  storeId: string,
  businessDate: string,
): Promise<MonthlySetupData | null> {
  const f = await loadByMonthKey(storeId, monthKeyOf(businessDate));
  if (!f.id) return null;
  return {
    fixedLines: f.fixed.map((l) => ({
      item: l.item,
      category: l.category,
      amountMonthly: l.amount,
    })),
    staff: f.staff.map((l) => ({
      staffName: l.name,
      amountMonthly: l.amount,
    })),
  };
}

export async function loadVariableItems(storeId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("variable_cost_items")
    .select("name, sort_order")
    .eq("store_id", storeId)
    .order("sort_order");
  return (data ?? []).map((r) => r.name);
}

export async function loadSalesCategories(storeId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sales_categories")
    .select("name, sort_order")
    .eq("store_id", storeId)
    .order("sort_order");
  return (data ?? []).map((r) => r.name);
}

/** 記録がある一番新しい営業日。無ければ null。 */
export async function latestRecordedDate(
  storeId: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("daily_records")
    .select("business_date")
    .eq("store_id", storeId)
    .order("business_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.business_date ?? null;
}

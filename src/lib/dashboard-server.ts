import { createClient } from "@/lib/supabase/server";
import { daysInMonth, monthKeyOf, proratedFixed, proratedStaff } from "@/lib/finance";
import {
  periodRange,
  datesInRange,
  type DashView,
} from "@/lib/period";
import { loadSetupDataForDate } from "@/lib/monthly-server";
import { PAYMENT_METHODS } from "@/lib/bar-preset";

export type DashboardData = {
  view: DashView;
  refDate: string;
  range: { start: string; end: string };
  recordedDays: number;
  draftDays: number;
  hasSetup: boolean;

  sales: number;
  guests: number;
  groups: number;
  avgSpend: number | null;

  cogs: number;
  laborDaily: number;
  laborStaffProrated: number;
  labor: number;
  variable: number;
  fixedProrated: number;
  totalCost: number;
  operatingProfit: number;
  flRate: number | null;
  cogsRate: number | null;
  laborRate: number | null;
  operatingMarginRate: number | null;

  salesTarget: number;
  targetRate: number | null;
  landingForecast: number | null;

  receivableBalance: number;

  byCategory: { name: string; amount: number }[];
  byPayment: { method: string; label: string; amount: number }[];
  castRanking: { name: string; sales: number; back: number }[];
  costByClass: { key: string; label: string; amount: number }[];
  variableByItem: { name: string; amount: number }[];
  laborByItem: { name: string; amount: number }[];
  dailyTrend: { date: string; sales: number; hasRecord: boolean }[];
};

const rate = (n: number, d: number) => (d > 0 ? n / d : null);
const groupSum = <T>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return [...m.entries()].map(([name, amount]) => ({ name, amount }));
};

export async function loadDashboardData(
  storeId: string,
  view: DashView,
  refDate: string,
): Promise<DashboardData> {
  const supabase = await createClient();
  const range = periodRange(view, refDate);
  const monthKey = monthKeyOf(refDate);
  const dim = daysInMonth(refDate);

  const setup = await loadSetupDataForDate(storeId, refDate);
  const fixedPerDay = proratedFixed(setup, dim);
  const staffPerDay = proratedStaff(setup, dim);

  const { data: recs } = await supabase
    .from("daily_records")
    .select("id, business_date, status, total_sales, guest_count, group_count")
    .eq("store_id", storeId)
    .gte("business_date", range.start)
    .lte("business_date", range.end)
    .order("business_date");

  const records = recs ?? [];
  const recordedDays = records.length;
  const draftDays = records.filter((r) => r.status === "draft").length;
  const ids = records.map((r) => r.id);

  let categories: { category: string; amount: number }[] = [];
  let payments: { method: string; amount: number }[] = [];
  let costs: { cost_class: string; item: string; amount: number }[] = [];
  let casts: {
    cast_name: string;
    nominate_amount: number;
    table_amount: number;
    companion_amount: number;
    back_amount: number;
  }[] = [];

  if (ids.length) {
    const [c1, c2, c3, c4] = await Promise.all([
      supabase
        .from("daily_sales_categories")
        .select("category, amount")
        .in("daily_record_id", ids),
      supabase
        .from("daily_payments")
        .select("method, amount")
        .in("daily_record_id", ids),
      supabase
        .from("daily_costs")
        .select("cost_class, item, amount")
        .in("daily_record_id", ids),
      supabase
        .from("daily_cast_sales")
        .select(
          "cast_name, nominate_amount, table_amount, companion_amount, back_amount",
        )
        .in("daily_record_id", ids),
    ]);
    categories = (c1.data ?? []).map((r) => ({
      category: r.category,
      amount: Number(r.amount),
    }));
    payments = (c2.data ?? []).map((r) => ({
      method: r.method,
      amount: Number(r.amount),
    }));
    costs = (c3.data ?? []).map((r) => ({
      cost_class: r.cost_class,
      item: r.item,
      amount: Number(r.amount),
    }));
    casts = (c4.data ?? []).map((r) => ({
      cast_name: r.cast_name,
      nominate_amount: Number(r.nominate_amount),
      table_amount: Number(r.table_amount),
      companion_amount: Number(r.companion_amount),
      back_amount: Number(r.back_amount),
    }));
  }

  const sales = records.reduce((s, r) => s + Number(r.total_sales), 0);
  const guests = records.reduce((s, r) => s + r.guest_count, 0);
  const groups = records.reduce((s, r) => s + r.group_count, 0);

  const sumClass = (cls: string) =>
    costs.filter((c) => c.cost_class === cls).reduce((s, c) => s + c.amount, 0);
  const cogs = sumClass("cogs");
  const laborDaily = sumClass("labor");
  const variable = sumClass("variable");
  const fixedProrated = fixedPerDay * recordedDays;
  const laborStaffProrated = staffPerDay * recordedDays;
  const labor = laborDaily + laborStaffProrated;
  const totalCost = cogs + labor + variable + fixedProrated;
  const operatingProfit = sales - totalCost;

  // 目標
  const { data: tgt } = await supabase
    .from("monthly_targets")
    .select("sales_target")
    .eq("store_id", storeId)
    .eq("year_month", monthKey)
    .maybeSingle();
  const salesTarget = Number(tgt?.sales_target ?? 0);

  let landingForecast: number | null = null;
  if (view === "month" && salesTarget >= 0) {
    const dayOfMonth = Number(refDate.slice(8));
    if (dayOfMonth > 0 && dayOfMonth < dim && sales > 0) {
      landingForecast = Math.round((sales / dayOfMonth) * dim);
    }
  }

  // 売掛残高（期間末時点の店舗累計）
  const { data: recvRows } = await supabase
    .from("daily_receivable_entries")
    .select("direction, amount, daily_records!inner(store_id, business_date)")
    .eq("daily_records.store_id", storeId)
    .lte("daily_records.business_date", range.end);
  const receivableBalance = (recvRows ?? []).reduce(
    (s, r) =>
      s + (r.direction === "incurred" ? Number(r.amount) : -Number(r.amount)),
    0,
  );

  const byCategory = groupSum(
    categories,
    (r) => r.category,
    (r) => r.amount,
  )
    .map((x) => ({ name: x.name, amount: x.amount }))
    .sort((a, b) => b.amount - a.amount);

  const payMap = new Map(payments.map((p) => [p.method, 0]));
  for (const p of payments) payMap.set(p.method, (payMap.get(p.method) ?? 0) + p.amount);
  const byPayment = PAYMENT_METHODS.map((m) => ({
    method: m.key,
    label: m.label,
    amount: payMap.get(m.key) ?? 0,
  })).filter((p) => p.amount > 0);

  const castMap = new Map<string, { sales: number; back: number }>();
  for (const c of casts) {
    const cur = castMap.get(c.cast_name) ?? { sales: 0, back: 0 };
    cur.sales += c.nominate_amount + c.table_amount + c.companion_amount;
    cur.back += c.back_amount;
    castMap.set(c.cast_name, cur);
  }
  const castRanking = [...castMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.sales - a.sales);

  const costByClass = [
    { key: "cogs", label: "仕入れ（原価）", amount: cogs },
    { key: "labor", label: "人件費", amount: labor },
    { key: "fixed", label: "固定費", amount: fixedProrated },
    { key: "variable", label: "流動費", amount: variable },
  ].sort((a, b) => b.amount - a.amount);

  const variableByItem = groupSum(
    costs.filter((c) => c.cost_class === "variable"),
    (r) => r.item,
    (r) => r.amount,
  ).sort((a, b) => b.amount - a.amount);

  const laborByItem = groupSum(
    costs.filter((c) => c.cost_class === "labor"),
    (r) => r.item,
    (r) => r.amount,
  );
  if (laborStaffProrated > 0)
    laborByItem.push({ name: "月給スタッフ（日割り）", amount: laborStaffProrated });
  laborByItem.sort((a, b) => b.amount - a.amount);

  const byDate = new Map(records.map((r) => [r.business_date, Number(r.total_sales)]));
  const dailyTrend =
    view === "day"
      ? []
      : datesInRange(range.start, range.end).map((d) => ({
          date: d,
          sales: byDate.get(d) ?? 0,
          hasRecord: byDate.has(d),
        }));

  return {
    view,
    refDate,
    range,
    recordedDays,
    draftDays,
    hasSetup: setup !== null,
    sales,
    guests,
    groups,
    avgSpend: rate(sales, guests),
    cogs,
    laborDaily,
    laborStaffProrated,
    labor,
    variable,
    fixedProrated,
    totalCost,
    operatingProfit,
    flRate: rate(cogs + labor, sales),
    cogsRate: rate(cogs, sales),
    laborRate: rate(labor, sales),
    operatingMarginRate: rate(operatingProfit, sales),
    salesTarget,
    targetRate: salesTarget > 0 ? sales / salesTarget : null,
    landingForecast,
    receivableBalance,
    byCategory,
    byPayment,
    castRanking,
    costByClass,
    variableByItem,
    laborByItem,
    dailyTrend,
  };
}

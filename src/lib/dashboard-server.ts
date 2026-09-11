import { createClient } from "@/lib/supabase/server";
import {
  daysInMonth,
  monthKeyOf,
  proratedFixed,
  proratedStaff,
  proratedLoanRepayment,
  proratedDepreciation,
  fixedMonthlyTotal,
  staffMonthlyTotal,
} from "@/lib/finance";
import {
  periodRange,
  datesInRange,
  addDays,
  type DashView,
  type WeekdayAvg,
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

  // 集計対象の暦日数（休業日・未入力日も含む「日数」。記録がある日数ではない）
  calendarDays: number;
  // 対象月がこの集計時点で終了しているか（月ビューで、月末まで含む場合）
  isMonthComplete: boolean;
  // 固定費・月給の「月末までの設定額（未按分・見込み）」。実績（fixedProrated /
  // laborStaffProrated）との対比表示用。
  fixedMonthlyTotal: number;
  staffMonthlyTotal: number;
  // 借入返済（元金・利息の内訳は未設定のため営業利益には含まない。参考表示専用）
  loanRepaymentProrated: number;
  hasLoanRepaymentLines: boolean;
  // 減価償却（固定費に含めて費用計上するが、現金支出ではない旨の表示用）
  depreciationProrated: number;
  hasDepreciationLines: boolean;

  salesTarget: number;
  targetRate: number | null;

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
  opts?: { detail?: boolean },
): Promise<DashboardData> {
  // detail=false は前月/前年など「比較用の集計値だけ欲しい」呼び出し向け。
  // カテゴリ別・決済別・キャスト別・売掛残高はダッシュボードの比較表示では
  // 使わないため、該当クエリ自体を投げずに往復回数を減らす。
  const detail = opts?.detail ?? true;
  const supabase = await createClient();
  const range = periodRange(view, refDate);
  const monthKey = monthKeyOf(refDate);
  const dim = daysInMonth(refDate);

  // 互いに依存しないクエリは並列で投げ、往復のシーケンス数を減らす
  const [setup, recsResult, tgtResult, recvResult] = await Promise.all([
    loadSetupDataForDate(storeId, refDate),
    supabase
      .from("daily_records")
      .select("id, business_date, status, total_sales, guest_count, group_count")
      .eq("store_id", storeId)
      .gte("business_date", range.start)
      .lte("business_date", range.end)
      .order("business_date"),
    supabase
      .from("monthly_targets")
      .select("sales_target")
      .eq("store_id", storeId)
      .eq("year_month", monthKey)
      .maybeSingle(),
    detail
      ? supabase
          .from("daily_receivable_entries")
          .select("direction, amount, daily_records!inner(store_id, business_date)")
          .eq("daily_records.store_id", storeId)
          .lte("daily_records.business_date", range.end)
      : Promise.resolve({ data: [] as { direction: string; amount: number }[] }),
  ]);

  // 集計範囲に含まれる暦日数（記録の有無・休業日は問わない）。
  // 固定費・月給は「記録がある日数」ではなくこの暦日数で按分する。
  const calendarDays = datesInRange(range.start, range.end).length;
  const isMonthComplete = view === "month" && calendarDays >= dim;

  const records = recsResult.data ?? [];
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
      // 費目別経費（当該/比較の両方で使う）は常に取得
      supabase
        .from("daily_costs")
        .select("cost_class, item, amount")
        .in("daily_record_id", ids),
      detail
        ? supabase
            .from("daily_sales_categories")
            .select("category, amount")
            .in("daily_record_id", ids)
        : Promise.resolve({ data: [] as { category: string; amount: number }[] }),
      detail
        ? supabase
            .from("daily_payments")
            .select("method, amount")
            .in("daily_record_id", ids)
        : Promise.resolve({ data: [] as { method: string; amount: number }[] }),
      detail
        ? supabase
            .from("daily_cast_sales")
            .select(
              "cast_name, nominate_amount, table_amount, companion_amount, back_amount",
            )
            .in("daily_record_id", ids)
        : Promise.resolve({
            data: [] as {
              cast_name: string;
              nominate_amount: number;
              table_amount: number;
              companion_amount: number;
              back_amount: number;
            }[],
          }),
    ]);
    costs = (c1.data ?? []).map((r) => ({
      cost_class: r.cost_class,
      item: r.item,
      amount: Number(r.amount),
    }));
    categories = (c2.data ?? []).map((r) => ({
      category: r.category,
      amount: Number(r.amount),
    }));
    payments = (c3.data ?? []).map((r) => ({
      method: r.method,
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
  // 固定費・月給は「記録がある日数」ではなく暦日数（calendarDays）で按分する。
  // 休業日・未入力日でも家賃や月給は発生するため。月が終了していれば
  // （calendarDays >= dim）設定額の全額になる。
  const fixedProrated = proratedFixed(setup, dim, calendarDays);
  const laborStaffProrated = proratedStaff(setup, dim, calendarDays);
  // 借入返済（元金・利息の内訳未設定）は営業利益に含めない。参考表示専用。
  const loanRepaymentProrated = proratedLoanRepayment(setup, dim, calendarDays);
  const hasLoanRepaymentLines = (setup?.fixedLines ?? []).some((l) => l.category.includes("借入"));
  // 減価償却は固定費（費用）に含めたまま計上するが、非資金費用として別掲する
  const depreciationProrated = proratedDepreciation(setup, dim, calendarDays);
  const hasDepreciationLines = (setup?.fixedLines ?? []).some((l) => l.category.includes("減価償却"));
  const labor = laborDaily + laborStaffProrated;
  const totalCost = cogs + labor + variable + fixedProrated;
  const operatingProfit = sales - totalCost;

  const salesTarget = Number(tgtResult.data?.sales_target ?? 0);
  // 月末着地予測（曜日別平均を使った予測）は loadWeekdayAverages の結果が
  // 必要で、かつダッシュボード表示専用のため dashboard/page.tsx 側の
  // projectMonthEndByWeekday() で計算する（ここでは往復を増やさないよう
  // 計算しない）。

  // 売掛残高（期間末時点の店舗累計。detail=false のときは 0 のまま）
  const recvRows = recvResult.data ?? [];
  const receivableBalance = recvRows.reduce(
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
    calendarDays,
    isMonthComplete,
    fixedMonthlyTotal: fixedMonthlyTotal(setup),
    staffMonthlyTotal: staffMonthlyTotal(setup),
    loanRepaymentProrated,
    hasLoanRepaymentLines,
    depreciationProrated,
    hasDepreciationLines,
    salesTarget,
    targetRate: salesTarget > 0 ? sales / salesTarget : null,
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

const WEEKDAY_LABEL = ["日", "月", "火", "水", "木", "金", "土"];

/** 直近 lookbackDays 日ぶんの記録から、曜日別の平均売上を出す */
export async function loadWeekdayAverages(
  storeId: string,
  uptoDate: string,
  lookbackDays = 90,
): Promise<WeekdayAvg[]> {
  const supabase = await createClient();
  const start = addDays(uptoDate, -lookbackDays);

  const { data } = await supabase
    .from("daily_records")
    .select("business_date, total_sales")
    .eq("store_id", storeId)
    .gte("business_date", start)
    .lte("business_date", uptoDate);

  const buckets = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (const r of data ?? []) {
    const dow = new Date(r.business_date + "T00:00:00Z").getUTCDay();
    buckets[dow].sum += Number(r.total_sales);
    buckets[dow].count += 1;
  }

  // 月曜始まりで並べる
  return [1, 2, 3, 4, 5, 6, 0].map((dow) => ({
    dow,
    label: WEEKDAY_LABEL[dow],
    avg: buckets[dow].count > 0 ? Math.round(buckets[dow].sum / buckets[dow].count) : 0,
    days: buckets[dow].count,
  }));
}

export type MonthlyYoY = {
  monthKey: string; // "YYYY-MM"
  label: string; // "9月"
  curSales: number;
  prevSales: number;
  hasCur: boolean;
  hasPrev: boolean;
};

/** 直近 months ヶ月（既定12）ぶんの月別売上と、その前年同月の売上を並べる */
export async function loadMonthlyYoY(
  storeId: string,
  refDate: string,
  months = 12,
): Promise<MonthlyYoY[]> {
  const supabase = await createClient();
  const [ey, em] = [Number(refDate.slice(0, 4)), Number(refDate.slice(5, 7))];

  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    let yy = ey;
    let mm = em - i;
    while (mm <= 0) {
      mm += 12;
      yy -= 1;
    }
    keys.push(`${yy}-${String(mm).padStart(2, "0")}`);
  }

  const [fy, fm] = keys[0].split("-").map(Number);
  const rangeStart = `${fy - 1}-${String(fm).padStart(2, "0")}-01`;
  const [ly, lm] = keys[keys.length - 1].split("-").map(Number);
  const rangeEnd = `${ly}-${String(lm).padStart(2, "0")}-${String(daysInMonth(keys[keys.length - 1])).padStart(2, "0")}`;

  const { data } = await supabase
    .from("daily_records")
    .select("business_date, total_sales")
    .eq("store_id", storeId)
    .gte("business_date", rangeStart)
    .lte("business_date", rangeEnd);

  const sums = new Map<string, { sum: number; has: boolean }>();
  for (const r of data ?? []) {
    const mk = r.business_date.slice(0, 7);
    const cur = sums.get(mk) ?? { sum: 0, has: false };
    cur.sum += Number(r.total_sales);
    cur.has = true;
    sums.set(mk, cur);
  }

  return keys.map((k) => {
    const [yy, mm] = k.split("-").map(Number);
    const prevKey = `${yy - 1}-${String(mm).padStart(2, "0")}`;
    const cur = sums.get(k);
    const prev = sums.get(prevKey);
    return {
      monthKey: k,
      label: `${mm}月`,
      curSales: cur?.sum ?? 0,
      prevSales: prev?.sum ?? 0,
      hasCur: cur?.has ?? false,
      hasPrev: prev?.has ?? false,
    };
  });
}

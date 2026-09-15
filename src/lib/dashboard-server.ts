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
  shiftYearRef,
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
  cogsByItem: { name: string; amount: number }[];
  variableByItem: { name: string; amount: number }[];
  laborByItem: { name: string; amount: number }[];
  byCounterparty: { name: string; amount: number; cash: number; credit: number }[];
  creditPayable: number;
  dailyTrend: { date: string; sales: number; hasRecord: boolean }[];

  /** 取得に失敗した項目（"0件"と区別するため。空配列なら全項目取得成功） */
  fetchErrors: string[];
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

  type Breakdown = {
    categories: { category: string; amount: number }[];
    payments: { method: string; amount: number }[];
    casts: {
      cast_name: string;
      nominate_amount: number;
      table_amount: number;
      companion_amount: number;
      back_amount: number;
    }[];
  };

  // 互いに依存しないクエリは1回の往復(Promise.all)にまとめる。
  // costs は daily_records!inner(store_id, business_date) の埋め込みJOIN
  // で store_id×期間から直接引く（daily_receivable_entries で既に
  // 使っていたパターンと同じ）。
  const [setup, recsResult, tgtResult, recvResult, costsResult, breakdownResult] =
    await Promise.all([
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
      // 売掛残高は「期間末までの全履歴」を毎回スキャンする必要があり
      // (前日以前からの繰越残高のため)、実測でこの画面の最大のボトルネック
      // だった(2年分・841件を毎回フェッチしてJS側で合計、約2.7秒)。
      // Postgres側で1行の合計だけを返すRPC(receivable_balance, 0010番
      // マイグレーション)に置き換え、行の転送とRLSの行ごとのEXISTS判定を
      // 「1クエリぶんの集計」に減らした。
      detail
        ? supabase.rpc("receivable_balance", { p_store_id: storeId, p_as_of: range.end })
        : Promise.resolve({ data: 0 as number | null }),
      // 費目別経費（当該/比較の両方で使う）は常に取得
      supabase
        .from("daily_costs")
        .select(
          "cost_class, item, amount, counterparty, payment_type, daily_records!inner(store_id, business_date)",
        )
        .eq("daily_records.store_id", storeId)
        .gte("daily_records.business_date", range.start)
        .lte("daily_records.business_date", range.end),
      // カテゴリ別・決済別・キャスト別は、比較表示では使わないので
      // detail=false のときは投げない。3クエリともそれぞれ単独実行でも
      // 約600ms、同時実行では約2秒まで悪化していたのを実測(件数はどれも
      // 30〜45行程度で行数自体が原因ではなく、リクエスト単位の固定コスト
      // が3回分積み重なっていたため)。1回のRPC(dashboard_breakdown、
      // 0011番マイグレーション)にまとめてリクエスト数を3→1に減らした。
      detail
        ? supabase.rpc("dashboard_breakdown", {
            p_store_id: storeId,
            p_start: range.start,
            p_end: range.end,
          })
        : Promise.resolve({ data: { categories: [], payments: [], casts: [] } as Breakdown }),
    ]);
  const breakdown = (breakdownResult.data ?? { categories: [], payments: [], casts: [] }) as Breakdown;

  // 取得失敗を「0円」「データなし」と混同しないよう、失敗した項目名を
  // 記録しておく（? ?? [] / ?? 0 は失敗時も成功時の空扱いと区別できない
  // ため、ここで明示的に .error を見る）。
  const fetchErrors: string[] = [];
  if (recsResult.error) fetchErrors.push("日次実績");
  if (tgtResult.error) fetchErrors.push("月間目標");
  if (costsResult.error) fetchErrors.push("経費内訳");
  if (detail && "error" in recvResult && recvResult.error) fetchErrors.push("売掛残高");
  if (detail && "error" in breakdownResult && breakdownResult.error) fetchErrors.push("カテゴリ・決済・キャスト別");

  // 集計範囲に含まれる暦日数（記録の有無・休業日は問わない）。
  // 固定費・月給は「記録がある日数」ではなくこの暦日数で按分する。
  const calendarDays = datesInRange(range.start, range.end).length;
  const isMonthComplete = view === "month" && calendarDays >= dim;

  const records = recsResult.data ?? [];
  const recordedDays = records.length;
  const draftDays = records.filter((r) => r.status === "draft").length;

  const costs = (costsResult.data ?? []).map((r) => ({
    cost_class: r.cost_class,
    item: r.item,
    amount: Number(r.amount),
    counterparty: r.counterparty as string | null,
    payment_type: r.payment_type as "cash" | "credit",
  }));
  const categories = (breakdown.categories ?? []).map((r) => ({
    category: r.category,
    amount: Number(r.amount),
  }));
  const payments = (breakdown.payments ?? []).map((r) => ({
    method: r.method,
    amount: Number(r.amount),
  }));
  const casts = (breakdown.casts ?? []).map((r) => ({
    cast_name: r.cast_name,
    nominate_amount: Number(r.nominate_amount),
    table_amount: Number(r.table_amount),
    companion_amount: Number(r.companion_amount),
    back_amount: Number(r.back_amount),
  }));

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
  const receivableBalance = Number(recvResult.data ?? 0);

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

  const cogsByItem = groupSum(
    costs.filter((c) => c.cost_class === "cogs"),
    (r) => r.item,
    (r) => r.amount,
  ).sort((a, b) => b.amount - a.amount);

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

  // 取引先別（仕入れ・流動費のみ。人件費・固定費には取引先の概念が無い）
  const counterpartyCosts = costs.filter(
    (c) => (c.cost_class === "cogs" || c.cost_class === "variable") && c.counterparty,
  );
  const counterpartyMap = new Map<string, { amount: number; cash: number; credit: number }>();
  for (const c of counterpartyCosts) {
    const key = c.counterparty as string;
    const cur = counterpartyMap.get(key) ?? { amount: 0, cash: 0, credit: 0 };
    cur.amount += c.amount;
    if (c.payment_type === "credit") cur.credit += c.amount;
    else cur.cash += c.amount;
    counterpartyMap.set(key, cur);
  }
  const byCounterparty = [...counterpartyMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.amount - a.amount);
  const creditPayable = counterpartyCosts
    .filter((c) => c.payment_type === "credit")
    .reduce((s, c) => s + c.amount, 0);

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
    cogsByItem,
    variableByItem,
    laborByItem,
    byCounterparty,
    creditPayable,
    dailyTrend,
    fetchErrors,
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
  label: string; // "'26/9"（年をまたぐため年を明記）
  curSales: number;
  prevSales: number;
  hasCur: boolean;
  hasPrev: boolean;
  curRange: { start: string; end: string };
  prevRange: { start: string; end: string };
  /** 対象期間側がその月の途中まで（まだ終わっていない月）で打ち切られているか */
  isPartial: boolean;
};

/**
 * 直近 months ヶ月（既定12）ぶんの月別売上と、その前年同期間の売上を並べる。
 *
 * 対象月（＝ refDate の月）がまだ終わっていない場合、その月の実績は
 * refDate までしか存在しない。それを「前年同月・月全体」と比べると
 * 数字が大きく食い違うため（例: 今月10日ぶんの実績 vs 前年の丸々1ヶ月）、
 * 対象月が途中のときは前年側も同じ日数（shiftYearRef で閏年を吸収）に
 * 揃える。それ以外の完了済みの月は、両年とも月全体で比較する。
 */
export async function loadMonthlyYoY(
  storeId: string,
  refDate: string,
  months = 12,
): Promise<MonthlyYoY[]> {
  const supabase = await createClient();
  const [ey, em] = [Number(refDate.slice(0, 4)), Number(refDate.slice(5, 7))];
  const dayOfMonth = Number(refDate.slice(8));
  const dimOfRef = daysInMonth(refDate);
  const refIsPartial = dayOfMonth < dimOfRef;

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
  const lastKey = keys[keys.length - 1]; // == refDate の年月

  const [fy, fm] = keys[0].split("-").map(Number);
  const rangeStart = `${fy - 1}-${String(fm).padStart(2, "0")}-01`;
  const rangeEnd = refIsPartial ? refDate : `${lastKey}-${String(dimOfRef).padStart(2, "0")}`;

  const { data } = await supabase
    .from("daily_records")
    .select("business_date, total_sales")
    .eq("store_id", storeId)
    .gte("business_date", rangeStart)
    .lte("business_date", rangeEnd);
  const rows = data ?? [];

  const sumInRange = (start: string, end: string) => {
    let sum = 0;
    let has = false;
    for (const r of rows) {
      if (r.business_date >= start && r.business_date <= end) {
        sum += Number(r.total_sales);
        has = true;
      }
    }
    return { sum, has };
  };

  return keys.map((k) => {
    const [yy, mm] = k.split("-").map(Number);
    const isLastPartial = k === lastKey && refIsPartial;

    const curStart = `${k}-01`;
    const curEnd = isLastPartial ? refDate : `${k}-${String(daysInMonth(k)).padStart(2, "0")}`;

    const prevKey = `${yy - 1}-${String(mm).padStart(2, "0")}`;
    const prevStart = `${prevKey}-01`;
    // 対象月が途中のときは、前年側も同じ日数までに揃える（うるう年で同日が
    // 存在しない場合は shiftYearRef が前年対象月の末日にクリップする）。
    const prevEnd = isLastPartial
      ? shiftYearRef(curEnd, -1)
      : `${prevKey}-${String(daysInMonth(prevKey)).padStart(2, "0")}`;

    const cur = sumInRange(curStart, curEnd);
    const prev = sumInRange(prevStart, prevEnd);

    return {
      monthKey: k,
      // 月名だけだと年をまたぐ12ヶ月表示で「どの年の何月か」が分からず紛らわしい
      // ため、年を明記する（例: '25/10）。
      label: `'${String(yy).slice(2)}/${mm}`,
      curSales: cur.sum,
      prevSales: prev.sum,
      hasCur: cur.has,
      hasPrev: prev.has,
      curRange: { start: curStart, end: curEnd },
      prevRange: { start: prevStart, end: prevEnd },
      isPartial: isLastPartial,
    };
  });
}

function monthKeysBack(refDate: string, months: number): string[] {
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
  return keys;
}
const monthLabelOf = (k: string) => {
  const [yy, mm] = k.split("-").map(Number);
  return `'${String(yy).slice(2)}/${mm}`;
};

const PAGE_SIZE = 1000;
/**
 * Supabase/PostgRESTは1クエリあたり既定で最大1000行しか返さない。
 * 複数ヶ月分の daily_costs のように1000行を超えうる集計では、
 * .range() でページングして全件取得しないと黙って集計が欠落する。
 */
/**
 * 取得中にエラーが起きても例外は投げず、それまでに取れた行だけを返す
 * （経費分析ページの1セクションの一時的な取得失敗でページ全体を
 * 500エラーにしないため。ダッシュボードの fetchErrors と同様の考え方）。
 */
async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) break;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

export type MonthlyFlRate = { monthKey: string; label: string; flRate: number | null; hasData: boolean };

/**
 * 月次のFLコスト率（(原価+人件費)÷売上）推移。経費分析ページの傾向表示用。
 * 注: 月給スタッフ（月初セットアップの日割り分）は日次の daily_costs に
 * 存在しないため含まない。ダッシュボードのFLコスト率（月給を含む）とは
 * 完全には一致しない、日次記録ベースの簡易版。
 */
export async function loadFlRateTrend(
  storeId: string,
  refDate: string,
  months = 12,
): Promise<MonthlyFlRate[]> {
  const supabase = await createClient();
  const keys = monthKeysBack(refDate, months);
  const rangeStart = `${keys[0]}-01`;
  const lastKeyDim = daysInMonth(keys[keys.length - 1] + "-01");
  const rangeEnd = `${keys[keys.length - 1]}-${String(lastKeyDim).padStart(2, "0")}`;

  const [{ data: recs }, costs] = await Promise.all([
    supabase
      .from("daily_records")
      .select("business_date, total_sales")
      .eq("store_id", storeId)
      .gte("business_date", rangeStart)
      .lte("business_date", rangeEnd),
    fetchAllRows<{ amount: number; daily_records: { business_date: string } | { business_date: string }[] }>(
      (from, to) =>
        supabase
          .from("daily_costs")
          .select("cost_class, amount, daily_records!inner(store_id, business_date)")
          .eq("daily_records.store_id", storeId)
          .in("cost_class", ["cogs", "labor"])
          .gte("daily_records.business_date", rangeStart)
          .lte("daily_records.business_date", rangeEnd)
          .order("id")
          .range(from, to),
    ),
  ]);

  const salesByMonth = new Map<string, number>();
  for (const r of recs ?? []) {
    const mk = r.business_date.slice(0, 7);
    salesByMonth.set(mk, (salesByMonth.get(mk) ?? 0) + Number(r.total_sales));
  }
  const costByMonth = new Map<string, number>();
  for (const c of costs) {
    const dr = Array.isArray(c.daily_records) ? c.daily_records[0] : c.daily_records;
    const mk = dr.business_date.slice(0, 7);
    costByMonth.set(mk, (costByMonth.get(mk) ?? 0) + Number(c.amount));
  }

  return keys.map((k) => {
    const sales = salesByMonth.get(k) ?? 0;
    const cost = costByMonth.get(k) ?? 0;
    return {
      monthKey: k,
      label: monthLabelOf(k),
      flRate: sales > 0 ? cost / sales : null,
      hasData: salesByMonth.has(k),
    };
  });
}

export type EntityMonthlyTrend = {
  name: string;
  monthly: { monthKey: string; label: string; amount: number }[];
  total: number;
};

/** 取引先別（仕入れ・流動費）の月次コスト推移。合計降順で上位 topN 件のみ。 */
export async function loadCounterpartyTrend(
  storeId: string,
  refDate: string,
  months = 3,
  topN = 8,
): Promise<EntityMonthlyTrend[]> {
  const supabase = await createClient();
  const keys = monthKeysBack(refDate, months);
  const rangeStart = `${keys[0]}-01`;
  const lastKeyDim = daysInMonth(keys[keys.length - 1] + "-01");
  const rangeEnd = `${keys[keys.length - 1]}-${String(lastKeyDim).padStart(2, "0")}`;

  const data = await fetchAllRows<{
    amount: number;
    counterparty: string | null;
    daily_records: { business_date: string } | { business_date: string }[];
  }>((from, to) =>
    supabase
      .from("daily_costs")
      .select("amount, counterparty, daily_records!inner(store_id, business_date)")
      .eq("daily_records.store_id", storeId)
      .in("cost_class", ["cogs", "variable"])
      .not("counterparty", "is", null)
      .gte("daily_records.business_date", rangeStart)
      .lte("daily_records.business_date", rangeEnd)
      .order("id")
      .range(from, to),
  );

  const byName = new Map<string, Map<string, number>>();
  for (const c of data) {
    const dr = Array.isArray(c.daily_records) ? c.daily_records[0] : c.daily_records;
    const mk = dr.business_date.slice(0, 7);
    const name = c.counterparty as string;
    if (!byName.has(name)) byName.set(name, new Map());
    const mm = byName.get(name)!;
    mm.set(mk, (mm.get(mk) ?? 0) + Number(c.amount));
  }

  return [...byName.entries()]
    .map(([name, mm]) => {
      const monthly = keys.map((k) => ({ monthKey: k, label: monthLabelOf(k), amount: mm.get(k) ?? 0 }));
      return { name, monthly, total: monthly.reduce((s, m) => s + m.amount, 0) };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, topN);
}

/** スタッフ別（時給）人件費の月次推移。 */
export async function loadStaffTrend(
  storeId: string,
  refDate: string,
  months = 3,
): Promise<EntityMonthlyTrend[]> {
  const supabase = await createClient();
  const keys = monthKeysBack(refDate, months);
  const rangeStart = `${keys[0]}-01`;
  const lastKeyDim = daysInMonth(keys[keys.length - 1] + "-01");
  const rangeEnd = `${keys[keys.length - 1]}-${String(lastKeyDim).padStart(2, "0")}`;

  const [costs, { data: staff }] = await Promise.all([
    fetchAllRows<{
      amount: number;
      staff_id: string | null;
      daily_records: { business_date: string } | { business_date: string }[];
    }>((from, to) =>
      supabase
        .from("daily_costs")
        .select("amount, staff_id, daily_records!inner(store_id, business_date)")
        .eq("daily_records.store_id", storeId)
        .eq("cost_class", "labor")
        .not("staff_id", "is", null)
        .gte("daily_records.business_date", rangeStart)
        .lte("daily_records.business_date", rangeEnd)
        .order("id")
        .range(from, to),
    ),
    supabase.from("staff_members").select("id, name").eq("store_id", storeId),
  ]);
  const nameOf = new Map((staff ?? []).map((s) => [s.id, s.name]));

  const byId = new Map<string, Map<string, number>>();
  for (const c of costs) {
    const dr = Array.isArray(c.daily_records) ? c.daily_records[0] : c.daily_records;
    const mk = dr.business_date.slice(0, 7);
    const id = c.staff_id as string;
    if (!byId.has(id)) byId.set(id, new Map());
    const mm = byId.get(id)!;
    mm.set(mk, (mm.get(mk) ?? 0) + Number(c.amount));
  }

  return [...byId.entries()]
    .map(([id, mm]) => {
      const monthly = keys.map((k) => ({ monthKey: k, label: monthLabelOf(k), amount: mm.get(k) ?? 0 }));
      return { name: nameOf.get(id) ?? "（削除済みスタッフ）", monthly, total: monthly.reduce((s, m) => s + m.amount, 0) };
    })
    .sort((a, b) => b.total - a.total);
}

/**
 * 損益計算（純粋関数）。サーバー・クライアント両方から使う。
 * 日割り = 月額 ÷ その月の実日数（行ごとに四捨五入して合算）。
 */

/** "2026-09-07" or "2026-09" → その月の実日数 */
export function daysInMonth(dateOrMonth: string): number {
  const [y, m] = dateOrMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "2026-09-07" → "2026-09-01"（対象月の1日） */
export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

/** "2026-09-01" → "2026年9月" */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y}年${m}月`;
}

export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export type MonthlySetupData = {
  fixedLines: { item: string; category: string; amountMonthly: number }[];
  staff: { staffName: string; amountMonthly: number }[];
};

/** 分類名から「借入返済」の行を判定する（元金/利息の内訳が分からないため
 *  営業利益には含めない。UI 側のプリセット文言に依存する簡易判定）。 */
export const isLoanRepaymentLine = (category: string) => category.includes("借入");
/** 分類名から「減価償却」の行を判定する（費用としては計上するが非資金）。 */
export const isDepreciationLine = (category: string) => category.includes("減価償却");

const sumMonthly = (lines: { amountMonthly: number }[]) =>
  lines.reduce((acc, l) => acc + l.amountMonthly, 0);

/**
 * 期間按分（固定費・月給 共通ロジック）。
 * - 対象月がその集計対象日時点で終了している（elapsedDays >= dim）場合は、
 *   月額の合計をそのまま返す（行ごとに丸めた値を積み上げないので、月合計が
 *   設定額からズレない）。
 * - 月の途中（elapsedDays < dim）は、月合計を「暦日数」で按分する
 *   （日次入力の有無・休業日は関係ない。一回だけ丸める）。
 * - elapsedDays は「その集計範囲に含まれる暦日数」であって、記録がある
 *   日数ではない。呼び出し側は必ず日付範囲の暦日数を渡すこと。
 */
function proratedTotal(total: number, dim: number, elapsedDays: number): number {
  if (dim <= 0 || elapsedDays <= 0) return 0;
  if (elapsedDays >= dim) return Math.round(total);
  return Math.round((total * elapsedDays) / dim);
}

/** 固定費のうち営業利益に含める分（＝「借入返済」を除く）の期間按分額。 */
export const proratedFixed = (
  s: MonthlySetupData | null,
  dim: number,
  elapsedDays: number,
) =>
  !s
    ? 0
    : proratedTotal(
        sumMonthly(s.fixedLines.filter((l) => !isLoanRepaymentLine(l.category))),
        dim,
        elapsedDays,
      );

/** 月給スタッフの期間按分額。 */
export const proratedStaff = (
  s: MonthlySetupData | null,
  dim: number,
  elapsedDays: number,
) => (!s ? 0 : proratedTotal(sumMonthly(s.staff), dim, elapsedDays));

/** 固定費のうち「借入返済」（元金・利息の内訳未設定）の期間按分額。
 *  営業利益には含めない、参考表示専用の値。 */
export const proratedLoanRepayment = (
  s: MonthlySetupData | null,
  dim: number,
  elapsedDays: number,
) =>
  !s
    ? 0
    : proratedTotal(
        sumMonthly(s.fixedLines.filter((l) => isLoanRepaymentLine(l.category))),
        dim,
        elapsedDays,
      );

/** 固定費のうち「減価償却」（非資金費用。営業利益には含む）の期間按分額。 */
export const proratedDepreciation = (
  s: MonthlySetupData | null,
  dim: number,
  elapsedDays: number,
) =>
  !s
    ? 0
    : proratedTotal(
        sumMonthly(s.fixedLines.filter((l) => isDepreciationLine(l.category))),
        dim,
        elapsedDays,
      );

/** 固定費（借入返済を除く）の月額合計（未按分・設定そのまま）。月末見込み表示用。 */
export const fixedMonthlyTotal = (s: MonthlySetupData | null) =>
  !s ? 0 : sumMonthly(s.fixedLines.filter((l) => !isLoanRepaymentLine(l.category)));

/** 月給スタッフの月額合計（未按分）。月末見込み表示用。 */
export const staffMonthlyTotal = (s: MonthlySetupData | null) =>
  !s ? 0 : sumMonthly(s.staff);

export type DayFinancials = {
  sales: number;
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
};

const rate = (num: number, den: number) => (den > 0 ? num / den : null);

/**
 * 1営業日の損益。
 * - cogs: 仕入（原価）
 * - laborDaily: 日次入力の人件費（時給＋日払い＋キャストバック）
 * - variable: 日次入力の流動費
 * - setup: その月の月初セットアップ（固定費・月給スタッフ）
 */
export function computeDay(
  input: { sales: number; cogs: number; laborDaily: number; variable: number },
  setup: MonthlySetupData | null,
  dim: number,
): DayFinancials {
  // 1 営業日ぶんの按分（暦日 1 日として計算。休業日でも家賃等は発生するため
  // 「記録があるか」ではなく常に 1 日として扱う）
  const fixedProrated = proratedFixed(setup, dim, 1);
  const laborStaffProrated = proratedStaff(setup, dim, 1);
  const labor = input.laborDaily + laborStaffProrated;
  const totalCost = input.cogs + labor + input.variable + fixedProrated;
  const operatingProfit = input.sales - totalCost;

  return {
    sales: input.sales,
    cogs: input.cogs,
    laborDaily: input.laborDaily,
    laborStaffProrated,
    labor,
    variable: input.variable,
    fixedProrated,
    totalCost,
    operatingProfit,
    flRate: rate(input.cogs + labor, input.sales),
    cogsRate: rate(input.cogs, input.sales),
    laborRate: rate(labor, input.sales),
    operatingMarginRate: rate(operatingProfit, input.sales),
  };
}

export const pct = (r: number | null) =>
  r === null ? "—" : (r * 100).toFixed(1) + "%";

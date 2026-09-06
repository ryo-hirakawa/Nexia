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

export const proratedFixed = (s: MonthlySetupData | null, dim: number) =>
  !s || dim <= 0
    ? 0
    : s.fixedLines.reduce((acc, l) => acc + Math.round(l.amountMonthly / dim), 0);

export const proratedStaff = (s: MonthlySetupData | null, dim: number) =>
  !s || dim <= 0
    ? 0
    : s.staff.reduce((acc, l) => acc + Math.round(l.amountMonthly / dim), 0);

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
  const fixedProrated = proratedFixed(setup, dim);
  const laborStaffProrated = proratedStaff(setup, dim);
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

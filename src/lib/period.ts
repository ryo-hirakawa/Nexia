/**
 * ダッシュボードの期間ロジック（純粋関数）。
 * 週は月曜始まり・日曜締め、ただし月をまたがない（月初・月末で切る）。
 */
import { daysInMonth } from "@/lib/finance";

export type DashView = "day" | "week" | "month";

const toUTC = (d: string) => new Date(d + "T00:00:00Z");
const fmt = (dt: Date) => dt.toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmt(dt);
}

export function monthStart(d: string): string {
  return d.slice(0, 7) + "-01";
}
export function monthEnd(d: string): string {
  return d.slice(0, 7) + "-" + String(daysInMonth(d)).padStart(2, "0");
}

/** その日の週の月曜（ISO週） */
export function weekStartMon(d: string): string {
  const dt = toUTC(d);
  const back = (dt.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(d, -back);
}
export function weekEndSun(d: string): string {
  return addDays(weekStartMon(d), 6);
}

export const maxDate = (a: string, b: string) => (a >= b ? a : b);
export const minDate = (a: string, b: string) => (a <= b ? a : b);

export function periodRange(
  view: DashView,
  ref: string,
): { start: string; end: string } {
  if (view === "day") return { start: ref, end: ref };
  if (view === "week") {
    return {
      start: maxDate(monthStart(ref), weekStartMon(ref)),
      end: minDate(monthEnd(ref), weekEndSun(ref)),
    };
  }
  // month: 月初 〜 参照日（月内）＝ 営業日の累計（月末を超えない）
  return { start: monthStart(ref), end: minDate(ref, monthEnd(ref)) };
}

const WD = ["日", "月", "火", "水", "木", "金", "土"];
export function weekdayJa(d: string): string {
  return WD[toUTC(d).getUTCDay()];
}

export function fmtMD(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

/** 月/日 + 曜日。例: "8/31(月)" — グラフの日付ラベルなど、曜日を併記したい箇所用 */
export function fmtMDW(d: string): string {
  return `${fmtMD(d)}(${weekdayJa(d)})`;
}

export function periodLabel(view: DashView, ref: string): string {
  const [y, m] = ref.split("-").map(Number);
  if (view === "day") return `${y}年${m}月${Number(ref.slice(8))}日（${weekdayJa(ref)}）`;
  if (view === "month") {
    const r = periodRange("month", ref);
    return `${y}年${m}月（${fmtMD(r.start)}〜${fmtMD(r.end)}）`;
  }
  const r = periodRange("week", ref);
  return `${fmtMD(r.start)}（${weekdayJa(r.start)}）〜 ${fmtMD(r.end)}（${weekdayJa(r.end)}）`;
}

/** ◀ / ▶ で参照日を動かす。day=±1日, week=±7日, month=±1ヶ月 */
export function shiftRef(view: DashView, ref: string, dir: 1 | -1): string {
  if (view === "day") return addDays(ref, dir);
  if (view === "week") return addDays(ref, dir * 7);
  const [y, m, d] = ref.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + dir, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth() + 1;
  const dim = daysInMonth(`${ty}-${String(tm).padStart(2, "0")}`);
  const day = Math.min(d, dim);
  return `${ty}-${String(tm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 期間内の各営業日（記録の有無に関わらず日付の並び） */
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** ちょうど1年前の同じ月日（存在しない日は月末に丸める＝2/29対策） */
export function shiftYearRef(ref: string, n: number): string {
  const [y, m, d] = ref.split("-").map(Number);
  const ny = y + n;
  const dim = daysInMonth(`${ny}-${String(m).padStart(2, "0")}`);
  const day = Math.min(d, dim);
  return `${ny}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type WeekdayAvg = { dow: number; label: string; avg: number; days: number };

export type MonthEndProjection = {
  forecast: number;
  /** false のときは予測に必要なデータが不足している（0円の予測は出さない） */
  hasEnoughData: boolean;
};

/**
 * 曜日別平均（loadWeekdayAverages の結果）を使って月末売上を予測する。
 * - 経過日数ぶんは実績（salesSoFar）をそのまま使う。
 * - 残りの暦日は、その曜日の平均（直近90日）を1日ずつ積み上げる。定休日は
 *   その曜日の平均が自然に0円になるので、暦日一律の日割りに比べて
 *   休業日・繁忙曜日（金・土など）の偏りの影響を受けにくい。
 * - 大型連休など単発のイベントは曜日平均には表れないため、この予測には
 *   反映されない（呼び出し側の UI で明示すること）。
 *
 * hasEnoughData は「集計対象日が月の途中か」だけで決める（売上0円そのものは
 * 有効な実績であり、それだけを理由にデータ不足とはしない）。入力済みの
 * 確定記録が1件もない、という判定は呼び出し側で別途行うこと。
 */
export function projectMonthEndByWeekday(
  refDate: string,
  salesSoFar: number,
  weekdayAverages: WeekdayAvg[],
): MonthEndProjection {
  const dim = daysInMonth(refDate);
  const monthKey = refDate.slice(0, 7);
  const dayOfMonth = Number(refDate.slice(8));
  if (dayOfMonth <= 0 || dayOfMonth >= dim) {
    return { forecast: 0, hasEnoughData: false };
  }
  const avgByDow = new Map(weekdayAverages.map((w) => [w.dow, w.avg]));
  let remaining = 0;
  for (let day = dayOfMonth + 1; day <= dim; day++) {
    const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
    const dow = new Date(dateStr + "T00:00:00Z").getUTCDay();
    remaining += avgByDow.get(dow) ?? 0;
  }
  return { forecast: Math.round(salesSoFar + remaining), hasEnoughData: true };
}

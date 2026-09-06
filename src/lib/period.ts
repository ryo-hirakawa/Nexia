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

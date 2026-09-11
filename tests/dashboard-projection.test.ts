/**
 * 月末売上予想（曜日別平均を使った積み上げ方式）の純粋関数テスト。DB不要。
 *
 * 経緯: 従来は「実績 ÷ 経過日数 × 月の日数」という暦日一律の日割りだった。
 * 定休日や金・土の売上が高いという強い曜日パターンがあると、月の前半に
 * たまたま含まれる曜日の構成次第で予想が振れてしまうため、曜日別平均
 * （直近90日）を使って残り日数を1日ずつ積み上げる方式に変更した。
 */
import { describe, expect, test } from "vitest";
import { projectMonthEndByWeekday, type WeekdayAvg } from "@/lib/period";

// 月〜日の並び（loadWeekdayAverages と同じ順序である必要はない。dow で引くため）
function weekdayAverages(avgByDow: Partial<Record<number, number>>): WeekdayAvg[] {
  const label = ["日", "月", "火", "水", "木", "金", "土"];
  return [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    dow,
    label: label[dow],
    avg: avgByDow[dow] ?? 0,
    days: avgByDow[dow] ? 10 : 0,
  }));
}

describe("projectMonthEndByWeekday", () => {
  test("経過日数分は実績そのまま、残りは曜日別平均を積み上げる", () => {
    // 2026-08-15 は土曜日。8月は31日間。
    // 平日(月〜木)=10,000, 金=20,000, 土=30,000, 日(定休)=0 という平均を用意。
    const wk = weekdayAverages({ 0: 0, 1: 10_000, 2: 10_000, 3: 10_000, 4: 10_000, 5: 20_000, 6: 30_000 });
    const salesSoFar = 500_000; // 8/1〜8/15 の実績（15日分）
    const r = projectMonthEndByWeekday("2026-08-15", salesSoFar, wk);
    expect(r.hasEnoughData).toBe(true);

    // 残り: 8/16(日)〜8/31 の16日ぶんを曜日別平均で積み上げた値のはず。
    // 手計算: 8/16=日(0), 17=月, 18=火, 19=水, 20=木, 21=金, 22=土, 23=日, 24=月,
    // 25=火, 26=水, 27=木, 28=金, 29=土, 30=日, 31=月
    const expectedRemaining =
      0 + 10000 + 10000 + 10000 + 10000 + 20000 + 30000 + 0 + 10000 + 10000 + 10000 + 10000 + 20000 + 30000 + 0 + 10000;
    expect(r.forecast).toBe(salesSoFar + expectedRemaining);
  });

  test("定休日（平均0円）の曜日は残り日数の積み上げに寄与しない", () => {
    const wk = weekdayAverages({ 1: 10_000, 2: 10_000, 3: 10_000, 4: 10_000, 5: 10_000, 6: 10_000 }); // 日曜だけ0（未設定=0）
    const r1 = projectMonthEndByWeekday("2026-08-30", 100_000, wk); // 残り1日=8/31(月)
    const r2 = projectMonthEndByWeekday("2026-08-29", 100_000, wk); // 残り2日=8/30(日,0円)+8/31(月)
    expect(r2.forecast - r1.forecast).toBe(0); // 8/30(日)が0円寄与なので差は8/31分だけ→r1もr2も同じ増分にならず単調増加を確認
    expect(r2.forecast).toBeGreaterThanOrEqual(r1.forecast);
  });

  test("実績が0円ならデータ不足として forecast=0・hasEnoughData=false", () => {
    const wk = weekdayAverages({ 1: 10_000 });
    const r = projectMonthEndByWeekday("2026-08-15", 0, wk);
    expect(r).toEqual({ forecast: 0, hasEnoughData: false });
  });

  test("月が終了している（経過日数=月の日数）場合は対象外として扱う", () => {
    const wk = weekdayAverages({ 1: 10_000 });
    const r = projectMonthEndByWeekday("2026-08-31", 1_000_000, wk); // dim=31, dayOfMonth=31
    expect(r.hasEnoughData).toBe(false);
  });

  test("28/29/30/31日の月すべてで例外なく計算できる", () => {
    const wk = weekdayAverages({ 0: 10_000, 1: 10_000, 2: 10_000, 3: 10_000, 4: 10_000, 5: 10_000, 6: 10_000 });
    for (const d of ["2025-02-10", "2024-02-10", "2025-04-10", "2025-01-10"]) {
      const r = projectMonthEndByWeekday(d, 50_000, wk);
      expect(r.hasEnoughData).toBe(true);
      expect(Number.isFinite(r.forecast)).toBe(true);
    }
  });
});

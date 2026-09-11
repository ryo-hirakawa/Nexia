/**
 * 固定費・月給の期間按分ロジック（純粋関数・DB不要）。
 *
 * 経緯: 月次集計の固定費・月給が「月額 ÷ 月の実日数 × 記録がある日数」に
 * なっており、休業日や未入力日があると月末でも月額全額に届かないバグが
 * あった（例: 7月 固定費 433,000円のはずが 377,136円しか反映されない）。
 * ここでは「休業日・未入力日があっても、月が終了していれば月額全額になる」
 * 「月の途中は暦日数で按分する（記録日数ではない）」ことを固定する。
 */
import { describe, expect, test } from "vitest";
import {
  proratedFixed,
  proratedStaff,
  proratedLoanRepayment,
  fixedMonthlyTotal,
  staffMonthlyTotal,
  daysInMonth,
  type MonthlySetupData,
} from "../src/lib/finance";

const setupOf = (fixedTotal: number, staffTotal: number, extra: { item: string; category: string; amountMonthly: number }[] = []): MonthlySetupData => ({
  fixedLines: [
    { item: "店舗家賃", category: "地代家賃", amountMonthly: fixedTotal },
    ...extra,
  ],
  staff: [{ staffName: "店長", amountMonthly: staffTotal }],
});

describe("固定費・月給の期間按分", () => {
  test("31日の月・記録27日でも、月が終了していれば月額全額になる", () => {
    const setup = setupOf(433_000, 680_000);
    const dim = daysInMonth("2026-07"); // 31
    expect(dim).toBe(31);
    // 集計対象日までの「暦日数」が月の日数と同じ＝月が終了している
    expect(proratedFixed(setup, dim, 31)).toBe(433_000);
    expect(proratedStaff(setup, dim, 31)).toBe(680_000);
    // 記録が27日分しかなくても関係ない（休業日・未入力日があっても影響しない）
    // ＝ calendarDays（暦日数）は「記録日数」ではなく「集計範囲の暦日数」なので、
    // 27 という記録日数を渡してしまう呼び出し方はそもそも起きない設計になっている。
  });

  test.each([28, 29, 30, 31])("%s日の月でも、月末（calendarDays=dim）で全額になる", (dim) => {
    const setup = setupOf(310_000, 500_000);
    expect(proratedFixed(setup, dim, dim)).toBe(310_000);
    expect(proratedStaff(setup, dim, dim)).toBe(500_000);
  });

  test("月の途中は、記録日数ではなく暦日数で按分する", () => {
    const setup = setupOf(310_000, 310_000);
    const dim = 31;
    // 15日目まで（休業日・未入力日を含めて15暦日）
    const fixed15 = proratedFixed(setup, dim, 15);
    expect(fixed15).toBe(Math.round((310_000 * 15) / 31));
    // 記録が10日分しかなくても、暦日数(15)で按分されることを確認
    // （記録日数を渡さない設計なので、10という値は按分に一切使われない）
    expect(fixed15).not.toBe(Math.round((310_000 * 10) / 31));
  });

  test("月の途中の按分を積み上げても、月末は必ず設定額と一致する（丸め誤差の蓄積がない）", () => {
    // 複数行・割り切れない額（丸めがズレやすいケース）で、
    // 「月末は必ず全額」という仕様により、途中経過にかかわらず一致することを確認
    const dim = 31;
    const setup = setupOf(100_000, 0, [
      { item: "保険料", category: "保険料", amountMonthly: 8_333 },
      { item: "通信費", category: "通信・サブスク", amountMonthly: 12_345 },
    ]);
    const total = 100_000 + 8_333 + 12_345;
    for (let d = 1; d <= dim; d++) {
      const v = proratedFixed(setup, dim, d);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(total);
    }
    expect(proratedFixed(setup, dim, dim)).toBe(total);
  });

  test("elapsedDays が 0 以下・setup が null なら 0", () => {
    const setup = setupOf(100_000, 200_000);
    expect(proratedFixed(setup, 31, 0)).toBe(0);
    expect(proratedFixed(null, 31, 15)).toBe(0);
    expect(proratedStaff(null, 31, 15)).toBe(0);
  });

  test("借入返済は固定費（営業利益に影響する額）に含めない", () => {
    const setup = setupOf(200_000, 0, [
      { item: "借入返済", category: "借入返済", amountMonthly: 60_000 },
    ]);
    const dim = 31;
    // 固定費（営業利益に影響）には 200,000 のみ含まれ、借入返済 60,000 は除外される
    expect(proratedFixed(setup, dim, dim)).toBe(200_000);
    // 借入返済は別枠で参照でき、内訳（元金/利息）は分けない前提の合計値
    expect(proratedLoanRepayment(setup, dim, dim)).toBe(60_000);
  });

  test("fixedMonthlyTotal / staffMonthlyTotal は按分せず設定の月額合計を返す（借入返済は除く）", () => {
    const setup = setupOf(300_000, 450_000, [
      { item: "借入返済", category: "借入返済", amountMonthly: 60_000 },
    ]);
    expect(fixedMonthlyTotal(setup)).toBe(300_000);
    expect(staffMonthlyTotal(setup)).toBe(450_000);
  });
});

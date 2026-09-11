/**
 * 比較差分（前月比など）の判定ロジック。純粋関数・DB不要。
 *
 * 経緯: 営業利益が前日の赤字(-4,867円)から黒字(+31,733円)に転換したのに、
 * 通常の％計算（(cur-prev)/prev）にかけると分母がマイナスで符号が反転し、
 * 「-752.0%」「営業利益が悪化しています」という逆の判定になっていた。
 * また FL率の低下（良いこと）に上向き矢印▲が付く、丸め誤差で「-0.0pt」に
 * なる、といった表示の不具合もあった。
 */
import { describe, expect, test } from "vitest";
import { deltaPct, deltaPt, deltaAmount, directionArrow } from "@/lib/delta";

describe("deltaAmount（営業利益など、マイナスもあり得る金額の差）", () => {
  test("実例: 前日−4,867円 → 当日+31,733円 は黒字転換・36,600円改善と判定する", () => {
    const d = deltaAmount(31_733, -4_867, "前日比");
    expect(d.tone).toBe("good");
    expect(d.direction).toBe("up");
    expect(d.text).toContain("黒字転換");
    expect(d.text).toContain("36,600");
    expect(d.text).not.toContain("%"); // 符号が絡むときは％を出さない
  });

  test("黒字→赤字は「赤字転落」、悪化色になる", () => {
    const d = deltaAmount(-1_000, 5_000, "前日比");
    expect(d.tone).toBe("bad");
    expect(d.direction).toBe("down");
    expect(d.text).toContain("赤字転落");
  });

  test("両方赤字で悪化（より赤字が拡大）は「赤字拡大」", () => {
    const d = deltaAmount(-10_000, -3_000, "前日比");
    expect(d.tone).toBe("bad");
    expect(d.direction).toBe("down");
    expect(d.text).toContain("赤字拡大");
  });

  test("両方赤字で改善（赤字が縮小）は「赤字縮小」", () => {
    const d = deltaAmount(-3_000, -10_000, "前日比");
    expect(d.tone).toBe("good");
    expect(d.direction).toBe("up");
    expect(d.text).toContain("赤字縮小");
  });

  test("両方0以上・前期>0のときは通常どおり％で表示する", () => {
    const d = deltaAmount(120_000, 100_000, "前月比");
    expect(d.tone).toBe("good");
    expect(d.direction).toBe("up");
    expect(d.text).toContain("%");
    expect(d.text).not.toContain("黒字転換");
  });

  test("前期が0円ちょうどのときはデータなし扱い（0除算を避ける）", () => {
    const d = deltaAmount(0, 0, "前月比");
    expect(d.short).toBe("±0%");
    const d2 = deltaAmount(1000, 0, "前月比");
    expect(d2.text).toContain("データなし");
  });
});

describe("directionArrow（矢印は数値の増減のみ、良化/悪化とは独立）", () => {
  test("FL率が下がった（良いこと）ときも矢印は下向き", () => {
    // FL率 70% → 65%（改善・良化）だが、数値としては下がっている
    const d = deltaPt(0.65, 0.70, "前日比");
    expect(d.tone).toBe("good"); // 良化
    expect(d.direction).toBe("down"); // でも数値は減っている
    expect(directionArrow(d.direction)).toBe("↓ ");
  });

  test("FL率が上がった（悪いこと）ときは矢印は上向き", () => {
    const d = deltaPt(0.72, 0.70, "前日比");
    expect(d.tone).toBe("bad");
    expect(d.direction).toBe("up");
    expect(directionArrow(d.direction)).toBe("↑ ");
  });
});

describe("丸め誤差での -0.0 表示を防ぐ", () => {
  test("deltaPt: ごくわずかな差は 0.0pt・横ばい扱いになる（-0.0pt にならない）", () => {
    const d = deltaPt(0.7001, 0.7004, "前日比"); // 差は-0.03pt、丸めると0.0pt
    expect(d.short).toBe("0.0pt");
    expect(d.tone).toBeUndefined();
    expect(d.direction).toBe("flat");
  });

  test("deltaPct: ごくわずかな差は ±0% 扱いになる（-0.0% にならない）", () => {
    const d = deltaPct(100_000.2, 100_000, false, "前日比");
    expect(d.short).toBe("±0%");
    expect(d.tone).toBeUndefined();
  });
});

describe("deltaPct / deltaPt の基本ケース", () => {
  test("deltaPct: 通常の増加", () => {
    const d = deltaPct(110, 100, false, "前日比");
    expect(d.tone).toBe("good");
    expect(d.direction).toBe("up");
    expect(d.short).toBe("+10.0%");
  });

  test("deltaPct: invert=true では減少が良化になる", () => {
    const d = deltaPct(90, 100, true, "前日比");
    expect(d.tone).toBe("good");
    expect(d.direction).toBe("down");
  });

  test("deltaPt: null は比較不可としてデータなし扱い", () => {
    const d = deltaPt(null, 0.5, "前日比");
    expect(d.text).toContain("データなし");
  });
});

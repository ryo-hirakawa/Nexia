/**
 * ダッシュボードの「比較対象との差」の判定ロジック（純粋関数）。
 * カード・比較表・状況の要約のすべてがこのモジュールの結果をそのまま使うことで、
 * 同じ数字に対して違う判定（例: 悪化なのに良化と出る）が出ないようにする。
 */
import { yen } from "@/lib/daily";

export type Tone = "good" | "bad" | undefined;
/** 矢印は「数値が増えたか減ったか」だけで決める（良化/悪化とは独立）。
 *  例: FL率が下がるのは良いことだが、数値としては減っているので↓を出す。 */
export type Direction = "up" | "down" | "flat";
export type Delta = { text: string; tone: Tone; short: string; direction: Direction };

/** 色だけに頼らず矢印でも示す。向きは常に数値の増減、色（tone）が良化/悪化。 */
export const directionArrow = (d: Direction) => (d === "up" ? "↑ " : d === "down" ? "↓ " : "");
export const toneTextClass = (tone: Tone) =>
  tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-muted";

const rawDirection = (cur: number, prev: number): Direction =>
  cur > prev ? "up" : cur < prev ? "down" : "flat";

/** 比較対象との差（％）。上がる方が良い指標向け。invert で下がる方が良い指標に。
 *  label を渡すと「前月比」「前年同月比」など表示ラベルを切り替えられる。
 *  短い差分だけの表記（表の差分列など）用に short も返す。
 *  丸めて0.0%になる場合は「-0.0%」にならないよう ±0% 扱いにする。 */
export function deltaPct(cur: number, prev: number, invert = false, label = "前月比"): Delta {
  const direction = rawDirection(cur, prev);
  if (prev === 0) {
    if (cur === 0) return { text: `${label} ±0%`, tone: undefined, short: "±0%", direction: "flat" };
    return { text: `${label.replace("比", "")}データなし`, tone: undefined, short: "データなし", direction };
  }
  const rPct = Math.round(((cur - prev) / prev) * 1000) / 10;
  if (rPct === 0) return { text: `${label} ±0%`, tone: undefined, short: "±0%", direction: "flat" };
  const sign = rPct > 0 ? "+" : "";
  const tone: Tone = (invert ? rPct < 0 : rPct > 0) ? "good" : "bad";
  const short = `${sign}${rPct.toFixed(1)}%`;
  return { text: `${label} ${short}`, tone, short, direction };
}

/** ポイント差（比率どうしの差）。FL率など。下がる方が良い。
 *  丸めて0.0ptになる場合は「-0.0pt」にならないよう横ばい扱いにする。 */
export function deltaPt(cur: number | null, prev: number | null, label = "前月比"): Delta {
  if (cur === null || prev === null) {
    return { text: `${label.replace("比", "")}データなし`, tone: undefined, short: "データなし", direction: "flat" };
  }
  const direction = rawDirection(cur, prev);
  const diffPt = Math.round((cur - prev) * 1000) / 10;
  if (diffPt === 0) return { text: `${label} 0.0pt`, tone: undefined, short: "0.0pt", direction: "flat" };
  const sign = diffPt > 0 ? "+" : "";
  const tone: Tone = diffPt < 0 ? "good" : "bad";
  const short = `${sign}${diffPt.toFixed(1)}pt`;
  return { text: `${label} ${short}`, tone, short, direction };
}

/**
 * 金額差（マイナスもあり得る指標専用。営業利益など）。
 * 前期・当期の少なくとも一方がマイナスのときは通常の増減率（％）を出さず、
 * 「黒字転換／赤字転落／赤字縮小／赤字拡大」という状態と差額で伝える
 * （マイナスを含む割り算は符号が反転して意味を成さないため）。
 * 両方0以上・前期>0のときだけ、これまでどおり％表示にする。
 */
export function deltaAmount(cur: number, prev: number, label = "前月比"): Delta {
  const diff = cur - prev;
  const direction = rawDirection(cur, prev);

  if (prev < 0 || cur < 0) {
    let state: string;
    let tone: Tone;
    if (prev < 0 && cur >= 0) {
      state = "黒字転換";
      tone = "good";
    } else if (prev >= 0 && cur < 0) {
      state = "赤字転落";
      tone = "bad";
    } else {
      // 両方マイナス（どちらも赤字）
      state = diff > 0 ? "赤字縮小" : diff < 0 ? "赤字拡大" : "赤字横ばい";
      tone = diff > 0 ? "good" : diff < 0 ? "bad" : undefined;
    }
    if (diff === 0) {
      return { text: `${state}（${label} ±¥0）`, tone, short: "±¥0", direction: "flat" };
    }
    const verb = diff > 0 ? "改善" : "悪化";
    const diffText = yen(Math.abs(diff));
    return {
      text: `${state}・${label} ${diffText} ${verb}`,
      tone,
      short: `${diff > 0 ? "+" : "-"}${diffText}`,
      direction,
    };
  }

  // 通常ケース（前期・当期とも0以上）
  if (prev === 0) {
    if (cur === 0) return { text: `${label} ±0%`, tone: undefined, short: "±0%", direction: "flat" };
    return { text: `${label.replace("比", "")}データなし`, tone: undefined, short: "データなし", direction };
  }
  const rPct = Math.round((diff / prev) * 1000) / 10;
  if (rPct === 0) return { text: `${label} ±0%`, tone: undefined, short: "±0%", direction: "flat" };
  const sign = rPct > 0 ? "+" : "";
  const tone: Tone = rPct > 0 ? "good" : "bad";
  const short = `${sign}${rPct.toFixed(1)}%`;
  return { text: `${label} ${short}`, tone, short, direction };
}

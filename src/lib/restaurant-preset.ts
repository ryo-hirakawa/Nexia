/**
 * 飲食版テンプレの初期プリセット（template = "restaurant_v1"）。
 * 業態（鉄板焼き/鍋・焼き鳥/炉端焼きなど）が店舗ごとに違うため、
 * ここは開始時の汎用初期値。実際の値は月初セットアップ画面で店舗ごとに編集する。
 * 決済手段・天候の選択肢は業態に依存しないため bar-preset.ts のものを共用する。
 */

export const SALES_CATEGORIES = [
  "料理",
  "ドリンク",
  "宴会コース",
  "その他",
] as const;

export const VARIABLE_COST_ITEMS = [
  "消耗品",
  "販促・広告",
  "衛生・清掃",
  "通信",
  "雑費",
] as const;

/** 日次入力で使う仕入れ・人件費の固定項目 */
export const COGS_ITEMS = ["食材・酒類", "その他"] as const;
export const LABOR_ITEMS = ["スタッフ時給", "日払い"] as const;

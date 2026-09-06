/**
 * バー版テンプレの初期プリセット。
 * M2′ で「月初セットアップ」画面から店舗ごとに編集できるようになるまでの暫定。
 */

export const SALES_CATEGORIES = [
  "セット・チャージ",
  "ボトル・キープ",
  "ドリンク",
  "フード",
  "その他",
] as const;

export const VARIABLE_COST_ITEMS = [
  "消耗品",
  "送り（タクシー）",
  "販促・広告",
  "衛生・清掃",
  "通信",
  "雑費",
] as const;

export const PAYMENT_METHODS = [
  { key: "cash", label: "現金" },
  { key: "card", label: "カード" },
  { key: "emoney", label: "電子マネー" },
  { key: "receivable", label: "売掛" },
] as const;

export type PaymentKey = (typeof PAYMENT_METHODS)[number]["key"];

export const WEATHER_OPTIONS = ["晴", "曇", "雨", "雪"] as const;

/** 日次入力で使う仕入れ・人件費の固定項目 */
export const COGS_ITEMS = ["酒類", "その他"] as const;
export const LABOR_ITEMS = ["スタッフ時給", "日払い"] as const;

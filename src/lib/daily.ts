import { PAYMENT_METHODS, type PaymentKey } from "@/lib/bar-preset";

export type RecordStatus = "draft" | "confirmed";
export type CostClass = "cogs" | "labor" | "fixed" | "variable";

export type CategoryLine = { category: string; amount: number };
export type CostLine = {
  cost_class: CostClass;
  item: string;
  amount: number;
  note?: string | null;
};

export type DailyRecordForm = {
  id: string | null;
  storeId: string;
  businessDate: string; // YYYY-MM-DD
  status: RecordStatus;
  weather: string | null;
  note: string | null;
  totalSales: number;
  guestCount: number;
  groupCount: number;
  categories: CategoryLine[];
  payments: Record<PaymentKey, number>;
  costs: CostLine[];
  confirmedAt: string | null;
  updatedAt: string | null;
};

/** JST の日付文字列（offsetDays 日ずらし）。JST は UTC+9 固定。 */
export function jstDateString(offsetDays = 0): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  jst.setUTCDate(jst.getUTCDate() + offsetDays);
  return jst.toISOString().slice(0, 10);
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isValidDateStr(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s + "T00:00:00Z"))
  );
}

export const emptyPayments = (): Record<PaymentKey, number> =>
  Object.fromEntries(PAYMENT_METHODS.map((p) => [p.key, 0])) as Record<
    PaymentKey,
    number
  >;

export const yen = (n: number) =>
  "¥" + Math.round(n).toLocaleString("ja-JP");

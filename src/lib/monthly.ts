import type { MonthlySetupData } from "@/lib/finance";

export type FixedLineForm = { item: string; category: string; amount: number };
export type StaffLineForm = { name: string; amount: number };

export type MonthlySetupForm = {
  id: string | null;
  storeId: string;
  yearMonth: string; // "2026-09-01"
  fixed: FixedLineForm[];
  staff: StaffLineForm[];
  updatedAt: string | null;
};

/** 固定費の分類プリセット（自由に追加可） */
export const FIXED_CATEGORIES = [
  "地代家賃",
  "リース料",
  "保険料",
  "通信・サブスク",
  "借入返済",
  "減価償却",
  "その他",
] as const;

export function setupToData(f: MonthlySetupForm): MonthlySetupData {
  return {
    fixedLines: f.fixed
      .filter((l) => l.item.trim() && l.amount)
      .map((l) => ({
        item: l.item.trim(),
        category: l.category.trim() || "その他",
        amountMonthly: Math.max(0, Math.round(l.amount)),
      })),
    staff: f.staff
      .filter((l) => l.name.trim() && l.amount)
      .map((l) => ({
        staffName: l.name.trim(),
        amountMonthly: Math.max(0, Math.round(l.amount)),
      })),
  };
}

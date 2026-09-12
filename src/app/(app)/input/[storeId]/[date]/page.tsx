import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { isValidDateStr, addDays } from "@/lib/daily";
import { loadDailyRecord } from "@/lib/daily-server";
import {
  loadSetupDataForDate,
  loadVariableItems,
  loadSalesCategories,
} from "@/lib/monthly-server";
import { daysInMonth } from "@/lib/finance";
import { SALES_CATEGORIES as BAR_SALES_CATEGORIES } from "@/lib/bar-preset";
import { SALES_CATEGORIES as RESTAURANT_SALES_CATEGORIES } from "@/lib/restaurant-preset";
import DailyForm from "./DailyForm";

export default async function DailyInputPage({
  params,
}: {
  params: Promise<{ storeId: string; date: string }>;
}) {
  await requireMembership();
  const { storeId, date } = await params;

  if (!isValidDateStr(date)) notFound();

  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("id, name, industry")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) notFound();

  const [record, setup, variableItems, salesCategories] = await Promise.all([
    loadDailyRecord(storeId, date),
    loadSetupDataForDate(storeId, date),
    loadVariableItems(storeId),
    loadSalesCategories(storeId),
  ]);

  const presetCategories =
    store.industry === "restaurant" ? RESTAURANT_SALES_CATEGORIES : BAR_SALES_CATEGORIES;

  const dim = daysInMonth(date);
  const perDay = (m: number) => (dim > 0 ? Math.round(m / dim) : 0);

  const fixedLines =
    setup?.fixedLines.map((l) => ({
      item: l.item,
      category: l.category,
      perDay: perDay(l.amountMonthly),
    })) ?? [];
  const staffLines =
    setup?.staff.map((l) => ({ name: l.staffName, perDay: perDay(l.amountMonthly) })) ??
    [];
  const staffPerDay = staffLines.reduce((s, l) => s + l.perDay, 0);

  const monthKey = date.slice(0, 7);

  return (
    <DailyForm
      initial={record}
      storeName={store.name}
      storeId={storeId}
      industry={store.industry}
      prevDate={addDays(date, -1)}
      nextDate={addDays(date, 1)}
      fixedLines={fixedLines}
      staffLines={staffLines}
      staffPerDay={staffPerDay}
      variableItems={variableItems}
      salesCategories={salesCategories.length ? salesCategories : [...presetCategories]}
      setupMonth={monthKey}
      setupExists={setup !== null}
    />
  );
}

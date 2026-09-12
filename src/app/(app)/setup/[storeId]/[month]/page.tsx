import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import {
  loadMonthlySetup,
  loadVariableItems,
  loadSalesCategories,
} from "@/lib/monthly-server";
import { addMonths } from "@/lib/finance";
import { SALES_CATEGORIES as BAR_SALES_CATEGORIES } from "@/lib/bar-preset";
import { SALES_CATEGORIES as RESTAURANT_SALES_CATEGORIES } from "@/lib/restaurant-preset";
import MonthlySetup from "./MonthlySetup";

export default async function MonthlySetupPage({
  params,
}: {
  params: Promise<{ storeId: string; month: string }>;
}) {
  await requireMembership();
  const { storeId, month } = await params;

  if (!/^\d{4}-\d{2}$/.test(month)) notFound();
  const yearMonth = `${month}-01`;

  const supabase = await createClient();
  const { data: store } = await supabase
    .from("stores")
    .select("id, name, industry")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) notFound();

  const [current, prev, variableItems, salesCategories] = await Promise.all([
    loadMonthlySetup(storeId, yearMonth),
    loadMonthlySetup(storeId, addMonths(yearMonth, -1)),
    loadVariableItems(storeId),
    loadSalesCategories(storeId),
  ]);

  const presetCategories =
    store.industry === "restaurant" ? RESTAURANT_SALES_CATEGORIES : BAR_SALES_CATEGORIES;

  return (
    <MonthlySetup
      storeName={store.name}
      initial={current}
      prev={prev}
      variableItems={variableItems}
      salesCategories={salesCategories.length ? salesCategories : [...presetCategories]}
      prevMonthKey={addMonths(yearMonth, -1)}
      nextMonth={addMonths(yearMonth, 1).slice(0, 7)}
      prevMonth={addMonths(yearMonth, -1).slice(0, 7)}
    />
  );
}

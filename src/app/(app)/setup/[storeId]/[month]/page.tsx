import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import {
  loadMonthlySetup,
  loadVariableItems,
} from "@/lib/monthly-server";
import { addMonths } from "@/lib/finance";
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
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle();
  if (!store) notFound();

  const [current, prev, variableItems] = await Promise.all([
    loadMonthlySetup(storeId, yearMonth),
    loadMonthlySetup(storeId, addMonths(yearMonth, -1)),
    loadVariableItems(storeId),
  ]);

  return (
    <MonthlySetup
      storeName={store.name}
      initial={current}
      prev={prev}
      variableItems={variableItems}
      prevMonthKey={addMonths(yearMonth, -1)}
      nextMonth={addMonths(yearMonth, 1).slice(0, 7)}
      prevMonth={addMonths(yearMonth, -1).slice(0, 7)}
    />
  );
}

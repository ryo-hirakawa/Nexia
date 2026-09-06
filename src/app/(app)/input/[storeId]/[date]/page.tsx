import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { isValidDateStr, addDays } from "@/lib/daily";
import { loadDailyRecord } from "@/lib/daily-server";
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
    .select("id, name")
    .eq("id", storeId)
    .maybeSingle();

  // RLS で見えない（＝担当外の）店舗は notFound
  if (!store) notFound();

  const record = await loadDailyRecord(storeId, date);

  return (
    <DailyForm
      initial={record}
      storeName={store.name}
      prevDate={addDays(date, -1)}
      nextDate={addDays(date, 1)}
    />
  );
}

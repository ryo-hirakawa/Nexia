import { redirect } from "next/navigation";
import { jstDateString } from "@/lib/daily";
import { latestRecordedDate } from "@/lib/monthly-server";
import { requireMembership } from "@/lib/auth";

export default async function StoreInputRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  await requireMembership();
  const { storeId } = await params;
  // 記録がある一番新しい営業日へ。無ければ昨日。
  const latest = (await latestRecordedDate(storeId)) ?? jstDateString(-1);
  redirect(`/input/${storeId}/${latest}`);
}

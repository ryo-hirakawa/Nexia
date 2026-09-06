import { redirect } from "next/navigation";
import { jstDateString } from "@/lib/daily";

export default async function SetupStoreRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/setup/${storeId}/${jstDateString(0).slice(0, 7)}`);
}

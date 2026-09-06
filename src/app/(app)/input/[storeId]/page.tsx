import { redirect } from "next/navigation";
import { jstDateString } from "@/lib/daily";

export default async function StoreInputRedirect({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  redirect(`/input/${storeId}/${jstDateString(-1)}`);
}

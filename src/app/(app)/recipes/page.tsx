import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { INDUSTRY_LABEL, type Store } from "@/lib/types";
import { LAST_STORE_COOKIE } from "@/lib/store-cookie";
import { StorePickerLink } from "../store-picker-link";

export default async function RecipesIndexPage() {
  await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, client_id, name, industry, template, timezone, created_at")
    .order("created_at", { ascending: true });

  const stores = ((data ?? []) as Store[]).filter((s) => s.industry === "restaurant");

  if (stores.length === 1) redirect(`/recipes/${stores[0].id}`);

  const lastStoreId = (await cookies()).get(LAST_STORE_COOKIE)?.value;
  const remembered = stores.find((s) => s.id === lastStoreId);
  if (remembered) redirect(`/recipes/${remembered.id}`);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">レシピ原価</h1>
      {stores.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-sm text-muted dark:bg-surface">
          対象の店舗がありません。
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface dark:bg-surface">
          {stores.map((s) => (
            <li key={s.id}>
              <StorePickerLink
                href={`/recipes/${s.id}`}
                storeId={s.id}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-muted">{INDUSTRY_LABEL[s.industry] ?? s.industry} →</span>
              </StorePickerLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

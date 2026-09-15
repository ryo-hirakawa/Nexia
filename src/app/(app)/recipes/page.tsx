import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { INDUSTRY_LABEL, type Store } from "@/lib/types";

export default async function RecipesIndexPage() {
  await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, client_id, name, industry, template, timezone, created_at")
    .order("created_at", { ascending: true });

  const stores = ((data ?? []) as Store[]).filter((s) => s.industry === "restaurant");

  if (stores.length === 1) redirect(`/recipes/${stores[0].id}`);

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
              <Link
                href={`/recipes/${s.id}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-muted">{INDUSTRY_LABEL[s.industry] ?? s.industry} →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

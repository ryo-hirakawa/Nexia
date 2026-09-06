import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString } from "@/lib/daily";
import { INDUSTRY_LABEL, type Store } from "@/lib/types";

export default async function SetupIndexPage() {
  await requireMembership();
  const supabase = await createClient();
  const { data } = await supabase
    .from("stores")
    .select("id, client_id, name, industry, template, timezone, created_at")
    .order("created_at", { ascending: true });

  const stores = (data ?? []) as Store[];
  const month = jstDateString(0).slice(0, 7);

  if (stores.length === 1) redirect(`/setup/${stores[0].id}/${month}`);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">月初セットアップ</h1>
      {stores.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          対象の店舗がありません。
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {stores.map((s) => (
            <li key={s.id}>
              <Link
                href={`/setup/${s.id}/${month}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-zinc-500">
                  {INDUSTRY_LABEL[s.industry] ?? s.industry} ・ {month} を設定 →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

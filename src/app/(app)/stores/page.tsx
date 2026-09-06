import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { INDUSTRY_LABEL, type Store } from "@/lib/types";

export default async function StoresPage() {
  await requireMembership();
  const supabase = await createClient();

  // RLS により「自分が見られる店舗」しか返らない
  const { data, error } = await supabase
    .from("stores")
    .select("id, client_id, name, industry, template, timezone, created_at")
    .order("created_at", { ascending: true });

  const stores = (data ?? []) as Store[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">店舗</h1>

      {error ? (
        <p className="text-sm text-red-600">
          読み込みに失敗しました: {error.message}
        </p>
      ) : stores.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          表示できる店舗がありません。店舗の登録はコンサル管理者が行います。
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {stores.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-zinc-500">
                {INDUSTRY_LABEL[s.industry] ?? s.industry}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

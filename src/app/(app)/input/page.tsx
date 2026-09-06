import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString } from "@/lib/daily";
import { INDUSTRY_LABEL, type Store } from "@/lib/types";

export default async function InputIndexPage() {
  await requireMembership();
  const supabase = await createClient();

  // RLS: 見られる（＝入力できる）店舗だけ返る
  const { data } = await supabase
    .from("stores")
    .select("id, client_id, name, industry, template, timezone, created_at")
    .order("created_at", { ascending: true });

  const stores = (data ?? []) as Store[];
  const yesterday = jstDateString(-1);

  if (stores.length === 1) {
    redirect(`/input/${stores[0].id}/${yesterday}`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">日次入力</h1>
      {stores.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          入力できる店舗がありません。店舗の登録はコンサル管理者が行います。
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {stores.map((s) => (
            <li key={s.id}>
              <Link
                href={`/input/${s.id}/${yesterday}`}
                className="flex items-center justify-between px-4 py-3 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-zinc-500">
                  {INDUSTRY_LABEL[s.industry] ?? s.industry} ・ {yesterday} を入力 →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

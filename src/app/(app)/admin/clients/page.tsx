import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import type { Client } from "@/lib/types";

export default async function AdminClientsPage() {
  const membership = await requireMembership();

  // 管理者以外はこのページを見られない
  if (!membership.isPlatformAdmin) notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  const clients = (data ?? []) as Client[];

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">クライアント管理</h1>
      <p className="text-sm text-zinc-500">
        コンサル管理者専用。全クライアントを横断で表示します。
      </p>

      {error ? (
        <p className="text-sm text-red-600">
          読み込みに失敗しました: {error.message}
        </p>
      ) : clients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          クライアントがまだありません。登録機能は次のマイルストーンで実装します
          （いまは Supabase 側でシード投入します）。
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {clients.map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm font-medium">
              {c.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
 <h1 className="text-xl font-bold tracking-tight">クライアント管理</h1>
 <p className="text-sm text-muted">
 コンサル管理者専用。全クライアントを横断で表示します。
 </p>

 {error ? (
 <p className="text-sm text-bad">
 読み込みに失敗しました: {error.message}
 </p>
 ) : clients.length === 0 ? (
 <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-sm text-muted dark:bg-surface">
 クライアントがまだありません。登録機能は次のマイルストーンで実装します
 （いまは Supabase 側でシード投入します）。
 </div>
 ) : (
 <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface dark:bg-surface">
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

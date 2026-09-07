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
 <h1 className="text-xl font-bold tracking-tight">店舗</h1>

 {error ? (
 <p className="text-sm text-bad">
 読み込みに失敗しました: {error.message}
 </p>
 ) : stores.length === 0 ? (
 <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-sm text-muted dark:bg-surface">
 表示できる店舗がありません。店舗の登録はコンサル管理者が行います。
 </div>
 ) : (
 <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface dark:bg-surface">
 {stores.map((s) => (
 <li
 key={s.id}
 className="flex items-center justify-between px-4 py-3 text-sm"
 >
 <span className="font-medium">{s.name}</span>
 <span className="text-xs text-muted">
 {INDUSTRY_LABEL[s.industry] ?? s.industry}
 </span>
 </li>
 ))}
 </ul>
 )}
 </div>
 );
}

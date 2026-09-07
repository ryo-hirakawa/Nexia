import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString } from "@/lib/daily";
import { latestRecordedDate } from "@/lib/monthly-server";
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
 const latest = (await latestRecordedDate(stores[0].id)) ?? yesterday;
 redirect(`/input/${stores[0].id}/${latest}`);
 }

 return (
 <div className="space-y-4">
 <h1 className="text-xl font-bold tracking-tight">日次入力</h1>
 {stores.length === 0 ? (
 <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-sm text-muted dark:bg-surface">
 入力できる店舗がありません。店舗の登録はコンサル管理者が行います。
 </div>
 ) : (
 <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface dark:bg-surface">
 {stores.map((s) => (
 <li key={s.id}>
 <Link
 href={`/input/${s.id}`}
 className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2 "
 >
 <span className="font-medium">{s.name}</span>
 <span className="text-xs text-muted">
 {INDUSTRY_LABEL[s.industry] ?? s.industry} ・ 入力へ →
 </span>
 </Link>
 </li>
 ))}
 </ul>
 )}
 </div>
 );
}

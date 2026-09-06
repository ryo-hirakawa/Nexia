import { requireMembership, primaryRoleLabel } from "@/lib/auth";

export default async function DashboardPage() {
  const membership = await requireMembership();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">ダッシュボード</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {primaryRoleLabel(membership)} としてログイン中
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { k: "当月売上", v: "—" },
          { k: "営業利益", v: "—" },
          { k: "FL コスト率", v: "—" },
        ].map((c) => (
          <div
            key={c.k}
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="text-xs text-zinc-500">{c.k}</div>
            <div className="mt-1 font-mono text-2xl tabular-nums text-zinc-400">
              {c.v}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        まだデータがありません。日次入力フォーム（M1′）と集計（M2′・M3′）は次のマイルストーンで実装します。
        この画面が権限ごとに表示できていれば <span className="font-medium text-zinc-700 dark:text-zinc-300">M0′ 完了</span> です。
      </div>
    </div>
  );
}

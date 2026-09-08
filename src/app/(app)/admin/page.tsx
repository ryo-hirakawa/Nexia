import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMembership } from "@/lib/auth";
import { loadOverview } from "@/lib/overview-server";
import { yen } from "@/lib/daily";
import { pct } from "@/lib/finance";
import { monthLabel } from "@/lib/finance";
import { StoreSalesBars } from "./overview-chart";

export default async function AdminOverviewPage() {
  const membership = await requireMembership();
  if (!membership.isPlatformAdmin) notFound();

  const o = await loadOverview();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">統括</h1>
        <p className="text-sm text-muted">
          全クライアント横断 ・ {monthLabel(o.month + "-01")}（月初〜前日）
        </p>
      </div>

      {/* totals */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile k="店舗数" v={String(o.totals.stores)} />
        <Tile
          k="合計売上"
          v={yen(o.totals.sales)}
          sub={
            o.totals.target > 0
              ? `目標 ${yen(o.totals.target)} ・ ${pct(o.totals.sales / o.totals.target)}`
              : "目標未設定"
          }
        />
        <Tile
          k="合計営業利益"
          v={yen(o.totals.profit)}
          tone={o.totals.profit < 0 ? "bad" : "good"}
        />
        <Tile
          k="要対応"
          v={`${o.totals.alerts} 件`}
          tone={o.totals.alerts > 0 ? "warn" : undefined}
          sub="未入力2日以上 / セットアップ未設定"
        />
      </div>

      {o.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          クライアント・店舗がまだありません。
        </div>
      ) : (
        <>
          {/* comparison */}
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">
              店舗別 売上（当月）
            </div>
            <div className="p-4">
              <StoreSalesBars
                data={o.rows.map((r) => ({
                  name: r.storeName,
                  sales: r.sales,
                  belowTarget: r.salesTarget > 0 && r.sales < r.salesTarget,
                }))}
              />
            </div>
          </div>

          {/* table */}
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs text-muted">
                  <th className="px-4 py-2.5 text-left font-medium">クライアント / 店舗</th>
                  <th className="px-3 py-2.5 text-right font-medium">当月売上</th>
                  <th className="px-3 py-2.5 text-right font-medium">達成率</th>
                  <th className="px-3 py-2.5 text-right font-medium">営業利益</th>
                  <th className="px-3 py-2.5 text-right font-medium">FL率</th>
                  <th className="px-3 py-2.5 text-right font-medium">未入力</th>
                  <th className="px-3 py-2.5 text-left font-medium">最終入力</th>
                  <th className="px-3 py-2.5 text-left font-medium">状態</th>
                </tr>
              </thead>
              <tbody>
                {o.rows.map((r) => {
                  const alert = !r.hasSetup
                    ? "セットアップ未設定"
                    : r.missingDays >= 2
                      ? `${r.missingDays}日 未入力`
                      : null;
                  return (
                    <tr key={r.storeId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/dashboard?s=${r.storeId}&view=month`}
                          className="font-medium text-navy hover:underline"
                        >
                          {r.storeName}
                        </Link>
                        <span className="ml-2 text-xs text-muted">{r.clientName}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{yen(r.sales)}</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {r.targetRate === null ? "—" : pct(r.targetRate)}
                      </td>
                      <td
                        className={
                          "px-3 py-2.5 text-right font-mono tabular-nums " +
                          (r.operatingProfit < 0 ? "text-bad" : "")
                        }
                      >
                        {yen(r.operatingProfit)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">{pct(r.flRate)}</td>
                      <td
                        className={
                          "px-3 py-2.5 text-right font-mono tabular-nums " +
                          (r.missingDays >= 2 ? "text-warn" : "text-muted")
                        }
                      >
                        {r.missingDays} 日
                      </td>
                      <td className="px-3 py-2.5 text-muted">{r.lastInput ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {alert ? (
                          <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs text-warn">
                            {alert}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            行の店舗名をクリックすると、そのクライアントのダッシュボードに移動します。
          </p>
        </>
      )}
    </div>
  );
}

function Tile({
  k,
  v,
  sub,
  tone,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "good" | "bad" | "warn";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{k}</div>
      <div
        className={
          "mt-1 font-mono text-2xl font-bold tabular-nums " +
          (tone === "bad"
            ? "text-bad"
            : tone === "good"
              ? "text-good"
              : tone === "warn"
                ? "text-warn"
                : "")
        }
      >
        {v}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

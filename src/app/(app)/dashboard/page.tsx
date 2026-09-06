import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString, yen, isValidDateStr } from "@/lib/daily";
import { latestRecordedDate } from "@/lib/monthly-server";
import { loadDashboardData } from "@/lib/dashboard-server";
import { pct } from "@/lib/finance";
import { periodLabel, shiftRef, fmtMD, type DashView } from "@/lib/period";

const VIEWS: { key: DashView; label: string }[] = [
  { key: "day", label: "日" },
  { key: "week", label: "週" },
  { key: "month", label: "月" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; d?: string; s?: string }>;
}) {
  await requireMembership();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: storeRows } = await supabase
    .from("stores")
    .select("id, name")
    .order("created_at", { ascending: true });
  const stores = storeRows ?? [];

  if (stores.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        表示できる店舗がありません。
      </div>
    );
  }

  const store = stores.find((s) => s.id === sp.s) ?? stores[0];
  const view: DashView =
    sp.view === "day" || sp.view === "week" || sp.view === "month"
      ? sp.view
      : "month";
  const refDate =
    sp.d && isValidDateStr(sp.d)
      ? sp.d
      : ((await latestRecordedDate(store.id)) ?? jstDateString(0));

  const d = await loadDashboardData(store.id, view, refDate);

  const q = (o: Record<string, string>) => {
    const p = new URLSearchParams({ view, d: refDate, s: store.id, ...o });
    return `/dashboard?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold">ダッシュボード</h1>
          <p className="text-sm text-zinc-500">{store.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-zinc-300 text-sm dark:border-zinc-700">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={q({ view: v.key })}
                className={
                  "px-3 py-1 " +
                  (v.key === view
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800")
                }
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* period nav */}
      <div className="flex items-center gap-3 text-sm">
        <Link href={q({ d: shiftRef(view, refDate, -1) })} className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700">
          ◀
        </Link>
        <span className="font-medium">{periodLabel(view, refDate)}</span>
        <Link href={q({ d: shiftRef(view, refDate, 1) })} className="rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700">
          ▶
        </Link>
        {d.recordedDays > 0 ? (
          <span className="text-xs text-zinc-400">
            記録 {d.recordedDays} 日
            {d.draftDays > 0 ? `（うち未確定 ${d.draftDays} 日）` : ""}
          </span>
        ) : null}
      </div>

      {!d.hasSetup ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          この月の
          <Link href={`/setup/${store.id}/${refDate.slice(0, 7)}`} className="font-medium underline">
            月初セットアップ
          </Link>
          が未設定です。固定費・人件費が損益に反映されません。
        </p>
      ) : null}

      {d.recordedDays === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
          この期間の記録がありません。{" "}
          <Link href="/input" className="font-medium underline">
            日次入力
          </Link>
          から記録してください。
        </div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tile
              k="売上"
              v={yen(d.sales)}
              sub={
                d.salesTarget > 0
                  ? `目標 ${yen(d.salesTarget)} ・ 達成率 ${pct(d.targetRate)}`
                  : "目標未設定"
              }
            />
            <Tile
              k="客数 / 客単価"
              v={`${d.guests} / ${d.avgSpend === null ? "—" : yen(d.avgSpend)}`}
              sub={`組数 ${d.groups}`}
            />
            <Tile
              k="FL コスト率"
              v={pct(d.flRate)}
              sub={`原価 ${pct(d.cogsRate)} ・ 人件費 ${pct(d.laborRate)}`}
            />
            <Tile
              k="営業利益"
              v={yen(d.operatingProfit)}
              sub={`利益率 ${pct(d.operatingMarginRate)}`}
              neg={d.operatingProfit < 0}
            />
            <Tile k="売掛残高" v={yen(d.receivableBalance)} sub="期間末時点" />
            {d.view === "month" && d.landingForecast !== null ? (
              <Tile
                k="着地予測（今月）"
                v={yen(d.landingForecast)}
                sub={
                  d.salesTarget > 0
                    ? `対目標 ${pct(d.landingForecast / d.salesTarget)}`
                    : "日割りペースから概算"
                }
              />
            ) : null}
          </div>

          {/* 売上推移 */}
          {d.dailyTrend.length > 0 ? (
            <Card title="売上推移（日次）">
              <BarRow
                items={d.dailyTrend.map((t) => ({
                  label: fmtMD(t.date),
                  value: t.sales,
                  dim: !t.hasRecord,
                }))}
              />
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 費目別経費 */}
            <Card title="費目別 経費">
              <BarList items={d.costByClass.map((c) => ({ name: c.label, amount: c.amount }))} />
              <Detail
                title="人件費の内訳"
                items={d.laborByItem}
                hidden={d.laborByItem.length === 0}
              />
              <Detail
                title="流動費の内訳"
                items={d.variableByItem}
                hidden={d.variableByItem.length === 0}
              />
              <p className="mt-2 text-xs text-zinc-400">
                固定費・月給スタッフ（日割り）は記録日数ぶんの累計。人件費＝時給＋日払い＋キャストバック＋月給スタッフ。
              </p>
            </Card>

            {/* カテゴリ別 */}
            <Card title="売上内訳（カテゴリ別）">
              {d.byCategory.length ? (
                <BarList items={d.byCategory} />
              ) : (
                <Empty />
              )}
            </Card>

            {/* 決済構成 */}
            <Card title="決済構成">
              {d.byPayment.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {d.byPayment.map((p) => (
                      <tr key={p.method}>
                        <td className="py-1 text-zinc-500">{p.label}</td>
                        <td className="py-1 text-right font-mono tabular-nums">{yen(p.amount)}</td>
                        <td className="w-12 py-1 text-right text-xs text-zinc-400">
                          {d.sales > 0 ? Math.round((p.amount / d.sales) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty />
              )}
            </Card>

            {/* キャスト別 */}
            <Card title="キャスト別 売上ランキング">
              {d.castRanking.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-zinc-400">
                      <th className="pb-1 text-left font-medium">キャスト</th>
                      <th className="pb-1 text-right font-medium">売上</th>
                      <th className="pb-1 text-right font-medium">バック</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.castRanking.map((c) => (
                      <tr key={c.name}>
                        <td className="py-1">{c.name}</td>
                        <td className="py-1 text-right font-mono tabular-nums">{yen(c.sales)}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-zinc-400">{yen(c.back)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Empty />
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({
  k,
  v,
  sub,
  neg,
}: {
  k: string;
  v: string;
  sub?: string;
  neg?: boolean;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500">{k}</div>
      <div
        className={
          "mt-1 font-mono text-2xl tabular-nums " +
          (neg ? "text-red-600" : "text-zinc-900 dark:text-zinc-100")
        }
      >
        {v}
      </div>
      {sub ? <div className="mt-1 text-xs text-zinc-400">{sub}</div> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-zinc-400">データなし</p>;
}

function BarList({ items }: { items: { name: string; amount: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.amount));
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.name} className="flex items-center gap-2 text-sm">
          <span className="w-24 shrink-0 text-zinc-500">{i.name}</span>
          <span className="relative h-4 flex-1 overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
            <span
              className="absolute inset-y-0 left-0 rounded bg-zinc-800 dark:bg-zinc-300"
              style={{ width: `${(i.amount / max) * 100}%` }}
            />
          </span>
          <span className="w-24 shrink-0 text-right font-mono tabular-nums">{yen(i.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function BarRow({
  items,
}: {
  items: { label: string; value: number; dim?: boolean }[];
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 96 }}>
      {items.map((i, idx) => (
        <div key={idx} className="flex w-8 shrink-0 flex-col items-center gap-1">
          <span className="font-mono text-[9px] text-zinc-400">
            {i.value ? Math.round(i.value / 1000) + "k" : ""}
          </span>
          <span
            className={
              "w-4 rounded-t " +
              (i.dim ? "bg-zinc-200 dark:bg-zinc-800" : "bg-zinc-800 dark:bg-zinc-300")
            }
            style={{ height: Math.max(2, (i.value / max) * 72) }}
          />
          <span className="font-mono text-[9px] text-zinc-400">{i.label}</span>
        </div>
      ))}
    </div>
  );
}

function Detail({
  title,
  items,
  hidden,
}: {
  title: string;
  items: { name: string; amount: number }[];
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="mt-3 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <p className="mb-1 text-xs text-zinc-400">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {items.map((i) => (
            <tr key={i.name}>
              <td className="py-0.5 text-zinc-500">{i.name}</td>
              <td className="py-0.5 text-right font-mono tabular-nums">{yen(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

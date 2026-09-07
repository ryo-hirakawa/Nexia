import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString, yen, isValidDateStr } from "@/lib/daily";
import { latestRecordedDate } from "@/lib/monthly-server";
import { loadDashboardData } from "@/lib/dashboard-server";
import { pct } from "@/lib/finance";
import { periodLabel, shiftRef, fmtMD, type DashView } from "@/lib/period";
import { AchievementGauge, TrendBars, CompositionDonut } from "./charts";

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
      <div className="rounded-xl border border-line bg-surface p-6 text-sm text-muted">
        表示できる店舗がありません。
      </div>
    );
  }

  const store = stores.find((s) => s.id === sp.s) ?? stores[0];
  const view: DashView =
    sp.view === "day" || sp.view === "week" || sp.view === "month" ? sp.view : "month";
  const refDate =
    sp.d && isValidDateStr(sp.d)
      ? sp.d
      : ((await latestRecordedDate(store.id)) ?? jstDateString(0));

  const d = await loadDashboardData(store.id, view, refDate);

  const q = (o: Record<string, string>) => {
    const p = new URLSearchParams({ view, d: refDate, s: store.id, ...o });
    return `/dashboard?${p.toString()}`;
  };

  const costTotal = d.cogs + d.labor + d.fixedProrated + d.variable;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ダッシュボード</h1>
          <p className="text-sm text-muted">{store.name}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line text-sm">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={q({ view: v.key })}
                className={
                  "px-3.5 py-1.5 font-medium transition-colors " +
                  (v.key === view
                    ? "bg-navy text-white"
                    : "bg-surface text-muted hover:bg-surface-2")
                }
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* period nav */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={q({ d: shiftRef(view, refDate, -1) })} className="rounded-md border border-line px-2 py-1 hover:bg-surface-2">
          ◀
        </Link>
        <span className="font-semibold">{periodLabel(view, refDate)}</span>
        <Link href={q({ d: shiftRef(view, refDate, 1) })} className="rounded-md border border-line px-2 py-1 hover:bg-surface-2">
          ▶
        </Link>
        {d.recordedDays > 0 ? (
          <span className="text-xs text-muted">
            記録 {d.recordedDays} 日
            {d.draftDays > 0 ? `（うち未確定 ${d.draftDays} 日）` : ""}
          </span>
        ) : null}
      </div>

      {!d.hasSetup ? (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">
          この月の
          <Link href={`/setup/${store.id}/${refDate.slice(0, 7)}`} className="font-semibold underline">
            月初セットアップ
          </Link>
          が未設定です。固定費・人件費が損益に反映されません。
        </p>
      ) : null}

      {d.recordedDays === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          この期間の記録がありません。
          <br />
          <Link href="/input" className="font-semibold text-navy underline">
            日次入力
          </Link>{" "}
          から記録してください。
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {/* hero */}
            <div className="flex items-center gap-4 rounded-xl bg-navy p-5 text-white md:col-span-2 lg:col-span-1">
              <div className="flex-1">
                <div className="text-xs text-white/70">総売上</div>
                <div className="mt-1 font-mono text-3xl font-bold tabular-nums">
                  {yen(d.sales)}
                </div>
                <div className="mt-1 text-xs text-white/70">
                  {d.salesTarget > 0
                    ? `目標 ${yen(d.salesTarget)}`
                    : "目標未設定"}
                </div>
              </div>
              {d.salesTarget > 0 ? <AchievementGauge rate={d.targetRate} /> : null}
            </div>

            <Kpi
              k="営業利益"
              v={yen(d.operatingProfit)}
              sub={`利益率 ${pct(d.operatingMarginRate)}`}
              tone={d.operatingProfit < 0 ? "bad" : "good"}
            />
            <Kpi
              k="FL コスト率"
              v={pct(d.flRate)}
              sub={`原価 ${pct(d.cogsRate)} ・ 人件費 ${pct(d.laborRate)}`}
            />
            <Kpi
              k="客数 / 客単価"
              v={`${d.guests} / ${d.avgSpend === null ? "—" : yen(d.avgSpend)}`}
              sub={`組数 ${d.groups}`}
            />
            <Kpi k="売掛残高" v={yen(d.receivableBalance)} sub="期間末時点" />
            {d.view === "month" && d.landingForecast !== null ? (
              <Kpi
                k="着地予測（今月）"
                v={yen(d.landingForecast)}
                sub={
                  d.salesTarget > 0
                    ? `対目標 ${pct(d.landingForecast / d.salesTarget)}`
                    : "日割りペースから概算"
                }
                accent
              />
            ) : null}
          </div>

          {/* charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            {d.dailyTrend.length > 0 ? (
              <Card title="売上推移（日次）">
                <TrendBars
                  data={d.dailyTrend.map((t) => ({
                    label: fmtMD(t.date),
                    value: t.sales,
                    dim: !t.hasRecord,
                  }))}
                />
              </Card>
            ) : null}

            <Card title="費目別 経費">
              <CompositionDonut
                data={d.costByClass.filter((c) => c.amount > 0).map((c) => ({
                  name: c.label,
                  amount: c.amount,
                }))}
                centerLabel="経費計"
                centerValue={costTotal}
              />
              <Detail title="人件費の内訳" items={d.laborByItem} />
              <Detail title="流動費の内訳" items={d.variableByItem} />
              <p className="mt-3 text-xs text-muted">
                固定費・月給スタッフ（日割り）は記録日数ぶんの累計。人件費＝時給＋日払い＋キャストバック＋月給スタッフ。
              </p>
            </Card>

            <Card title="売上内訳（カテゴリ別）">
              {d.byCategory.length ? (
                <CompositionDonut
                  data={d.byCategory}
                  centerLabel="売上"
                  centerValue={d.sales}
                />
              ) : (
                <Empty />
              )}
            </Card>

            <Card title="決済構成" bar="navy">
              {d.byPayment.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {d.byPayment.map((p) => (
                      <tr key={p.method} className="border-b border-line last:border-0">
                        <td className="py-1.5 text-muted">{p.label}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">
                          {yen(p.amount)}
                        </td>
                        <td className="w-12 py-1.5 text-right text-xs text-muted">
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
          </div>

          {/* cast ranking */}
          <Card title="キャスト別 売上ランキング" bar="orange">
            {d.castRanking.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="w-8 pb-1.5 text-left font-medium">#</th>
                    <th className="pb-1.5 text-left font-medium">キャスト</th>
                    <th className="pb-1.5 text-right font-medium">売上</th>
                    <th className="pb-1.5 text-right font-medium">バック</th>
                  </tr>
                </thead>
                <tbody>
                  {d.castRanking.map((c, i) => (
                    <tr key={c.name} className="border-b border-line last:border-0">
                      <td className="py-1.5">{i === 0 ? "👑" : i + 1}</td>
                      <td className="py-1.5 font-medium">{c.name}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{yen(c.sales)}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-muted">{yen(c.back)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Kpi({
  k,
  v,
  sub,
  tone,
  accent,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "good" | "bad";
  accent?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border bg-surface p-4 " +
        (accent ? "border-orange/40" : "border-line")
      }
    >
      <div className="text-xs text-muted">{k}</div>
      <div
        className={
          "mt-1 font-mono text-2xl font-bold tabular-nums " +
          (tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "")
        }
      >
        {v}
      </div>
      {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

function Card({
  title,
  children,
  bar,
}: {
  title: string;
  children: React.ReactNode;
  bar?: "navy" | "orange";
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div
        className={
          "px-4 py-2.5 text-sm font-semibold " +
          (bar === "navy"
            ? "bg-navy text-white"
            : bar === "orange"
              ? "bg-orange text-white"
              : "border-b border-line")
        }
      >
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted">データなし</p>;
}

function Detail({
  title,
  items,
}: {
  title: string;
  items: { name: string; amount: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 border-t border-line pt-2">
      <p className="mb-1 text-xs text-muted">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {items.map((i) => (
            <tr key={i.name}>
              <td className="py-0.5 text-muted">{i.name}</td>
              <td className="py-0.5 text-right font-mono tabular-nums">{yen(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString, yen, isValidDateStr } from "@/lib/daily";
import { latestRecordedDate } from "@/lib/monthly-server";
import { loadDashboardData, loadWeekdayAverages } from "@/lib/dashboard-server";
import { pct } from "@/lib/finance";
import { fmtMD, periodLabel, shiftRef, shiftYearRef, type DashView } from "@/lib/period";
import {
  AchievementGauge,
  TrendBars,
  CompositionDonut,
  CostCompareBars,
  WeekdayBars,
  MiniCompareBars,
} from "./charts";
import { DashControls } from "./controls";

type Tone = "good" | "bad" | undefined;

/** 前期比（％）。上がる方が良い指標向け。invert で下がる方が良い指標に。 */
function deltaPct(cur: number, prev: number, invert = false): { text: string; tone: Tone } {
  if (prev === 0) {
    if (cur === 0) return { text: "前期比 ±0%", tone: undefined };
    return { text: "前期データなし", tone: undefined };
  }
  const r = (cur - prev) / prev;
  const sign = r > 0 ? "+" : r < 0 ? "" : "±";
  const tone: Tone = r === 0 ? undefined : (invert ? r < 0 : r > 0) ? "good" : "bad";
  return { text: `前期比 ${sign}${(r * 100).toFixed(1)}%`, tone };
}

/** ポイント差（比率どうしの差）。FL率など。下がる方が良い。 */
function deltaPt(cur: number | null, prev: number | null): { text: string; tone: Tone } {
  if (cur === null || prev === null) return { text: "前期データなし", tone: undefined };
  const diff = (cur - prev) * 100;
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
  const tone: Tone = diff === 0 ? undefined : diff < 0 ? "good" : "bad";
  return { text: `前期比 ${sign}${diff.toFixed(1)}pt`, tone };
}

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

  const prevRefDate = shiftRef(view, refDate, -1);
  const yearAgoRefDate = view === "month" ? shiftYearRef(refDate, -1) : null;

  const [d, previous, yearAgo, weekday] = await Promise.all([
    loadDashboardData(store.id, view, refDate),
    loadDashboardData(store.id, view, prevRefDate),
    yearAgoRefDate ? loadDashboardData(store.id, "month", yearAgoRefDate) : null,
    loadWeekdayAverages(store.id, refDate),
  ]);
  const costTotal = d.cogs + d.labor + d.fixedProrated + d.variable;
  const prevCostTotal = previous.cogs + previous.labor + previous.fixedProrated + previous.variable;
  const hasPrev = previous.recordedDays > 0;

  const salesDelta = deltaPct(d.sales, previous.sales);
  const profitDelta = deltaPct(d.operatingProfit, previous.operatingProfit);
  const flDelta = deltaPt(d.flRate, previous.flRate);
  const guestDelta = deltaPct(d.guests, previous.guests);
  const avgSpendDelta =
    d.avgSpend !== null && previous.avgSpend !== null
      ? deltaPct(d.avgSpend, previous.avgSpend)
      : { text: "前期データなし", tone: undefined as Tone };

  const yearOverYear =
    view === "month"
      ? yearAgo && yearAgo.recordedDays > 0
        ? deltaPct(d.sales, yearAgo.sales)
        : { text: "前年データ蓄積中（13ヶ月で自動表示）", tone: undefined as Tone }
      : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">ダッシュボード</h1>
        <p className="text-sm text-muted">{store.name}</p>
      </div>

      <DashControls
        view={view}
        refDate={refDate}
        storeId={store.id}
        recordedDays={d.recordedDays}
        draftDays={d.draftDays}
      />

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
                <div
                  className={
                    "mt-1 text-xs font-medium " +
                    (salesDelta.tone === "good"
                      ? "text-good"
                      : salesDelta.tone === "bad"
                        ? "text-bad"
                        : "text-white/60")
                  }
                >
                  {salesDelta.text}
                  {yearOverYear ? ` ・ 前年同月比 ${yearOverYear.text}` : ""}
                </div>
                {hasPrev ? (
                  <div className="[&_*]:!text-white">
                    <MiniCompareBars current={d.sales} previous={previous.sales} format={yen} />
                  </div>
                ) : null}
              </div>
              {d.salesTarget > 0 ? <AchievementGauge rate={d.targetRate} /> : null}
            </div>

            <Kpi
              k="営業利益"
              v={yen(d.operatingProfit)}
              sub={`利益率 ${pct(d.operatingMarginRate)}`}
              tone={d.operatingProfit < 0 ? "bad" : "good"}
              delta={profitDelta}
              compare={hasPrev ? { current: d.operatingProfit, previous: previous.operatingProfit, format: yen } : undefined}
            />
            <Kpi
              k="FL コスト率"
              v={pct(d.flRate)}
              sub={`原価 ${pct(d.cogsRate)} ・ 人件費 ${pct(d.laborRate)}`}
              delta={flDelta}
              compare={
                hasPrev && d.flRate !== null && previous.flRate !== null
                  ? { current: d.flRate * 100, previous: previous.flRate * 100, format: (n) => n.toFixed(1) + "%" }
                  : undefined
              }
            />
            <Kpi
              k="客数 / 客単価"
              v={`${d.guests} / ${d.avgSpend === null ? "—" : yen(d.avgSpend)}`}
              sub={`組数 ${d.groups}`}
              delta={guestDelta}
              compare={hasPrev ? { current: d.guests, previous: previous.guests, format: (n) => `${Math.round(n)}人` } : undefined}
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

          {/* 前期比較サマリー */}
          <Card title={`前期比較（前期：${periodLabel(view, prevRefDate)}）`}>
            {hasPrev ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="pb-1.5 text-left font-medium">指標</th>
                    <th className="pb-1.5 text-right font-medium">当期</th>
                    <th className="pb-1.5 text-right font-medium">前期</th>
                    <th className="pb-1.5 text-right font-medium">差分</th>
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="売上" cur={yen(d.sales)} prev={yen(previous.sales)} delta={salesDelta} />
                  <CompareRow label="客数" cur={`${d.guests}`} prev={`${previous.guests}`} delta={guestDelta} />
                  <CompareRow
                    label="客単価"
                    cur={d.avgSpend === null ? "—" : yen(d.avgSpend)}
                    prev={previous.avgSpend === null ? "—" : yen(previous.avgSpend)}
                    delta={avgSpendDelta}
                  />
                  <CompareRow label="営業利益" cur={yen(d.operatingProfit)} prev={yen(previous.operatingProfit)} delta={profitDelta} />
                  <CompareRow label="FL コスト率" cur={pct(d.flRate)} prev={pct(previous.flRate)} delta={flDelta} />
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-muted">前期の記録がまだありません。</p>
            )}
          </Card>

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
              {hasPrev ? (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="mb-1 text-xs text-muted">当期 vs 前期</p>
                  <CostCompareBars
                    data={d.costByClass.map((c) => ({
                      label: c.label,
                      current: c.amount,
                      previous:
                        previous.costByClass.find((p) => p.key === c.key)?.amount ?? 0,
                    }))}
                  />
                  <p className="mt-1 text-right text-xs text-muted">
                    経費計 {yen(costTotal)}（前期 {yen(prevCostTotal)}）
                  </p>
                </div>
              ) : null}
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

          {/* 曜日別平均 */}
          <Card title="曜日別 平均売上（直近90日）">
            {weekday.some((w) => w.days > 0) ? (
              <>
                <WeekdayBars data={weekday} />
                <p className="mt-2 text-xs text-muted">
                  オレンジ＝平均売上が最も高い曜日。シフトや仕入れの目安に。
                </p>
              </>
            ) : (
              <Empty />
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function CompareRow({
  label,
  cur,
  prev,
  delta,
}: {
  label: string;
  cur: string;
  prev: string;
  delta: { text: string; tone: Tone };
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-1.5 text-muted">{label}</td>
      <td className="py-1.5 text-right font-mono tabular-nums">{cur}</td>
      <td className="py-1.5 text-right font-mono tabular-nums text-muted">{prev}</td>
      <td
        className={
          "py-1.5 text-right font-mono text-xs tabular-nums " +
          (delta.tone === "good" ? "text-good" : delta.tone === "bad" ? "text-bad" : "text-muted")
        }
      >
        {delta.text.replace("前期比 ", "")}
      </td>
    </tr>
  );
}

function Kpi({
  k,
  v,
  sub,
  tone,
  accent,
  delta,
  compare,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "good" | "bad";
  accent?: boolean;
  delta?: { text: string; tone: Tone };
  compare?: { current: number; previous: number; format: (n: number) => string };
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
      {delta ? (
        <div
          className={
            "mt-1 text-xs font-medium " +
            (delta.tone === "good"
              ? "text-good"
              : delta.tone === "bad"
                ? "text-bad"
                : "text-muted")
          }
        >
          {delta.text}
        </div>
      ) : null}
      {compare ? (
        <MiniCompareBars current={compare.current} previous={compare.previous} format={compare.format} />
      ) : null}
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

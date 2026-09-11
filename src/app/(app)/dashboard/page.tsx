import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString, yen, isValidDateStr } from "@/lib/daily";
import { latestRecordedDate } from "@/lib/monthly-server";
import {
  loadDashboardData,
  loadWeekdayAverages,
  loadMonthlyYoY,
  type DashboardData,
} from "@/lib/dashboard-server";
import { pct, monthLabel, daysInMonth } from "@/lib/finance";
import { addDays, fmtMDW, periodLabel, shiftRef, shiftYearRef, type DashView } from "@/lib/period";
import {
  AchievementGauge,
  TrendBars,
  CompositionDonut,
  CostCompareBars,
  WeekdayBars,
  MiniCompareBars,
  MonthlyYoYBars,
} from "./charts";
import { DashControls } from "./controls";

type Tone = "good" | "bad" | undefined;
type Delta = { text: string; tone: Tone; short: string };

/** 「期」は使わず、ビューに応じて日/週/月で表記する。 */
const CUR_LABEL: Record<DashView, string> = { day: "当日", week: "当週", month: "当月" };
const PREV_LABEL: Record<DashView, string> = { day: "前日", week: "前週", month: "前月" };
const DELTA_LABEL: Record<DashView, string> = { day: "前日比", week: "前週比", month: "前月比" };

/** 色だけに頼らず、良化/悪化を矢印でも示す */
const toneArrow = (tone: Tone) => (tone === "good" ? "▲ " : tone === "bad" ? "▼ " : "");
const toneTextClass = (tone: Tone) =>
  tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-muted";

/** 比較対象との差（％）。上がる方が良い指標向け。invert で下がる方が良い指標に。
 *  label を渡すと「前月比」「前年同月比」など表示ラベルを切り替えられる。
 *  短い差分だけの表記（表の差分列など）用に short も返す。 */
function deltaPct(cur: number, prev: number, invert = false, label = "前月比"): Delta {
  if (prev === 0) {
    if (cur === 0) return { text: `${label} ±0%`, tone: undefined, short: "±0%" };
    return { text: `${label.replace("比", "")}データなし`, tone: undefined, short: "データなし" };
  }
  const r = (cur - prev) / prev;
  const sign = r > 0 ? "+" : r < 0 ? "" : "±";
  const tone: Tone = r === 0 ? undefined : (invert ? r < 0 : r > 0) ? "good" : "bad";
  const short = `${sign}${(r * 100).toFixed(1)}%`;
  return { text: `${label} ${short}`, tone, short };
}

/** ポイント差（比率どうしの差）。FL率など。下がる方が良い。 */
function deltaPt(cur: number | null, prev: number | null, label = "前月比"): Delta {
  if (cur === null || prev === null) {
    return { text: `${label.replace("比", "")}データなし`, tone: undefined, short: "データなし" };
  }
  const diff = (cur - prev) * 100;
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "±";
  const tone: Tone = diff === 0 ? undefined : diff < 0 ? "good" : "bad";
  const short = `${sign}${diff.toFixed(1)}pt`;
  return { text: `${label} ${short}`, tone, short };
}

/**
 * 事実だけからルールベースで作る短い要約（最大3件）。
 * 原因の推測はせず、集計値からそのまま言える内容のみ。
 * 優先順位: 未入力（集計未完了）＞ 客数/客単価の逆行 ＞ 売上の増減 ＞ 利益/FL率の悪化。
 */
function buildInsights(args: {
  view: DashView;
  missingDays: number;
  hasPrev: boolean;
  d: DashboardData;
  salesDelta: Delta;
  profitDelta: Delta;
  guestDelta: Delta;
  avgSpendDelta: Delta;
  flDelta: Delta;
}): { text: string; tone: Tone; icon: string }[] {
  const { view, missingDays, hasPrev, d, salesDelta, profitDelta, guestDelta, avgSpendDelta, flDelta } = args;
  const out: { text: string; tone: Tone; icon: string }[] = [];
  const deltaLabel = DELTA_LABEL[view];

  // データの状態に関する注意（方向性のある増減ではないので矢印ではなく注意記号）
  if (missingDays > 0) {
    out.push({
      text: `${CUR_LABEL[view]}に未入力の日が${missingDays}日あります。集計はまだ完了していません。`,
      tone: "bad",
      icon: "⚠",
    });
  }

  if (!hasPrev) {
    out.push({ text: `${PREV_LABEL[view]}の記録がないため比較できません。`, tone: undefined, icon: "・" });
  } else {
    if (guestDelta.tone && avgSpendDelta.tone && guestDelta.tone !== avgSpendDelta.tone) {
      out.push({
        text: `客数は${guestDelta.tone === "good" ? "増加" : "減少"}していますが、客単価は${
          avgSpendDelta.tone === "good" ? "上昇" : "低下"
        }しています（${deltaLabel}）。`,
        tone: undefined,
        icon: "・",
      });
    } else if (salesDelta.tone) {
      out.push({
        text: `売上は${deltaLabel}で${salesDelta.tone === "good" ? "増加" : "減少"}しています（${salesDelta.short}）。`,
        tone: salesDelta.tone,
        icon: toneArrow(salesDelta.tone),
      });
    }

    if (d.operatingProfit < 0) {
      out.push({
        text: `${CUR_LABEL[view]}は営業利益が赤字です。費用の内訳を確認してください。`,
        tone: "bad",
        icon: "⚠",
      });
    } else if (profitDelta.tone === "bad") {
      out.push({
        text: `営業利益が${deltaLabel}で悪化しています（${profitDelta.short}）。`,
        tone: "bad",
        icon: toneArrow("bad"),
      });
    }

    if (flDelta.tone === "bad") {
      out.push({
        text: `FLコスト率（原価＋人件費の比率）が${deltaLabel}で悪化しています（${flDelta.short}）。`,
        tone: "bad",
        icon: toneArrow("bad"),
      });
    }
  }

  return out.slice(0, 3);
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

  const [d, previous, yearAgo, weekday, monthlyYoY] = await Promise.all([
    loadDashboardData(store.id, view, refDate),
    // 前月/前年同月比較では合計値しか使わないので detail:false で往復を減らす
    loadDashboardData(store.id, view, prevRefDate, { detail: false }),
    yearAgoRefDate
      ? loadDashboardData(store.id, "month", yearAgoRefDate, { detail: false })
      : null,
    loadWeekdayAverages(store.id, refDate),
    view === "month" ? loadMonthlyYoY(store.id, refDate) : null,
  ]);
  const costTotal = d.cogs + d.labor + d.fixedProrated + d.variable;
  const prevCostTotal = previous.cogs + previous.labor + previous.fixedProrated + previous.variable;
  const hasPrev = previous.recordedDays > 0;
  const missingDays = Math.max(0, d.calendarDays - d.recordedDays);

  const deltaLabel = DELTA_LABEL[view];
  const salesDelta = deltaPct(d.sales, previous.sales, false, deltaLabel);
  const profitDelta = deltaPct(d.operatingProfit, previous.operatingProfit, false, deltaLabel);
  const flDelta = deltaPt(d.flRate, previous.flRate, deltaLabel);
  const guestDelta = deltaPct(d.guests, previous.guests, false, deltaLabel);
  const avgSpendDelta: Delta =
    d.avgSpend !== null && previous.avgSpend !== null
      ? deltaPct(d.avgSpend, previous.avgSpend, false, deltaLabel)
      : { text: `${PREV_LABEL[view]}データなし`, tone: undefined, short: "データなし" };

  const yearOverYear =
    view === "month"
      ? yearAgo && yearAgo.recordedDays > 0
        ? deltaPct(d.sales, yearAgo.sales, false, "前年同月比")
        : { text: "前年データ蓄積中（13ヶ月で自動表示）", tone: undefined as Tone }
      : null;

  // 月末着地予測の表示状態。計算式（dashboard-server.ts の landingForecast）は
  // 変更せず、UI 側で「終了済みの月／データ不足／計算可能」の3状態を出し分ける。
  const dayOfMonth = Number(refDate.slice(8));
  const forecastState: "complete" | "insufficient" | "ready" =
    view !== "month"
      ? "insufficient"
      : d.isMonthComplete
        ? "complete"
        : d.landingForecast === null
          ? "insufficient"
          : "ready";
  const forecastGap =
    d.landingForecast !== null && d.salesTarget > 0 ? d.landingForecast - d.salesTarget : null;

  const insights = buildInsights({
    view,
    missingDays,
    hasPrev,
    d,
    salesDelta,
    profitDelta,
    guestDelta,
    avgSpendDelta,
    flDelta,
  });

  return (
    <div className="space-y-5">
      {/* ① ヘッダー：店舗・対象期間・切り替え・入力状況を1つにまとめる */}
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight">{store.name}</h1>
          <p className="text-sm text-muted">{periodLabel(view, refDate)}</p>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <DashControls
            view={view}
            refDate={refDate}
            storeId={store.id}
            recordedDays={d.recordedDays}
            draftDays={d.draftDays}
            stores={stores.length > 1 ? stores : undefined}
          />
        </div>

        {!d.hasSetup ? (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">
            この月の
            <Link href={`/setup/${store.id}/${refDate.slice(0, 7)}`} className="font-semibold underline">
              月初セットアップ
            </Link>
            が未設定です。固定費・人件費が損益に反映されません。
          </p>
        ) : null}

        {d.recordedDays > 0 && missingDays > 0 ? (
          <p className="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm text-warn">
            この{view === "month" ? "月" : view === "week" ? "週" : "日"}に未入力の日が
            {missingDays}日あります。
            <Link href="/input" className="ml-1 font-semibold underline">
              日次入力
            </Link>
            から記録すると集計が完了します。
          </p>
        ) : null}
      </div>

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
          {/* ② 主要指標：PC4列・タブレット2列・スマホ2列（狭い端末は1列） */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              k="売上"
              v={yen(d.sales)}
              sub={
                d.salesTarget > 0
                  ? `目標 ${yen(d.salesTarget)}`
                  : "目標未設定"
              }
              delta={salesDelta}
              extraDelta={yearOverYear ?? undefined}
              compare={
                hasPrev
                  ? {
                      current: d.sales,
                      previous: previous.sales,
                      currentLabel: yen(d.sales),
                      previousLabel: yen(previous.sales),
                      curTag: CUR_LABEL[view],
                      prevTag: PREV_LABEL[view],
                    }
                  : undefined
              }
              aside={d.salesTarget > 0 ? <AchievementGauge rate={d.targetRate} /> : undefined}
              footnote={
                view !== "month" ? undefined : forecastState === "complete" ? (
                  <p className="text-xs text-muted">
                    この月は終了しているため、月末着地予測ではなく確定した実績を表示しています。
                  </p>
                ) : forecastState === "insufficient" ? (
                  <p className="text-xs text-warn">月末着地予測: 予測に必要なデータ不足</p>
                ) : (
                  <div className="rounded-lg bg-surface-2 p-2.5">
                    <p className="text-xs font-semibold text-muted">月末売上予想（進行中の月）</p>
                    <div className="mt-1.5 space-y-1 text-xs">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-muted">月末売上予想</span>
                        <span className="overflow-x-auto whitespace-nowrap font-mono font-bold tabular-nums">
                          {yen(d.landingForecast as number)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-muted">目標との差額</span>
                        <span
                          className={
                            "overflow-x-auto whitespace-nowrap font-mono font-bold tabular-nums " +
                            (forecastGap === null ? "" : toneTextClass(forecastGap >= 0 ? "good" : "bad"))
                          }
                        >
                          {forecastGap === null ? "目標未設定" : (forecastGap >= 0 ? "+" : "") + yen(forecastGap)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-muted">予想達成率</span>
                        <span className="overflow-x-auto whitespace-nowrap font-mono font-bold tabular-nums">
                          {d.salesTarget > 0 ? pct((d.landingForecast as number) / d.salesTarget) : "—"}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      基準日: {fmtMDW(refDate)}時点の実績 {yen(d.sales)}（{dayOfMonth}日経過）を月{daysInMonth(refDate)}
                      日換算。未入力日は0円として計算するため、未入力があると予想は低めに出ます。
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      定休日も含めた暦日ベースの単純な日割り予測です（曜日ごとの傾向は考慮していません）。
                    </p>
                  </div>
                )
              }
            />
            <Kpi
              k="営業利益"
              v={yen(d.operatingProfit)}
              sub={`利益率 ${pct(d.operatingMarginRate)}`}
              tone={d.operatingProfit < 0 ? "bad" : "good"}
              delta={profitDelta}
              compare={
                hasPrev
                  ? {
                      current: d.operatingProfit,
                      previous: previous.operatingProfit,
                      currentLabel: yen(d.operatingProfit),
                      previousLabel: yen(previous.operatingProfit),
                      curTag: CUR_LABEL[view],
                      prevTag: PREV_LABEL[view],
                    }
                  : undefined
              }
              footnote={
                <details className="text-xs text-muted">
                  <summary className="cursor-pointer select-none">算式を見る</summary>
                  <p className="mt-1 leading-relaxed">
                    営業利益 = 売上 −（原価 + 人件費 + 固定費 + 流動費）
                    <br />
                    含む: 月給・固定費は期間の暦日数で按分、減価償却も費用として含む（現金支出ではない）。
                    <br />
                    含まない: 借入返済（元金相当）
                    {d.hasLoanRepaymentLines ? "・下記「経費・人件費の内訳」参照" : "（設定なし）"}。
                  </p>
                </details>
              }
            />
            <Kpi
              k="FL コスト率"
              v={pct(d.flRate)}
              sub={`原価 ${pct(d.cogsRate)} ・ 人件費 ${pct(d.laborRate)}`}
              delta={flDelta}
              compare={
                hasPrev && d.flRate !== null && previous.flRate !== null
                  ? {
                      current: d.flRate * 100,
                      previous: previous.flRate * 100,
                      currentLabel: (d.flRate * 100).toFixed(1) + "%",
                      previousLabel: (previous.flRate * 100).toFixed(1) + "%",
                      curTag: CUR_LABEL[view],
                      prevTag: PREV_LABEL[view],
                    }
                  : undefined
              }
            />
            <Kpi
              k="売掛残高"
              v={yen(d.receivableBalance)}
              sub={`${fmtMDW(d.range.end)} 時点（期間の売上ではありません）`}
            />
          </div>

          {/* ③ 状況の要約：事実ベースで最大3件 */}
          {insights.length > 0 ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="mb-2 text-xs font-semibold text-muted">状況の要約</p>
              <ul className="space-y-1.5 text-sm">
                {insights.map((it, i) => (
                  <li key={i} className={"flex gap-1.5 " + toneTextClass(it.tone)}>
                    <span aria-hidden>{it.icon}</span>
                    <span className={it.tone ? "" : "text-foreground"}>{it.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* 比較の詳細（折りたたみ）：主要カードと重複するのでここでは開閉式にする */}
          <details className="rounded-xl border border-line bg-surface open:pb-1">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-sm font-semibold">
              {PREV_LABEL[view]}比較の詳細を見る（{PREV_LABEL[view]}：{periodLabel(view, prevRefDate)}）
            </summary>
            <div className="border-t border-line p-4">
              {hasPrev ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted">
                      <th className="pb-1.5 text-left font-medium">指標</th>
                      <th className="pb-1.5 text-right font-medium">{CUR_LABEL[view]}</th>
                      <th className="pb-1.5 text-right font-medium">{PREV_LABEL[view]}</th>
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
                <p className="text-sm text-muted">{PREV_LABEL[view]}の記録がまだありません。</p>
              )}
            </div>
          </details>

          {/* ④ 日次売上推移 と 月別の前年比較（どちらも横に長いので全幅） */}
          {d.dailyTrend.length > 0 ? (
            <Card title="売上推移（日次）">
              <TrendBars
                data={d.dailyTrend.map((t) => ({
                  label: fmtMDW(t.date),
                  value: t.sales,
                  dim: !t.hasRecord,
                }))}
              />
            </Card>
          ) : null}

          {monthlyYoY ? (
            <Card title="月別売上（今年 vs 昨年・直近12ヶ月）">
              {monthlyYoY.some((m) => m.hasCur || m.hasPrev) ? (
                <>
                  <MonthlyYoYBars
                    data={monthlyYoY.map((m) => ({
                      label: m.label,
                      cur: m.curSales,
                      prev: m.prevSales,
                      hasCur: m.hasCur,
                      hasPrev: m.hasPrev,
                    }))}
                  />
                  <p className="mt-2 text-xs text-muted">
                    今年 = {monthLabel(monthlyYoY[0].monthKey)} 〜{" "}
                    {monthLabel(monthlyYoY[monthlyYoY.length - 1].monthKey)}
                    {" ・ "}
                    昨年 = 同期間の1年前（各月とも同じ月同士で比較）
                  </p>
                  <p className="mt-1 text-right text-xs text-muted">
                    今年計 {yen(monthlyYoY.reduce((s, m) => s + m.curSales, 0))}（昨年計{" "}
                    {yen(monthlyYoY.reduce((s, m) => s + m.prevSales, 0))}）
                  </p>
                  {monthlyYoY.some((m) => !m.hasPrev) ? (
                    <p className="mt-1 text-xs text-muted">
                      {monthlyYoY
                        .filter((m) => !m.hasPrev)
                        .map((m) => m.label)
                        .join("・")}
                      は前年データなし（比較データなし）
                    </p>
                  ) : null}
                </>
              ) : (
                <Empty />
              )}
            </Card>
          ) : null}

          {/* ⑤ 客数・客単価と売上カテゴリ分析 */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card title="客数・客単価">
              <div className="grid grid-cols-3 gap-3 text-center">
                <MiniStat label="客数" value={`${d.guests}人`} delta={guestDelta} />
                <MiniStat
                  label="客単価"
                  value={d.avgSpend === null ? "—" : yen(d.avgSpend)}
                  delta={avgSpendDelta}
                />
                <MiniStat label="組数" value={`${d.groups}組`} />
              </div>
              {hasPrev ? (
                <div className="mt-3 border-t border-line pt-3">
                  <MiniCompareBars
                    current={d.guests}
                    previous={previous.guests}
                    currentLabel={`${d.guests}人`}
                    previousLabel={`${previous.guests}人`}
                    curTag={CUR_LABEL[view]}
                    prevTag={PREV_LABEL[view]}
                  />
                </div>
              ) : null}
            </Card>

            <Card title="売上内訳（カテゴリ別）">
              {d.byCategory.length ? (
                <CompositionDonut data={d.byCategory} centerLabel="売上" centerValue={d.sales} />
              ) : (
                <Empty />
              )}
            </Card>
          </div>

          {/* ⑥ 経費・人件費の内訳 */}
          <Card title="費目別 経費">
            <CompositionDonut
              data={d.costByClass.filter((c) => c.amount > 0).map((c) => ({
                name: c.label,
                amount: c.amount,
              }))}
              centerLabel="経費計"
              centerValue={costTotal}
            />
            <FoldableDetail title="人件費の内訳" items={d.laborByItem} />
            <FoldableDetail title="流動費の内訳" items={d.variableByItem} />
            {hasPrev ? (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer select-none text-xs text-muted">
                  {CUR_LABEL[view]} vs {PREV_LABEL[view]} のグラフを見る
                </summary>
                <div className="mt-2">
                  <CostCompareBars
                    data={d.costByClass.map((c) => ({
                      label: c.label,
                      current: c.amount,
                      previous: previous.costByClass.find((p) => p.key === c.key)?.amount ?? 0,
                    }))}
                    curLabel={CUR_LABEL[view]}
                    prevLabel={PREV_LABEL[view]}
                  />
                  <p className="mt-1 text-right text-xs text-muted">
                    経費計 {yen(costTotal)}（{PREV_LABEL[view]} {yen(prevCostTotal)}）
                  </p>
                </div>
              </details>
            ) : null}
            <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
              <p>
                固定費・月給スタッフは、休業日や未入力日があっても発生する費用として、対象期間の暦日数で按分（月が終了していれば設定額の全額）。人件費＝時給＋日払い＋キャストバック＋月給スタッフ。
              </p>
              {view === "month" && !d.isMonthComplete ? (
                <p>
                  今月末までの見込み: 固定費 {yen(d.fixedMonthlyTotal)}・月給 {yen(d.staffMonthlyTotal)}
                  （現時点までの実績按分: 固定費 {yen(d.fixedProrated)}・月給 {yen(d.laborStaffProrated)}）
                </p>
              ) : null}
              {d.hasLoanRepaymentLines ? (
                <p>
                  借入返済（参考・営業利益には含めない）: {yen(d.loanRepaymentProrated)}
                  ・元金/利息の内訳は未設定です
                </p>
              ) : null}
              {d.hasDepreciationLines ? (
                <p>うち減価償却 {yen(d.depreciationProrated)} は費用として含みますが、現金の支出ではありません</p>
              ) : null}
              <p>原価（仕入れ）は仕入額をそのまま計上しています（棚卸は反映していません）</p>
            </div>
          </Card>

          {/* ⑦ 詳細：決済構成・キャストランキング・曜日別平均 */}
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <Card title="決済構成" bar="navy">
              {d.byPayment.length ? (
                <table className="w-full text-sm">
                  <tbody>
                    {d.byPayment.map((p) => (
                      <tr key={p.method} className="border-b border-line last:border-0">
                        <td className="py-1.5 text-muted">{p.label}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{yen(p.amount)}</td>
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
          </div>

          <Card title="曜日別 平均売上（直近90日）">
            {weekday.some((w) => w.days > 0) ? (
              <>
                <WeekdayBars data={weekday} />
                <p className="mt-2 text-xs text-muted">
                  オレンジ＝平均売上が最も高い曜日。シフトや仕入れの目安に。
                </p>
                <p className="mt-1 text-xs text-muted">
                  対象期間: {fmtMDW(addDays(refDate, -90))} 〜 {fmtMDW(refDate)}
                  {" ・ "}
                  集計日数: {weekday.map((w) => `${w.label}${w.days}日`).join(" ")}
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
  delta: { short: string; tone: Tone };
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-1.5 text-muted">{label}</td>
      <td className="py-1.5 text-right font-mono tabular-nums">{cur}</td>
      <td className="py-1.5 text-right font-mono tabular-nums text-muted">{prev}</td>
      <td className={"py-1.5 text-right font-mono text-xs tabular-nums " + toneTextClass(delta.tone)}>
        {delta.short}
      </td>
    </tr>
  );
}

function MiniStat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { text: string; tone: Tone };
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 overflow-x-auto whitespace-nowrap font-mono text-lg font-bold tabular-nums">
        {value}
      </div>
      {delta ? (
        <div className={"mt-0.5 text-xs font-medium " + toneTextClass(delta.tone)}>
          {toneArrow(delta.tone)}
          {delta.text.replace(/^\S+比\s*/, "")}
        </div>
      ) : null}
    </div>
  );
}

function Kpi({
  k,
  v,
  sub,
  tone,
  delta,
  extraDelta,
  compare,
  footnote,
  aside,
}: {
  k: string;
  v: string;
  sub?: string;
  tone?: "good" | "bad";
  delta?: { text: string; tone: Tone };
  extraDelta?: { text: string; tone: Tone };
  compare?: {
    current: number;
    previous: number;
    currentLabel: string;
    previousLabel: string;
    curTag: string;
    prevTag: string;
  };
  footnote?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted">{k}</div>
          <div
            className={
              "mt-1 overflow-x-auto whitespace-nowrap font-mono text-xl font-bold tabular-nums sm:text-2xl " +
              (tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : "")
            }
          >
            {v}
          </div>
          {sub ? <div className="mt-1 text-xs break-words text-muted">{sub}</div> : null}
          {delta ? (
            <div className={"mt-1 text-xs font-medium " + toneTextClass(delta.tone)}>
              {toneArrow(delta.tone)}
              {delta.text}
            </div>
          ) : null}
          {extraDelta ? (
            <div className={"mt-0.5 text-xs font-medium " + toneTextClass(extraDelta.tone)}>
              {toneArrow(extraDelta.tone)}
              {extraDelta.text}
            </div>
          ) : null}
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      {compare ? (
        <MiniCompareBars
          current={compare.current}
          previous={compare.previous}
          currentLabel={compare.currentLabel}
          previousLabel={compare.previousLabel}
          curTag={compare.curTag}
          prevTag={compare.prevTag}
        />
      ) : null}
      {footnote ? <div className="mt-2 border-t border-line pt-2">{footnote}</div> : null}
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

/** 内訳の一覧。項目が多いと縦に伸びるので折りたたみ式にする（重要な警告や
 *  主要数値ではないため隠しても支障がない）。 */
function FoldableDetail({
  title,
  items,
}: {
  title: string;
  items: { name: string; amount: number }[];
}) {
  if (items.length === 0) return null;
  return (
    <details className="mt-3 border-t border-line pt-2">
      <summary className="cursor-pointer select-none text-xs text-muted">{title}</summary>
      <table className="mt-1 w-full text-sm">
        <tbody>
          {items.map((i) => (
            <tr key={i.name}>
              <td className="py-0.5 text-muted">{i.name}</td>
              <td className="py-0.5 text-right font-mono tabular-nums">{yen(i.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

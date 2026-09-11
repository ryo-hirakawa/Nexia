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
import {
  addDays,
  fmtMD,
  fmtMDW,
  periodLabel,
  shiftRef,
  shiftYearRef,
  projectMonthEndByWeekday,
  type DashView,
} from "@/lib/period";
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
import {
  deltaPct,
  deltaPt,
  deltaAmount,
  directionArrow,
  toneTextClass,
  type Tone,
  type Delta,
} from "@/lib/delta";

/** 「期」は使わず、ビューに応じて日/週/月で表記する。 */
const CUR_LABEL: Record<DashView, string> = { day: "当日", week: "当週", month: "当月" };
const PREV_LABEL: Record<DashView, string> = { day: "前日", week: "前週", month: "前月" };
const DELTA_LABEL: Record<DashView, string> = { day: "前日比", week: "前週比", month: "前月比" };

/**
 * 事実だけからルールベースで作る短い要約（最大3件）。
 * 原因の推測はせず、集計値からそのまま言える内容のみ。
 * 優先順位: 客数/客単価の逆行 ＞ 売上の増減 ＞ 利益/FL率の悪化。
 * 未入力の警告はヘッダーに一本化しているため、ここでは繰り返さない。
 */
function buildInsights(args: {
  view: DashView;
  hasPrev: boolean;
  d: DashboardData;
  salesDelta: Delta;
  profitDelta: Delta;
  guestDelta: Delta;
  avgSpendDelta: Delta;
  flDelta: Delta;
}): { text: string; tone: Tone; icon: string }[] {
  const { view, hasPrev, d, salesDelta, profitDelta, guestDelta, avgSpendDelta, flDelta } = args;
  const out: { text: string; tone: Tone; icon: string }[] = [];
  const deltaLabel = DELTA_LABEL[view];

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
        icon: directionArrow(salesDelta.direction),
      });
    }

    if (d.operatingProfit < 0) {
      out.push({
        text: `${CUR_LABEL[view]}は営業利益が赤字です。費用の内訳を確認してください。`,
        tone: "bad",
        icon: "⚠",
      });
    } else if (profitDelta.tone === "bad") {
      // deltaAmount がすでに「赤字転落／赤字拡大／通常の悪化」を正しく
      // 文言化しているので、そのまま使う（重複した独自文言を作らない）。
      out.push({
        text: `営業利益: ${profitDelta.text}`,
        tone: "bad",
        icon: directionArrow(profitDelta.direction),
      });
    }

    if (flDelta.tone === "bad") {
      out.push({
        text: `FLコスト率（原価＋人件費の比率）が${deltaLabel}で悪化しています（${flDelta.short}）。`,
        tone: "bad",
        icon: directionArrow(flDelta.direction),
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
  // 営業利益は赤字（マイナス）になり得るため、通常の％比較(deltaPct)ではなく
  // 符号の変化を扱える deltaAmount を使う（黒字転換/赤字転落などを正しく判定する）。
  const profitDelta = deltaAmount(d.operatingProfit, previous.operatingProfit, deltaLabel);
  const flDelta = deltaPt(d.flRate, previous.flRate, deltaLabel);
  const guestDelta = deltaPct(d.guests, previous.guests, false, deltaLabel);
  const avgSpendDelta: Delta =
    d.avgSpend !== null && previous.avgSpend !== null
      ? deltaPct(d.avgSpend, previous.avgSpend, false, deltaLabel)
      : { text: `${PREV_LABEL[view]}データなし`, tone: undefined, short: "データなし", direction: "flat" };

  const yearOverYear: Delta | null =
    view === "month"
      ? yearAgo && yearAgo.recordedDays > 0
        ? deltaPct(d.sales, yearAgo.sales, false, "前年同月比")
        : { text: "前年データ蓄積中（13ヶ月で自動表示）", tone: undefined, short: "", direction: "flat" }
      : null;

  // 月末着地予測。曜日別平均（直近90日、weekday）で残り日数を積み上げる方式。
  // 経過日数ぶんは実績（d.sales）そのまま、残りは曜日ごとの平均を1日ずつ加算
  // するので、定休日や金・土の偏りが暦日一律の日割りより影響しにくい。
  // 大型連休など単発イベントは曜日平均には表れないため予測には反映されない
  // （注記で明示する）。
  const dayOfMonth = Number(refDate.slice(8));
  const projection =
    view === "month" && !d.isMonthComplete
      ? projectMonthEndByWeekday(refDate, d.sales, weekday)
      : null;
  // 「予測に使える確定済みの記録がない」を売上0円そのものと区別する。
  // 0円は有効な実績（休業/未入力とは別状態）なので、それだけを理由に
  // データ不足とはしない。下書き（未確定）だけの状態も不足として扱う。
  const confirmedDaysSoFar = d.recordedDays - d.draftDays;
  const forecastState: "complete" | "insufficient" | "ready" =
    view !== "month"
      ? "insufficient"
      : d.isMonthComplete
        ? "complete"
        : !projection?.hasEnoughData || confirmedDaysSoFar <= 0
          ? "insufficient"
          : "ready";
  const forecastGap =
    forecastState === "ready" && d.salesTarget > 0 ? projection!.forecast - d.salesTarget : null;
  // 今日（実際のシステム日付）と同じ月を見ているときだけ「進行中の月」と呼ぶ。
  // 過去に終わった月の途中の日付を試しに選んでいる場合は「○月○日時点の予測」とする。
  const isRealCurrentMonth = refDate.slice(0, 7) === jstDateString(0).slice(0, 7);
  const forecastTitle = isRealCurrentMonth
    ? "月末着地予想（進行中の月）"
    : `月末着地予想（${Number(refDate.slice(5, 7))}月${dayOfMonth}日時点）`;
  // 月が終了しているだけで「確定した実績」とは呼ばない。未入力・下書きが
  // 残っていれば「暫定実績」とする。
  const isProvisionalActual = missingDays > 0 || d.draftDays > 0;

  const insights = buildInsights({
    view,
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
                  ? `${view === "month" ? "目標" : "月間目標"} ${yen(d.salesTarget)}`
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
              // 達成率リングは月表示専用。日・週の売上を月間目標で割ると
              // 意味のない低い数字になるため、日・週表示では出さない。
              aside={
                view === "month" && d.salesTarget > 0 ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <AchievementGauge rate={d.targetRate} />
                    <span className="text-[9px] text-muted">実績</span>
                  </div>
                ) : undefined
              }
              footnote={
                view === "month" && d.isMonthComplete ? (
                  <p className="text-xs text-muted">
                    月終了（{isProvisionalActual ? "暫定実績" : "確定実績"}）
                  </p>
                ) : undefined
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

          {/* 月末着地予想：月表示・進行中（未終了）のときだけ、主要カード直下に
              横長で配置する。終了済みの月は予想ではなく実績が答えなので出さない。 */}
          {view === "month" && !d.isMonthComplete ? (
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{forecastTitle}</p>
                {forecastState === "ready" && missingDays > 0 ? (
                  <span className="rounded-full bg-warn/10 px-2.5 py-1 text-xs font-medium text-warn">
                    暫定予測・未入力{missingDays}日あり
                  </span>
                ) : null}
              </div>

              {forecastState === "insufficient" ? (
                <p className="mt-2 text-sm text-warn">
                  予測に必要なデータ不足（確定済みの記録がありません）
                </p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <ForecastStat label="月末売上予想" value={yen(projection!.forecast)} />
                    <ForecastStat
                      label="目標との差額"
                      value={forecastGap === null ? "目標未設定" : (forecastGap >= 0 ? "+" : "") + yen(forecastGap)}
                      tone={forecastGap === null ? undefined : forecastGap >= 0 ? "good" : "bad"}
                    />
                    <ForecastStat
                      label="予想達成率"
                      value={d.salesTarget > 0 ? pct(projection!.forecast / d.salesTarget) : "目標未設定"}
                    />
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    基準日: {fmtMDW(refDate)}時点の実績 {yen(d.sales)}（{dayOfMonth}日経過）
                  </p>
                  <details className="mt-1 text-xs text-muted">
                    <summary className="cursor-pointer select-none">算式・前提を見る</summary>
                    <p className="mt-1 leading-relaxed">
                      残り{daysInMonth(refDate) - dayOfMonth}日ぶんを、曜日別平均（直近90日）で1日ずつ積み上げて計算しています。
                      未入力日は0円として計算するため、未入力があると予想は低めに出ます。
                      定休日・曜日ごとの傾向は織り込みますが、大型連休など単発の特別なイベントの影響は反映されません。
                    </p>
                  </details>
                </>
              )}
            </div>
          ) : null}

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
            <Card title="月別売上（対象期間 vs 前年同期・直近12ヶ月）">
              {monthlyYoY.some((m) => m.hasCur || m.hasPrev) ? (
                <>
                  <MonthlyYoYBars
                    data={monthlyYoY.map((m) => ({
                      label: m.label,
                      cur: m.hasCur ? m.curSales : null,
                      prev: m.hasPrev ? m.prevSales : null,
                      curRangeLabel: `${m.curRange.start.slice(0, 4)}/${fmtMD(m.curRange.start)}〜${fmtMD(m.curRange.end)}`,
                      prevRangeLabel: `${m.prevRange.start.slice(0, 4)}/${fmtMD(m.prevRange.start)}〜${fmtMD(m.prevRange.end)}`,
                    }))}
                  />
                  <p className="mt-2 text-xs text-muted">
                    対象期間 = {monthLabel(monthlyYoY[0].monthKey)} 〜{" "}
                    {monthLabel(monthlyYoY[monthlyYoY.length - 1].monthKey)}
                    {" ・ "}
                    前年同期 = 対象期間の1年前（同じ月・同じ日数で比較）
                  </p>
                  {monthlyYoY[monthlyYoY.length - 1].isPartial ? (
                    <p className="mt-1 text-xs text-muted">
                      {monthlyYoY[monthlyYoY.length - 1].label}は
                      {fmtMD(monthlyYoY[monthlyYoY.length - 1].curRange.end)}
                      までの実績（月の途中）です。前年同期も同じ日数までで比較しています。
                    </p>
                  ) : null}
                  <p className="mt-1 text-right text-xs text-muted">
                    対象期間計 {yen(monthlyYoY.reduce((s, m) => s + m.curSales, 0))}（前年同期計{" "}
                    {yen(monthlyYoY.reduce((s, m) => s + m.prevSales, 0))}）
                    {monthlyYoY[monthlyYoY.length - 1].isPartial ? "※末月は途中までの合計" : ""}
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
  delta: Delta;
}) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-1.5 text-muted">{label}</td>
      <td className="py-1.5 text-right font-mono tabular-nums">{cur}</td>
      <td className="py-1.5 text-right font-mono tabular-nums text-muted">{prev}</td>
      <td className={"py-1.5 text-right font-mono text-xs tabular-nums " + toneTextClass(delta.tone)}>
        {directionArrow(delta.direction)}
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
  delta?: Delta;
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 overflow-x-auto whitespace-nowrap font-mono text-lg font-bold tabular-nums">
        {value}
      </div>
      {delta ? (
        <div className={"mt-0.5 text-xs font-medium " + toneTextClass(delta.tone)}>
          {directionArrow(delta.direction)}
          {delta.text.replace(/^\S+比\s*/, "")}
        </div>
      ) : null}
    </div>
  );
}

/** 月末着地予想エリアの3項目（月末売上予想／目標との差額／予想達成率）。
 *  横並び(sm以上)・縦並び(スマホ)いずれでも金額が切れないよう安全弁を付ける。 */
function ForecastStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div
        className={
          "mt-0.5 overflow-x-auto whitespace-nowrap font-mono text-lg font-bold tabular-nums " +
          (tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "")
        }
      >
        {value}
      </div>
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
  delta?: Delta;
  extraDelta?: Delta;
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
              {directionArrow(delta.direction)}
              {delta.text}
            </div>
          ) : null}
          {extraDelta ? (
            <div className={"mt-0.5 text-xs font-medium " + toneTextClass(extraDelta.tone)}>
              {directionArrow(extraDelta.direction)}
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

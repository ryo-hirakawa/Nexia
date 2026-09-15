import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { jstDateString, yen, isValidDateStr } from "@/lib/daily";
import { latestRecordedDate } from "@/lib/monthly-server";
import {
  loadDashboardData,
  loadFlRateTrend,
  loadCounterpartyTrend,
  loadStaffTrend,
  type EntityMonthlyTrend,
} from "@/lib/dashboard-server";
import { shiftRef, periodLabel } from "@/lib/period";
import { CompositionDonut, CostCompareBars, RankedBarList, TrendBars } from "../dashboard/charts";
import { ExpenseControls } from "./controls";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string; s?: string }>;
}) {
  await requireMembership();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: storeRows } = await supabase
    .from("stores")
    .select("id, name, industry")
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
  const refDate =
    sp.d && isValidDateStr(sp.d)
      ? sp.d
      : ((await latestRecordedDate(store.id)) ?? jstDateString(0));
  const prevRefDate = shiftRef("month", refDate, -1);

  const [d, previous, flTrend, vendorTrend, staffTrend] = await Promise.all([
    loadDashboardData(store.id, "month", refDate),
    loadDashboardData(store.id, "month", prevRefDate, { detail: false }),
    loadFlRateTrend(store.id, refDate, 12),
    loadCounterpartyTrend(store.id, refDate, 3, 8),
    loadStaffTrend(store.id, refDate, 3),
  ]);
  const costTotal = d.cogs + d.labor + d.fixedProrated + d.variable;
  const prevCostTotal = previous.cogs + previous.labor + previous.fixedProrated + previous.variable;
  const hasPrev = previous.recordedDays > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-navy">経費分析</h1>
          <p className="text-sm text-muted">{store.name}・{periodLabel("month", refDate)}</p>
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <ExpenseControls refDate={refDate} storeId={store.id} stores={stores.length > 1 ? stores : undefined} />
        </div>

        {d.fetchErrors.length > 0 ? (
          <p className="mt-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-sm text-bad">
            一部データの取得に失敗しました（{d.fetchErrors.join("・")}）。
            表示中の数値にこれらは反映されていない可能性があります。再読み込みしてください。
          </p>
        ) : null}
      </div>

      {d.recordedDays === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
          この月の記録がありません。
          <br />
          <Link href="/input" className="font-semibold text-navy underline">
            日次入力
          </Link>{" "}
          から記録してください。
        </div>
      ) : (
        <>
          <Card title={`${periodLabel("month", refDate)}の経費内訳`}>
            <CompositionDonut
              data={d.costByClass.filter((c) => c.amount > 0).map((c) => ({ name: c.label, amount: c.amount }))}
              centerLabel="経費計"
              centerValue={costTotal}
            />
            <div className="mt-4 space-y-4 border-t border-line pt-4">
              <h3 className="text-xs font-semibold text-navy">経費の内訳（どこに使ったか）</h3>
              {d.cogsByItem.length ? (
                <BreakdownBlock label="仕入れ（原価）" total={d.cogs}>
                  <RankedBarList items={d.cogsByItem} />
                </BreakdownBlock>
              ) : null}
              {d.laborByItem.length ? (
                <BreakdownBlock label="人件費" total={d.labor}>
                  <RankedBarList items={d.laborByItem} />
                </BreakdownBlock>
              ) : null}
              {d.variableByItem.length ? (
                <BreakdownBlock label="流動費" total={d.variable}>
                  <RankedBarList items={d.variableByItem} />
                </BreakdownBlock>
              ) : null}
              {d.byCounterparty.length ? (
                <BreakdownBlock
                  label="取引先別（仕入れ・流動費）"
                  total={d.byCounterparty.reduce((s, i) => s + i.amount, 0)}
                  note={
                    d.creditPayable > 0
                      ? `内 掛（買掛）合計 ${yen(d.creditPayable)}（支払い済みかは別管理）`
                      : undefined
                  }
                >
                  <RankedBarList
                    items={d.byCounterparty.map((v) => ({ name: v.name, amount: v.amount, sub: v.credit }))}
                    subLabel="内 掛（買掛）"
                  />
                </BreakdownBlock>
              ) : null}
            </div>
            {hasPrev ? (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer select-none text-xs text-muted">
                  当月 vs 前月 のグラフを見る
                </summary>
                <div className="mt-2">
                  <CostCompareBars
                    data={d.costByClass.map((c) => ({
                      label: c.label,
                      current: c.amount,
                      previous: previous.costByClass.find((p) => p.key === c.key)?.amount ?? 0,
                    }))}
                    curLabel="当月"
                    prevLabel="前月"
                  />
                  <p className="mt-1 text-right text-xs text-muted">
                    経費計 {yen(costTotal)}（前月 {yen(prevCostTotal)}）
                  </p>
                </div>
              </details>
            ) : null}
            <div className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
              <p>
                固定費・月給スタッフは、休業日や未入力日があっても発生する費用として、その月の暦日数で按分（月が終了していれば設定額の全額）。
              </p>
              {d.hasLoanRepaymentLines ? (
                <p>借入返済（参考・営業利益には含めない）: {yen(d.loanRepaymentProrated)}</p>
              ) : null}
              {d.hasDepreciationLines ? (
                <p>うち減価償却 {yen(d.depreciationProrated)} は費用として含みますが、現金の支出ではありません</p>
              ) : null}
              <p>原価（仕入れ）は仕入額をそのまま計上しています（棚卸は反映していません）</p>
            </div>
          </Card>

          <Card title="FLコスト率の推移（直近12ヶ月）">
            <TrendBars
              unit="percent"
              data={flTrend.map((m) => ({ label: m.label, value: (m.flRate ?? 0) * 100, dim: !m.hasData }))}
            />
            <p className="mt-2 text-xs text-muted">
              FLコスト率 = (原価＋人件費) ÷ 売上。月給スタッフの日割り分は含まない、日次記録ベースの簡易値です（ダッシュボードのFLコスト率とは一致しない場合があります）。
            </p>
          </Card>

          {vendorTrend.length ? (
            <Card title="取引先別コストの推移（直近3ヶ月・上位8件）">
              <TrendTable rows={vendorTrend} />
            </Card>
          ) : null}

          {staffTrend.length ? (
            <Card title="スタッフ別人件費の推移（直近3ヶ月）">
              <TrendTable rows={staffTrend} />
            </Card>
          ) : null}

          <Card title="レシピ原価差異（理論値 vs 実際仕入れ）">
            <p className="text-sm text-muted">
              メニューごとの販売数（出数）が取得でき次第、理論原価と実際の仕入れ額の差異を表示できるようになります。現在エアレジ連携の準備中です。
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="bg-navy px-4 py-2.5 text-sm font-semibold text-white">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function BreakdownBlock({
  label,
  total,
  note,
  children,
}: {
  label: string;
  total: number;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted">{yen(total)}</span>
      </div>
      {children}
      {note ? <p className="mt-1 text-[10px] text-muted">{note}</p> : null}
    </div>
  );
}

/** 取引先別・スタッフ別の月次推移テーブル(直近数ヶ月を横に並べる)。 */
function TrendTable({ rows }: { rows: EntityMonthlyTrend[] }) {
  const months = rows[0]?.monthly ?? [];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="pb-1.5 text-left font-medium">名前</th>
            {months.map((m) => (
              <th key={m.monthKey} className="pb-1.5 text-right font-medium">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-b border-line last:border-0">
              <td className="py-1.5 font-medium">{r.name}</td>
              {r.monthly.map((m) => (
                <td key={m.monthKey} className="py-1.5 text-right font-mono tabular-nums">
                  {m.amount > 0 ? yen(m.amount) : "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

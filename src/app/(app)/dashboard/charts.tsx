"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  LabelList,
  Legend,
  Tooltip,
} from "recharts";

/** 親要素の実幅を ResizeObserver で測る（recharts の ResponsiveContainer が
 *  React 19 hydration 時に 0 幅のまま固まる問題の回避） */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const NAVY = "var(--navy)";
const ORANGE = "var(--orange)";
const TRACK = "var(--line)";
const MUTED = "var(--muted)";
const PIE_COLORS = [
  "var(--navy)",
  "var(--orange)",
  "#6f8bb0",
  "#f0a35e",
  "#9db2cc",
  "#c9ced8",
];

const yen0 = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");

/** recharts の Tooltip の見た目をカードと統一する共通ラッパー */
function TooltipBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      {children}
    </div>
  );
}
/** グラフのラベル用：千円単位の "k" ではなく日本語の「万」で表示。
 *  0 は空欄にせず "0" と明示する（定休日などを「未入力」と誤解させないため）。 */
const manLabel = (n: number) => (n ? Math.round(n / 10000).toLocaleString("ja-JP") + "万" : "0");

/** 目標達成率のゲージ（0〜120%+） */
export function AchievementGauge({ rate }: { rate: number | null }) {
  const pctNum = rate === null ? 0 : Math.round(rate * 100);
  const clamped = Math.min(pctNum, 100);
  return (
    <div className="relative h-14 w-14 shrink-0">
      <ResponsiveContainer>
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          data={[{ v: clamped }]}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            background={{ fill: TRACK }}
            dataKey="v"
            cornerRadius={10}
            fill={pctNum >= 100 ? ORANGE : NAVY}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-[10px] font-bold text-orange">
          {rate === null ? "—" : pctNum + "%"}
        </span>
      </div>
    </div>
  );
}

/** 日次の売上推移（棒）。本数が多い（月表示など）ときは棒の上の数字が
 *  重なるため常時表示をやめ、ホバー/タップで詳細（日付・曜日・金額・
 *  未入力かどうか）を確認できるようにする。本数が少ない（週表示など）
 *  ときは従来どおり数字を常時表示する。 */
export function TrendBars({
  data,
}: {
  data: { label: string; value: number; dim?: boolean }[];
}) {
  const [ref, w] = useWidth();
  const dense = data.length > 12;
  return (
    <div ref={ref} className="h-48 w-full">
      {w > 0 ? (
        <BarChart
          width={w}
          height={192}
          data={data}
          margin={{ top: 16, right: 4, bottom: 0, left: 4 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: MUTED }}
            axisLine={{ stroke: TRACK }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <Tooltip
            cursor={{ fill: "var(--line)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { label: string; value: number; dim?: boolean };
              return (
                <TooltipBox>
                  <div className="font-semibold">{p.label}</div>
                  <div className="mt-0.5 font-mono tabular-nums">{yen0(p.value)}</div>
                  {p.dim ? <div className="mt-0.5 text-muted">未入力（休業を含む可能性があります）</div> : null}
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={26} minPointSize={2} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.dim ? TRACK : NAVY} />
            ))}
            {!dense ? (
              <LabelList
                dataKey="value"
                position="top"
                formatter={(v) => manLabel(Number(v) || 0)}
                style={{ fontSize: 9, fill: MUTED }}
              />
            ) : null}
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

/** 内訳ドーナツ（中央に合計） */
export function CompositionDonut({
  data,
  centerLabel,
  centerValue,
}: {
  data: { name: string; amount: number }[];
  centerLabel: string;
  centerValue: number;
}) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  return (
    // 幅が狭い（スマホ縦向きなど）ときは横並びだと凡例の金額が画面外にはみ出す
    // ため、その場合はドーナツを上・凡例を下に積む。sm 以上で横並びにする。
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={1}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] text-muted">{centerLabel}</span>
          <span className="font-mono text-xs font-bold">{yen0(centerValue)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="min-w-0 flex-1 truncate text-muted">{d.name}</span>
            <span className="shrink-0 font-mono tabular-nums">{yen0(d.amount)}</span>
            <span className="w-10 shrink-0 text-right text-xs text-muted">
              {total > 0 ? Math.round((d.amount / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LIGHT = "#9aa4b2";

/** 費目別経費：当該期間 vs 比較対象期間（グループ棒）。ラベルは呼び出し側（日/週/月）で指定。 */
export function CostCompareBars({
  data,
  curLabel,
  prevLabel,
}: {
  data: { label: string; current: number; previous: number }[];
  curLabel: string;
  prevLabel: string;
}) {
  const [ref, w] = useWidth();
  return (
    <div ref={ref} className="h-56 w-full">
      {w > 0 ? (
        <BarChart
          width={w}
          height={224}
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: MUTED }}
            axisLine={{ stroke: TRACK }}
            tickLine={false}
          />
          <Legend
            verticalAlign="top"
            height={24}
            wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
            formatter={(v) => (v === "current" ? curLabel : prevLabel)}
          />
          <Tooltip
            cursor={{ fill: "var(--line)", opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipBox>
                  <div className="font-semibold">{label}</div>
                  {payload.map((p) => (
                    <div key={p.dataKey as string} className="mt-0.5 flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: p.dataKey === "current" ? NAVY : LIGHT }}
                      />
                      <span className="text-muted">{p.dataKey === "current" ? curLabel : prevLabel}</span>
                      <span className="font-mono tabular-nums">{yen0(Number(p.value) || 0)}</span>
                    </div>
                  ))}
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="current" name="current" fill={NAVY} radius={[3, 3, 0, 0]} maxBarSize={28} minPointSize={2} isAnimationActive={false} />
          <Bar dataKey="previous" name="previous" fill={LIGHT} radius={[3, 3, 0, 0]} maxBarSize={28} minPointSize={2} isAnimationActive={false} />
        </BarChart>
      ) : null}
    </div>
  );
}

/** 曜日別 平均売上（月曜始まり。最大の曜日をアクセント色で強調） */
export function WeekdayBars({
  data,
}: {
  data: { label: string; avg: number; days: number }[];
}) {
  const [ref, w] = useWidth();
  const max = Math.max(0, ...data.map((d) => d.avg));
  return (
    <div ref={ref} className="h-48 w-full">
      {w > 0 ? (
        <BarChart
          width={w}
          height={192}
          data={data}
          margin={{ top: 16, right: 8, bottom: 0, left: 8 }}
        >
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: TRACK }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--line)", opacity: 0.5 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { label: string; avg: number; days: number };
              return (
                <TooltipBox>
                  <div className="font-semibold">{p.label}曜日</div>
                  <div className="mt-0.5 font-mono tabular-nums">
                    {p.days > 0 ? yen0(p.avg) : "データなし"}
                  </div>
                  <div className="mt-0.5 text-muted">集計 {p.days}日分</div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="avg" radius={[3, 3, 0, 0]} maxBarSize={36} minPointSize={2} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.avg === max && max > 0 ? ORANGE : NAVY} />
            ))}
            <LabelList
              dataKey="avg"
              position="top"
              formatter={(v) => {
                const n = Number(v) || 0;
                return n ? manLabel(n) : "—";
              }}
              style={{ fontSize: 9, fill: MUTED }}
            />
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

/**
 * KPI カード用の当該期間/比較対象期間ミニ比較バー（recharts 不使用の軽量 HTML/CSS）。
 * 数値は省略せずそのままのラベルで表示する。行の見出し（当日/前日 等）は
 * 呼び出し側（日/週/月ビュー）で決めて渡す。
 * ラベル文字列はサーバー側で整形済みのものを渡す（関数は Server → Client
 * Component 境界を越えて渡せないため、フォーマット関数は受け取らない）。
 */
export function MiniCompareBars({
  current,
  previous,
  currentLabel,
  previousLabel,
  curTag,
  prevTag,
}: {
  current: number;
  previous: number;
  currentLabel: string;
  previousLabel: string;
  curTag: string;
  prevTag: string;
}) {
  const max = Math.max(Math.abs(current), Math.abs(previous), 1);
  const row = (label: string, value: number, text: string, color: string, muted?: boolean) => (
    <div className="flex items-center gap-2">
      <span
        className="w-8 shrink-0 text-[10px]"
        style={{ color: muted ? MUTED : "inherit", opacity: muted ? 1 : 0.75 }}
      >
        {label}
      </span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width]"
          style={{ width: `${Math.min(100, (Math.abs(value) / max) * 100)}%`, background: color }}
        />
      </span>
      <span className="w-[4.75rem] shrink-0 text-right font-mono text-[10px] tabular-nums" style={{ opacity: 0.85 }}>
        {text}
      </span>
    </div>
  );
  return (
    <div className="mt-2 space-y-1">
      {row(curTag, current, currentLabel, ORANGE)}
      {row(prevTag, previous, previousLabel, LIGHT, true)}
    </div>
  );
}

/** 月別売上：対象期間 vs 前年同期（直近12ヶ月・グループ棒）。月ビュー専用。
 *  「今年/昨年」は12ヶ月が年をまたぐと誤解を招くため使わない。
 *  データがない月は 0円の棒ではなく null にして、棒自体を描かない
 *  （「データなし」を「0円だった」と混同させないため）。
 *  左に金額目盛り（万円単位・自動スケール）と薄い横補助線を追加。 */
export function MonthlyYoYBars({
  data,
}: {
  data: {
    label: string;
    cur: number | null;
    prev: number | null;
    curRangeLabel: string;
    prevRangeLabel: string;
  }[];
}) {
  const [ref, w] = useWidth();
  return (
    <div ref={ref} className="h-64 w-full">
      {w > 0 ? (
        <BarChart
          width={w}
          height={256}
          data={data}
          margin={{ top: 20, right: 8, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke={TRACK} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: MUTED }}
            axisLine={{ stroke: TRACK }}
            tickLine={false}
          />
          <YAxis
            domain={[0, "auto"]}
            tickFormatter={(v) => manLabel(Number(v) || 0)}
            tick={{ fontSize: 10, fill: MUTED }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Legend
            verticalAlign="top"
            height={24}
            wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
            formatter={(v) => (v === "cur" ? "対象期間" : "前年同期")}
          />
          <Tooltip
            cursor={{ fill: "var(--line)", opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as {
                label: string;
                cur: number | null;
                prev: number | null;
                curRangeLabel: string;
                prevRangeLabel: string;
              };
              return (
                <TooltipBox>
                  <div className="font-semibold">{label}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: NAVY }} />
                    <span className="text-muted">対象期間（{p.curRangeLabel}）</span>
                    <span className="font-mono tabular-nums">
                      {p.cur === null ? "データなし" : yen0(p.cur)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: LIGHT }} />
                    <span className="text-muted">前年同期（{p.prevRangeLabel}）</span>
                    <span className="font-mono tabular-nums">
                      {p.prev === null ? "比較データなし" : yen0(p.prev)}
                    </span>
                  </div>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey="cur" name="cur" fill={NAVY} radius={[2, 2, 0, 0]} maxBarSize={18} minPointSize={2} isAnimationActive={false} />
          <Bar dataKey="prev" name="prev" fill={LIGHT} radius={[2, 2, 0, 0]} maxBarSize={18} minPointSize={2} isAnimationActive={false} />
        </BarChart>
      ) : null}
    </div>
  );
}

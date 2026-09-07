"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  LabelList,
} from "recharts";

const NAVY = "#24406e";
const ORANGE = "#e0791f";
const TRACK = "#e3e6eb";
const PIE_COLORS = ["#24406e", "#e0791f", "#3f6ea5", "#f0a35e", "#8aa4c4", "#c9ced8"];

const yen0 = (n: number) => "¥" + Math.round(n).toLocaleString("ja-JP");

/** 目標達成率のゲージ（0〜120%+） */
export function AchievementGauge({ rate }: { rate: number | null }) {
  const pctNum = rate === null ? 0 : Math.round(rate * 100);
  const clamped = Math.min(pctNum, 100);
  return (
    <div className="relative h-28 w-28">
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
            cornerRadius={20}
            fill={pctNum >= 100 ? ORANGE : NAVY}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="font-mono text-base font-bold text-orange">
          {rate === null ? "—" : pctNum + "%"}
        </span>
      </div>
    </div>
  );
}

/** 日次の売上推移（棒） */
export function TrendBars({
  data,
}: {
  data: { label: string; value: number; dim?: boolean }[];
}) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#98a1b0" }}
            axisLine={{ stroke: TRACK }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={26}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.dim ? TRACK : NAVY} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              formatter={(v) => {
                const n = Number(v) || 0;
                return n ? Math.round(n / 1000) + "k" : "";
              }}
              style={{ fontSize: 9, fill: "#98a1b0" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
    <div className="flex items-center gap-4">
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
      <ul className="flex-1 space-y-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="flex-1 truncate text-muted">{d.name}</span>
            <span className="font-mono tabular-nums">{yen0(d.amount)}</span>
            <span className="w-10 shrink-0 text-right text-xs text-muted">
              {total > 0 ? Math.round((d.amount / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { BarChart, Bar, XAxis, Cell, LabelList } from "recharts";

const NAVY = "#24406e";
const ORANGE = "#e0791f";

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

export function StoreSalesBars({
  data,
}: {
  data: { name: string; sales: number; belowTarget: boolean }[];
}) {
  const [ref, w] = useWidth();
  return (
    <div ref={ref} className="h-52 w-full">
      {w > 0 ? (
        <BarChart
          width={w}
          height={208}
          data={data}
          margin={{ top: 18, right: 8, bottom: 0, left: 8 }}
        >
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#98a1b0" }}
            axisLine={{ stroke: "#e3e6eb" }}
            tickLine={false}
            interval={0}
          />
          <Bar dataKey="sales" radius={[3, 3, 0, 0]} maxBarSize={48} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.belowTarget ? ORANGE : NAVY} />
            ))}
            <LabelList
              dataKey="sales"
              position="top"
              formatter={(v) => {
                const n = Number(v) || 0;
                return n ? "¥" + Math.round(n / 10000) + "万" : "";
              }}
              style={{ fontSize: 10, fill: "#98a1b0" }}
            />
          </Bar>
        </BarChart>
      ) : null}
    </div>
  );
}

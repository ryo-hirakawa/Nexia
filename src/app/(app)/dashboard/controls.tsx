"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { periodLabel, shiftRef, type DashView } from "@/lib/period";

const VIEWS: { key: DashView; label: string }[] = [
  { key: "day", label: "日" },
  { key: "week", label: "週" },
  { key: "month", label: "月" },
];

export function DashControls({
  view,
  refDate,
  storeId,
  recordedDays,
  draftDays,
}: {
  view: DashView;
  refDate: string;
  storeId: string;
  recordedDays: number;
  draftDays: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (o: Record<string, string>) => {
    const p = new URLSearchParams({ view, d: refDate, s: storeId, ...o });
    start(() => router.push(`/dashboard?${p.toString()}`));
  };

  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex overflow-hidden rounded-lg border border-line text-sm">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              disabled={pending}
              onClick={() => go({ view: v.key })}
              className={
                "px-3.5 py-1.5 font-medium transition-colors " +
                (v.key === view
                  ? "bg-navy text-white"
                  : "bg-surface text-muted hover:bg-surface-2")
              }
            >
              {v.label}
            </button>
          ))}
        </div>
        {pending ? (
          <span className="text-xs text-muted">読み込み中…</span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          disabled={pending}
          onClick={() => go({ d: shiftRef(view, refDate, -1) })}
          className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
        >
          ◀
        </button>
        <span className="font-semibold">{periodLabel(view, refDate)}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => go({ d: shiftRef(view, refDate, 1) })}
          className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
        >
          ▶
        </button>

        {/* 日付を直接指定してジャンプ */}
        <label className="flex items-center gap-1.5 text-xs text-muted">
          日付を指定
          <input
            type="date"
            value={refDate}
            disabled={pending}
            onChange={(e) => {
              if (e.target.value) go({ d: e.target.value });
            }}
            className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-foreground"
          />
        </label>

        {recordedDays > 0 ? (
          <span className="text-xs text-muted">
            記録 {recordedDays} 日
            {draftDays > 0 ? `（うち未確定 ${draftDays} 日）` : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}

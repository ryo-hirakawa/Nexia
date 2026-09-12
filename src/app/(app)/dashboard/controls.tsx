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
  stores,
}: {
  view: DashView;
  refDate: string;
  storeId: string;
  recordedDays: number;
  draftDays: number;
  /** 2件以上あるときだけ店舗切り替えを表示する */
  stores?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (o: Record<string, string>) => {
    const p = new URLSearchParams({ view, d: refDate, s: storeId, ...o });
    start(() => router.push(`/dashboard?${p.toString()}`));
  };

  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      {/* 日付・週・月・店舗の切り替え中は、下のKPIカードなど画面全体に
          薄いオーバーレイをかぶせる。position:fixed で自身のDOM位置とは
          無関係に画面全体を覆うため、page.tsx側の構造を変えずに済む。
          切り替え前の数値が「新しい条件の実績」に見えてしまわないように、
          読み込み中であることを画面全体で明示する。 */}
      {pending ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-40 flex items-start justify-center bg-white/40 pt-24 backdrop-blur-[1px] dark:bg-black/30"
        >
          <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-muted shadow-sm">
            読み込み中…
          </span>
        </div>
      ) : null}
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

        <div className="flex flex-wrap items-center gap-3">
          {stores && stores.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              店舗
              <select
                value={storeId}
                disabled={pending}
                onChange={(e) => go({ s: e.target.value })}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-foreground"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {pending ? <span className="text-xs text-muted">読み込み中…</span> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ d: shiftRef(view, refDate, -1) })}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label="前の期間"
          >
            ◀
          </button>
          <span className="font-semibold">{periodLabel(view, refDate)}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ d: shiftRef(view, refDate, 1) })}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label="次の期間"
          >
            ▶
          </button>
        </div>

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

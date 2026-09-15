"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { periodLabel, shiftRef } from "@/lib/period";

export function ExpenseControls({
  refDate,
  storeId,
  stores,
}: {
  refDate: string;
  storeId: string;
  /** 2件以上あるときだけ店舗切り替えを表示する */
  stores?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const go = (o: Record<string, string>) => {
    const p = new URLSearchParams({ d: refDate, s: storeId, ...o });
    start(() => router.push(`/expenses?${p.toString()}`));
  };

  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ d: shiftRef("month", refDate, -1) })}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label="前の月"
          >
            ◀
          </button>
          <span className="font-semibold">{periodLabel("month", refDate)}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ d: shiftRef("month", refDate, 1) })}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label="次の月"
          >
            ▶
          </button>
        </div>

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
  );
}

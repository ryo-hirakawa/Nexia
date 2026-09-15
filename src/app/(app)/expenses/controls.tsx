"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { periodLabel, monthEnd, minDate } from "@/lib/period";

/** 前月/翌月ボタンでは、過去の完了済みの月は必ず「その月の末日」を基準日にする
 *  （日付を1日ずつ引き継ぐと、今日と同じ日付までしか表示されず月の途中で
 *  切れて見えてしまうため）。当月・未来は today を超えないようにする。 */
function shiftMonth(refDate: string, dir: 1 | -1, todayKey: string): string {
  const [y, m] = refDate.slice(0, 7).split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  const targetMonthKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return minDate(monthEnd(`${targetMonthKey}-01`), todayKey);
}

export function ExpenseControls({
  refDate,
  storeId,
  todayKey,
  stores,
}: {
  refDate: string;
  storeId: string;
  /** 前月/翌月ボタンの上限（未来にならないようにするため。基本は今日の日付） */
  todayKey: string;
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
            onClick={() => go({ d: shiftMonth(refDate, -1, todayKey) })}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label="前の月"
          >
            ◀
          </button>
          <span className="font-semibold">{periodLabel("month", refDate)}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => go({ d: shiftMonth(refDate, 1, todayKey) })}
            className="rounded-md border border-line px-2 py-1 hover:bg-surface-2"
            aria-label="次の月"
          >
            ▶
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* 日付を直接指定してジャンプ（ダッシュボードと同様） */}
          <label className="flex items-center gap-1.5 text-xs text-muted">
            日付を指定
            <input
              type="date"
              value={refDate}
              max={todayKey}
              disabled={pending}
              onChange={(e) => {
                if (e.target.value) go({ d: e.target.value });
              }}
              className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-foreground"
            />
          </label>

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
    </div>
  );
}

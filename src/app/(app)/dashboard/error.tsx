"use client";

import { useEffect } from "react";

/**
 * ダッシュボードの読み込みに失敗したときのエラー画面。
 * 「データなし」（正常系・0件）とは別の状態として区別し、再試行できるようにする。
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] load error:", error);
  }, [error]);

  return (
    <div className="rounded-xl border border-bad/30 bg-bad/5 p-6 text-center">
      <p className="text-sm font-semibold text-bad">データの取得に失敗しました</p>
      <p className="mt-1 text-sm text-muted">
        通信状況が悪いか、一時的な不具合の可能性があります。もう一度お試しください。
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        再読み込み
      </button>
    </div>
  );
}

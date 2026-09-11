import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { loadDashboardData, loadWeekdayAverages, loadMonthlyYoY } from "@/lib/dashboard-server";
import { shiftRef, shiftYearRef } from "@/lib/period";

// TEMPORARY diagnostic route to find where dashboard latency actually goes.
// Not linked from any UI. Delete after profiling is done.
export async function GET() {
  const marks: { label: string; ms: number }[] = [];
  const t0 = performance.now();
  const mark = (label: string) => marks.push({ label, ms: Math.round(performance.now() - t0) });

  const membership = await requireMembership();
  mark("requireMembership");

  const supabase = await createClient();
  const { data: storeRows } = await supabase
    .from("stores")
    .select("id, name")
    .order("created_at", { ascending: true });
  mark("stores query");

  const store = (storeRows ?? [])[0];
  if (!store) {
    return NextResponse.json({ error: "no store", marks });
  }

  const view = "month" as const;
  const refDate = "2026-09-10";
  const prevRefDate = shiftRef(view, refDate, -1);
  const yearAgoRefDate = shiftYearRef(refDate, -1);

  // Isolation test: run each branch ALONE (no concurrent siblings) to see
  // whether per-call latency is consistent regardless of how many other
  // calls are in flight at once. If concurrency is the bottleneck, each of
  // these alone should be much faster than the combined Promise.all below.
  await loadDashboardData(store.id, view, refDate);
  mark("SOLO: loadDashboardData(detail:true)");

  await loadDashboardData(store.id, view, prevRefDate, { detail: false });
  mark("SOLO: loadDashboardData(detail:false)");

  await loadWeekdayAverages(store.id, refDate);
  mark("SOLO: loadWeekdayAverages");

  await loadMonthlyYoY(store.id, refDate);
  mark("SOLO: loadMonthlyYoY");

  await Promise.all([
    loadDashboardData(store.id, view, refDate),
    loadDashboardData(store.id, view, prevRefDate, { detail: false }),
    loadDashboardData(store.id, "month", yearAgoRefDate, { detail: false }),
    loadWeekdayAverages(store.id, refDate),
    loadMonthlyYoY(store.id, refDate),
  ]);
  mark("main Promise.all (dashboard data)");

  return NextResponse.json({
    isPlatformAdmin: membership.isPlatformAdmin,
    marks,
    total: Math.round(performance.now() - t0),
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireMembership } from "@/lib/auth";
import { loadDashboardData, loadWeekdayAverages, loadMonthlyYoY, __lastQueryTimings } from "@/lib/dashboard-server";
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
  const detailTrueQueryTimings = [...__lastQueryTimings];

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

  // Concurrency-contention test: run the SAME 4 "detail" queries the
  // categories/costs/payments/casts branches issue, but ONE AT A TIME
  // (sequential, not Promise.all) with nothing else in flight. If each is
  // fast alone but slow when run together (as in detailTrueQueryTimings
  // above), that proves a shared concurrency/connection limit is queueing
  // them rather than each query being inherently slow.
  const range = { start: `${refDate.slice(0, 7)}-01`, end: refDate };
  const seqTimings: { label: string; ms: number; count: number }[] = [];
  const seqTable = async (label: string, table: string, cols: string) => {
    const t0q = Date.now();
    const { data } = await supabase
      .from(table)
      .select(`${cols}, daily_records!inner(store_id, business_date)`)
      .eq("daily_records.store_id", store.id)
      .gte("daily_records.business_date", range.start)
      .lte("daily_records.business_date", range.end);
    seqTimings.push({ label, ms: Date.now() - t0q, count: data?.length ?? 0 });
  };
  await seqTable("SEQ: categories", "daily_sales_categories", "category, amount");
  await seqTable("SEQ: costs", "daily_costs", "cost_class, item, amount");
  await seqTable("SEQ: payments", "daily_payments", "method, amount");
  await seqTable("SEQ: casts", "daily_cast_sales", "cast_name, nominate_amount, table_amount, companion_amount, back_amount");
  mark("sequential detail queries (one at a time)");

  return NextResponse.json({
    isPlatformAdmin: membership.isPlatformAdmin,
    marks,
    detailTrueQueryTimings,
    seqTimings,
    total: Math.round(performance.now() - t0),
  });
}

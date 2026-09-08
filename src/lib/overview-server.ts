import { createClient } from "@/lib/supabase/server";
import { loadDashboardData } from "@/lib/dashboard-server";
import { latestRecordedDate } from "@/lib/monthly-server";
import { jstDateString } from "@/lib/daily";
import { monthStart } from "@/lib/period";

export type OverviewRow = {
  storeId: string;
  storeName: string;
  clientName: string;
  sales: number;
  salesTarget: number;
  targetRate: number | null;
  operatingProfit: number;
  flRate: number | null;
  recordedDays: number;
  missingDays: number;
  lastInput: string | null;
  hasSetup: boolean;
};

export type OverviewData = {
  month: string; // "2026-09"
  rows: OverviewRow[];
  totals: {
    stores: number;
    sales: number;
    target: number;
    profit: number;
    alerts: number;
  };
};

export async function loadOverview(): Promise<OverviewData> {
  const supabase = await createClient();

  const { data: storeRows } = await supabase
    .from("stores")
    .select("id, name, clients(name)")
    .order("created_at", { ascending: true });
  const stores = storeRows ?? [];

  const today = jstDateString(0);
  const yesterday = jstDateString(-1);
  const ms = monthStart(today);
  const elapsed = Math.max(
    0,
    Math.round(
      (Date.parse(yesterday + "T00:00:00Z") - Date.parse(ms + "T00:00:00Z")) /
        86_400_000,
    ) + 1,
  );

  const rows: OverviewRow[] = await Promise.all(
    stores.map(async (s) => {
      const [d, last] = await Promise.all([
        loadDashboardData(s.id, "month", today),
        latestRecordedDate(s.id),
      ]);
      const client = s.clients as { name: string } | { name: string }[] | null;
      const clientName = Array.isArray(client)
        ? (client[0]?.name ?? "")
        : (client?.name ?? "");
      return {
        storeId: s.id,
        storeName: s.name,
        clientName,
        sales: d.sales,
        salesTarget: d.salesTarget,
        targetRate: d.targetRate,
        operatingProfit: d.operatingProfit,
        flRate: d.flRate,
        recordedDays: d.recordedDays,
        missingDays: Math.max(0, elapsed - d.recordedDays),
        lastInput: last,
        hasSetup: d.hasSetup,
      };
    }),
  );

  return {
    month: today.slice(0, 7),
    rows,
    totals: {
      stores: rows.length,
      sales: rows.reduce((a, r) => a + r.sales, 0),
      target: rows.reduce((a, r) => a + r.salesTarget, 0),
      profit: rows.reduce((a, r) => a + r.operatingProfit, 0),
      alerts: rows.filter((r) => r.missingDays >= 2 || !r.hasSetup).length,
    },
  };
}

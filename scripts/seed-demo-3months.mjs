/**
 * Bar Miami 大名 のデモデータ（クライアント提示用）。
 * 2026年6・7・8月（フル）＋9月1〜7日、月間売上 約400万。
 *
 *   node --env-file=.env.local scripts/seed-demo-3months.mjs
 */
import { createClient } from "@supabase/supabase-js";

const a = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
const STORE = "ae90021f-29c7-423c-a23e-f402f267860c";

// 決定的乱数
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260908);
const noise = (pct) => 1 + (rnd() * 2 - 1) * pct; // 0.x 倍率
const jitter = (base, pct) => Math.round(base * noise(pct)); // base は整数向け
const roundTo = (n, unit) => Math.round(n / unit) * unit;

const CATS = ["セット・チャージ", "ボトル・キープ", "ドリンク", "フード", "その他"];
const CAT_RATIO = [0.35, 0.28, 0.22, 0.08, 0.07];
const CAST_NAMES = ["あや", "みき", "れな", "ゆい", "さき"];
const VARIABLE = ["消耗品", "送り（タクシー）", "販促・広告", "衛生・清掃", "雑費"];

function daysOf(year, month /* 1-12 */, lastDay) {
  const end = lastDay ?? new Date(Date.UTC(year, month, 0)).getUTCDate();
  const out = [];
  for (let d = 1; d <= end; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    if (dt.getUTCDay() === 0) continue; // 日曜定休
    out.push({
      date: `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      dow: dt.getUTCDay(),
    });
  }
  return out;
}

async function clearStore() {
  await a.from("daily_records").delete().eq("store_id", STORE);
  await a.from("monthly_setups").delete().eq("store_id", STORE);
  await a.from("monthly_targets").delete().eq("store_id", STORE);
}

async function setupMonth(ym) {
  const { data: ms } = await a
    .from("monthly_setups")
    .upsert({ store_id: STORE, year_month: ym }, { onConflict: "store_id,year_month" })
    .select("id")
    .single();
  await a.from("fixed_cost_lines").delete().eq("monthly_setup_id", ms.id);
  await a.from("monthly_staff").delete().eq("monthly_setup_id", ms.id);
  await a.from("fixed_cost_lines").insert([
    { monthly_setup_id: ms.id, item: "店舗家賃", category: "地代家賃", amount_monthly: 250000, sort_order: 0 },
    { monthly_setup_id: ms.id, item: "製氷機・カラオケ", category: "リース料", amount_monthly: 45000, sort_order: 1 },
    { monthly_setup_id: ms.id, item: "火災保険", category: "保険料", amount_monthly: 8000, sort_order: 2 },
    { monthly_setup_id: ms.id, item: "回線・会計ソフト", category: "通信・サブスク", amount_monthly: 30000, sort_order: 3 },
    { monthly_setup_id: ms.id, item: "借入返済", category: "借入返済", amount_monthly: 60000, sort_order: 4 },
    { monthly_setup_id: ms.id, item: "内装 減価償却", category: "減価償却", amount_monthly: 40000, sort_order: 5 },
  ]);
  await a.from("monthly_staff").insert([
    { monthly_setup_id: ms.id, staff_name: "店長 佐藤", amount_monthly: 380000, sort_order: 0 },
    { monthly_setup_id: ms.id, staff_name: "社員 田中", amount_monthly: 300000, sort_order: 1 },
  ]);
  await a
    .from("monthly_targets")
    .upsert(
      { store_id: STORE, year_month: ym, sales_target: 4000000 },
      { onConflict: "store_id,year_month" },
    );
}

function buildDay(date, dow, prevBalanceRef) {
  const base = dow === 5 ? 190000 : dow === 6 ? 230000 : 130000;
  const sales = roundTo(jitter(base, 0.13), 1000);

  // カテゴリ（端数は最後で調整）
  let acc = 0;
  const cats = CAT_RATIO.map((r, i) => {
    if (i === CAT_RATIO.length - 1) return sales - acc;
    const v = roundTo(sales * r * (1 + (rnd() * 0.2 - 0.1)), 1000);
    acc += v;
    return v;
  });

  const guests = Math.max(1, Math.round(sales / (6100 * noise(0.08))));
  const groups = Math.max(1, Math.round(guests / (2.6 * noise(0.1))));

  // 決済（売掛 = 当日発生。cash で帳尻）
  const incurred = roundTo(sales * 0.12 * noise(0.4), 1000);
  const card = roundTo(sales * 0.28 * noise(0.2), 1000);
  const emoney = roundTo(sales * 0.04 * noise(0.5), 500);
  const cash = sales - card - emoney - incurred;

  // 売掛 回収（たまに）
  const collected =
    rnd() < 0.35 ? roundTo(prevBalanceRef.v * 0.35 * noise(0.4), 1000) : 0;
  prevBalanceRef.v = Math.max(0, prevBalanceRef.v + incurred - collected);

  // キャスト
  const nCast = 3 + (rnd() < 0.5 ? 1 : 0);
  const casts = [];
  for (let i = 0; i < nCast; i++) {
    const nom = roundTo(jitter(22000, 0.5), 1000);
    const tbl = roundTo(jitter(9000, 0.6), 1000);
    const comp = rnd() < 0.4 ? roundTo(jitter(6000, 0.3), 1000) : 0;
    const back = roundTo((nom + tbl + comp) * 0.3, 100);
    casts.push({ name: CAST_NAMES[i], nom, tbl, comp, back });
  }
  const castBack = casts.reduce((s, c) => s + c.back, 0);

  // コスト
  const cogs = roundTo(sales * 0.13 * noise(0.15), 1000);
  const wage = roundTo(28000 * noise(0.2), 1000);
  const hiPay = rnd() < 0.4 ? roundTo(6000 * noise(0.3), 1000) : 0;
  const vMap = new Map();
  const nV = 1 + (rnd() < 0.6 ? 1 : 0);
  for (let i = 0; i < nV; i++) {
    const item = VARIABLE[Math.floor(rnd() * VARIABLE.length)];
    const amt = roundTo(3000 * noise(0.6), 500);
    vMap.set(item, (vMap.get(item) ?? 0) + amt);
  }
  const vRows = [...vMap.entries()].map(([item, amount]) => ({ item, amount }));

  return { date, sales, cats, guests, groups, cash, card, emoney, incurred, collected, casts, castBack, cogs, wage, hiPay, vRows };
}

async function insertDay(day) {
  const { data: rec } = await a
    .from("daily_records")
    .upsert(
      {
        store_id: STORE,
        business_date: day.date,
        status: "confirmed",
        weather: ["晴", "曇", "雨"][Math.floor(rnd() * 3)],
        total_sales: day.sales,
        guest_count: day.guests,
        group_count: day.groups,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "store_id,business_date" },
    )
    .select("id")
    .single();
  const rid = rec.id;
  for (const t of [
    "daily_sales_categories",
    "daily_payments",
    "daily_costs",
    "daily_receivable_entries",
    "daily_cast_sales",
  ])
    await a.from(t).delete().eq("daily_record_id", rid);

  await a.from("daily_sales_categories").insert(
    CATS.map((category, i) => ({ daily_record_id: rid, category, amount: day.cats[i], sort_order: i })),
  );
  await a.from("daily_payments").insert([
    { daily_record_id: rid, method: "cash", amount: day.cash },
    { daily_record_id: rid, method: "card", amount: day.card },
    { daily_record_id: rid, method: "emoney", amount: day.emoney },
    { daily_record_id: rid, method: "receivable", amount: day.incurred },
  ]);
  await a.from("daily_costs").insert([
    { daily_record_id: rid, cost_class: "cogs", item: "酒類", amount: day.cogs, sort_order: 0 },
    { daily_record_id: rid, cost_class: "labor", item: "スタッフ時給", amount: day.wage, sort_order: 1 },
    ...(day.hiPay ? [{ daily_record_id: rid, cost_class: "labor", item: "日払い", amount: day.hiPay, sort_order: 2 }] : []),
    { daily_record_id: rid, cost_class: "labor", item: "キャストバック", amount: day.castBack, sort_order: 3 },
    ...day.vRows.map((v, i) => ({ daily_record_id: rid, cost_class: "variable", item: v.item, amount: v.amount, sort_order: 10 + i })),
  ]);
  const recv = [{ daily_record_id: rid, direction: "incurred", counterparty: "常連客", amount: day.incurred, sort_order: 0 }];
  if (day.collected > 0) recv.push({ daily_record_id: rid, direction: "collected", counterparty: "常連客", amount: day.collected, sort_order: 1 });
  await a.from("daily_receivable_entries").insert(recv);
  await a.from("daily_cast_sales").insert(
    day.casts.map((c, i) => ({
      daily_record_id: rid,
      cast_name: c.name,
      nominate_amount: c.nom,
      table_amount: c.tbl,
      companion_amount: c.comp,
      back_amount: c.back,
      sort_order: i,
    })),
  );
}

(async () => {
  await clearStore();
  const months = [
    { ym: "2026-06-01", y: 2026, m: 6, last: null },
    { ym: "2026-07-01", y: 2026, m: 7, last: null },
    { ym: "2026-08-01", y: 2026, m: 8, last: null },
    { ym: "2026-09-01", y: 2026, m: 9, last: 7 },
  ];
  for (const mm of months) {
    await setupMonth(mm.ym);
    const days = daysOf(mm.y, mm.m, mm.last);
    const balRef = { v: 0 };
    let monthSales = 0;
    for (const d of days) {
      const day = buildDay(d.date, d.dow, balRef);
      await insertDay(day);
      monthSales += day.sales;
    }
    console.log(`${mm.ym.slice(0, 7)}: ${days.length}日 / 売上計 ¥${monthSales.toLocaleString("ja-JP")}`);
  }
  console.log("done");
})();

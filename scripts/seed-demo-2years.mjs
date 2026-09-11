/**
 * Bar Miami 大名 のデモデータ（クライアント提示用・過去2年分）。
 * 2024年9月〜2026年9月10日（今日の前日まで）。緩やかな成長カーブ付きで
 * 直近が月商 約400万になるように調整。前年同月比・複数年トレンドの
 * デモ確認用。
 *
 *   node --env-file=.env.local scripts/seed-demo-2years.mjs
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
const rnd = mulberry32(20260911);
const noise = (pct) => 1 + (rnd() * 2 - 1) * pct; // 0.x 倍率
const jitter = (base, pct) => Math.round(base * noise(pct)); // base は整数向け
const roundTo = (n, unit) => Math.round(n / unit) * unit;

const CATS = ["セット・チャージ", "ボトル・キープ", "ドリンク", "フード", "その他"];
const CAT_RATIO = [0.35, 0.28, 0.22, 0.08, 0.07];
const CAST_NAMES = ["あや", "みき", "れな", "ゆい", "さき"];
const VARIABLE = ["消耗品", "送り（タクシー）", "販促・広告", "衛生・清掃", "雑費"];

// 対象期間：今日の2年前の月初 〜 昨日
const TODAY = new Date();
const YESTERDAY = new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate() - 1));
const START = new Date(Date.UTC(YESTERDAY.getUTCFullYear() - 2, YESTERDAY.getUTCMonth(), 1));

function monthList(start, endInclusive) {
  const out = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cur <= endInclusive) {
    const y = cur.getUTCFullYear();
    const m = cur.getUTCMonth() + 1; // 1-12
    const isLastMonth = y === endInclusive.getUTCFullYear() && m === endInclusive.getUTCMonth() + 1;
    out.push({ y, m, lastDay: isLastMonth ? endInclusive.getUTCDate() : null });
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}
const MONTHS = monthList(START, YESTERDAY);

/** 0（一番古い月）〜1（直近月）の緩やかな成長カーブ。直近が基準値=1.0 になる */
function growthMultiplier(monthIndex, totalMonths) {
  const t = totalMonths <= 1 ? 1 : monthIndex / (totalMonths - 1);
  return 0.72 + 0.28 * t; // 2年で約+39%成長のイメージ
}

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

function buildDay(date, dow, growth, prevBalanceRef) {
  const baseRaw = dow === 5 ? 190000 : dow === 6 ? 230000 : 130000;
  const base = baseRaw * growth;
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
    const nom = roundTo(jitter(22000 * growth, 0.5), 1000);
    const tbl = roundTo(jitter(9000 * growth, 0.6), 1000);
    const comp = rnd() < 0.4 ? roundTo(jitter(6000 * growth, 0.3), 1000) : 0;
    const back = roundTo((nom + tbl + comp) * 0.3, 100);
    casts.push({ name: CAST_NAMES[i], nom, tbl, comp, back });
  }
  const castBack = casts.reduce((s, c) => s + c.back, 0);

  // コスト
  const cogs = roundTo(sales * 0.13 * noise(0.15), 1000);
  const wage = roundTo(28000 * growth * noise(0.2), 1000);
  const hiPay = rnd() < 0.4 ? roundTo(6000 * growth * noise(0.3), 1000) : 0;
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
  await Promise.all(
    [
      "daily_sales_categories",
      "daily_payments",
      "daily_costs",
      "daily_receivable_entries",
      "daily_cast_sales",
    ].map((t) => a.from(t).delete().eq("daily_record_id", rid)),
  );

  await Promise.all([
    a.from("daily_sales_categories").insert(
      CATS.map((category, i) => ({ daily_record_id: rid, category, amount: day.cats[i], sort_order: i })),
    ),
    a.from("daily_payments").insert([
      { daily_record_id: rid, method: "cash", amount: day.cash },
      { daily_record_id: rid, method: "card", amount: day.card },
      { daily_record_id: rid, method: "emoney", amount: day.emoney },
      { daily_record_id: rid, method: "receivable", amount: day.incurred },
    ]),
    a.from("daily_costs").insert([
      { daily_record_id: rid, cost_class: "cogs", item: "酒類", amount: day.cogs, sort_order: 0 },
      { daily_record_id: rid, cost_class: "labor", item: "スタッフ時給", amount: day.wage, sort_order: 1 },
      ...(day.hiPay ? [{ daily_record_id: rid, cost_class: "labor", item: "日払い", amount: day.hiPay, sort_order: 2 }] : []),
      { daily_record_id: rid, cost_class: "labor", item: "キャストバック", amount: day.castBack, sort_order: 3 },
      ...day.vRows.map((v, i) => ({ daily_record_id: rid, cost_class: "variable", item: v.item, amount: v.amount, sort_order: 10 + i })),
    ]),
    (async () => {
      const recv = [{ daily_record_id: rid, direction: "incurred", counterparty: "常連客", amount: day.incurred, sort_order: 0 }];
      if (day.collected > 0) recv.push({ daily_record_id: rid, direction: "collected", counterparty: "常連客", amount: day.collected, sort_order: 1 });
      await a.from("daily_receivable_entries").insert(recv);
    })(),
    a.from("daily_cast_sales").insert(
      day.casts.map((c, i) => ({
        daily_record_id: rid,
        cast_name: c.name,
        nominate_amount: c.nom,
        table_amount: c.tbl,
        companion_amount: c.comp,
        back_amount: c.back,
        sort_order: i,
      })),
    ),
  ]);
}

/** 並列実行数を制限しながら全件処理する */
async function runPool(items, limit, worker) {
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
}

(async () => {
  console.log(
    `期間: ${MONTHS[0].y}-${String(MONTHS[0].m).padStart(2, "0")} 〜 ${YESTERDAY.toISOString().slice(0, 10)}（${MONTHS.length}ヶ月）`,
  );
  await clearStore();

  let grandTotal = 0;
  for (let mi = 0; mi < MONTHS.length; mi++) {
    const mm = MONTHS[mi];
    const ym = `${mm.y}-${String(mm.m).padStart(2, "0")}-01`;
    await setupMonth(ym);
    const growth = growthMultiplier(mi, MONTHS.length);
    const days = daysOf(mm.y, mm.m, mm.lastDay);
    const balRef = { v: 0 };
    const built = days.map((d) => buildDay(d.date, d.dow, growth, balRef));
    await runPool(built, 6, insertDay);
    const monthSales = built.reduce((s, d) => s + d.sales, 0);
    grandTotal += monthSales;
    console.log(
      `${ym.slice(0, 7)}: ${days.length}日 / 売上計 ¥${monthSales.toLocaleString("ja-JP")}（成長係数 ${growth.toFixed(2)}）`,
    );
  }
  console.log(`合計 ¥${grandTotal.toLocaleString("ja-JP")}`);
  console.log("done");
})();

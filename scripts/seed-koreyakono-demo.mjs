/**
 * これやこの・なべやこの・たみじや のヒアリング用デモデータを投入する(過去2年分)。
 *
 *   node --env-file=.env.local scripts/seed-koreyakono-demo.mjs
 *
 * これやこの・なべやこのは、実際にもらった日報Excel(2026-08-28 / 2026-08-26)から
 * 抽出した比率(カテゴリ配分・決済配分・原価率)と、Excel内の予算欄(月間目標)を軸に、
 * 2024-09-01 〜 2026-09-13(約2年・前年同月比が機能する期間)の日々の実績を作る
 * (絶対額は目標を軸にした揺らぎ生成で、実データの「その日のコピー」ではない)。
 * 2年前から現在にかけて緩やかな成長カーブ(0.75→1.00)をかけている。
 * たみじやは参考データが無いため、姉妹2店の規模感に合わせた仮の数値(要ヒアリング差し替え)。
 * 経費まわりは「どこまで細かく設定できるか」を見せる目的で、固定費・流動費・
 * 月給スタッフ・日払いの全項目を使う。
 *
 * 日数が多い(約750日×3店舗)ため、日次レコードのIDをクライアント側で発行して
 * 子テーブルをまとめて bulk insert する(1日ずつ往復しない)。
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// ---- 決定的な擬似乱数(mulberry32) ----
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260828);
const jitter = (base, spread) => base * (1 - spread + rand() * spread * 2);
const noise = (spread) => 1 - spread + rand() * spread * 2;

function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

// ---- 期間: 2024-09-01 〜 2026-09-13 ----
const START = { y: 2024, m: 9 };
const END_MONTH_KEYS = []; // "YYYY-MM" 月初セットアップ対象の月一覧
{
  let y = START.y, m = START.m;
  while (y < 2026 || (y === 2026 && m <= 9)) {
    END_MONTH_KEYS.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
}
const TOTAL_MONTHS = END_MONTH_KEYS.length; // 25ヶ月

/** 2年前(係数0.75)→今月(係数1.00)の緩やかな成長カーブ */
function growthFactor(monthKey) {
  const idx = END_MONTH_KEYS.indexOf(monthKey);
  const t = idx / (TOTAL_MONTHS - 1);
  return 0.75 + 0.25 * t;
}

const STORES = [
  {
    name: "これやこの",
    dailyTarget: 4000000 / 30,
    monthlyTarget: 4000000,
    foodRatio: 0.784,
    cashRatio: 0.408,
    foodCostRatio: 0.291,
    drinkCostRatio: 0.187,
    guestPerSales: 30 / 348690,
    groupPerSales: 13 / 348690,
    laborDaily: 24000,
    fixed: [
      { item: "店舗家賃", category: "地代家賃", amount: 300000 },
      { item: "厨房機器リース", category: "リース料", amount: 45000 },
      { item: "店舗総合保険", category: "保険料", amount: 12000 },
      { item: "Airレジ・電話・ネット", category: "通信・サブスク", amount: 18000 },
      { item: "開業時借入返済", category: "借入返済", amount: 60000 },
    ],
    staff: [{ name: "店長", amount: 320000 }],
    vendors: ["カクヤス", "コストコ", "ローソン", "日本リース", "amazon", "西原商会", "イトウ洋酒店"],
    foodVendors: ["西原商会", "コストコ"],
    drinkVendors: ["カクヤス", "イトウ洋酒店"],
    variableVendors: ["ローソン", "amazon", "日本リース"],
  },
  {
    name: "なべやこの",
    dailyTarget: 3750000 / 30,
    monthlyTarget: 3750000,
    foodRatio: 0.674,
    cashRatio: 0.252,
    foodCostRatio: 0.253,
    drinkCostRatio: 0.232,
    guestPerSales: 24 / 112320,
    groupPerSales: 7 / 112320,
    laborDaily: 25000,
    fixed: [
      { item: "店舗家賃", category: "地代家賃", amount: 280000 },
      { item: "厨房機器リース", category: "リース料", amount: 38000 },
      { item: "店舗総合保険", category: "保険料", amount: 10000 },
      { item: "Airレジ・電話・ネット", category: "通信・サブスク", amount: 16000 },
    ],
    staff: [{ name: "店長", amount: 300000 }],
    vendors: ["コストコ", "業務スーパー", "ローソン", "日本リース", "マックスバリュー", "DUSKIN", "牛尾酒店", "西原商会"],
    foodVendors: ["西原商会", "業務スーパー", "マックスバリュー"],
    drinkVendors: ["牛尾酒店", "コストコ"],
    variableVendors: ["ローソン", "DUSKIN", "日本リース"],
  },
  {
    name: "たみじや",
    dailyTarget: 3000000 / 30,
    monthlyTarget: 3000000,
    foodRatio: 0.7,
    cashRatio: 0.35,
    foodCostRatio: 0.28,
    drinkCostRatio: 0.2,
    guestPerSales: 22 / 100000,
    groupPerSales: 9 / 100000,
    laborDaily: 20000,
    fixed: [
      { item: "店舗家賃", category: "地代家賃", amount: 260000 },
      { item: "厨房機器リース", category: "リース料", amount: 32000 },
      { item: "店舗総合保険", category: "保険料", amount: 9000 },
      { item: "Airレジ・電話・ネット", category: "通信・サブスク", amount: 15000 },
    ],
    staff: [{ name: "店長", amount: 280000 }],
    vendors: ["コストコ", "業務スーパー", "ローソン", "日本リース", "カクヤス", "西原商会"],
    foodVendors: ["西原商会", "業務スーパー"],
    drinkVendors: ["カクヤス", "コストコ"],
    variableVendors: ["ローソン", "日本リース"],
  },
];

const SALES_CATEGORIES = ["フード", "ドリンク"];
const VARIABLE_ITEMS = ["消耗品", "水道光熱費", "販促・広告", "衛生・清掃", "通信", "雑費"];

async function insertChunked(table, rows, chunkSize = 500) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await admin.from(table).insert(chunk);
    if (error) throw error;
  }
}

const { data: storeRows, error: storeErr } = await admin
  .from("stores")
  .select("id, name")
  .in("name", STORES.map((s) => s.name));
if (storeErr) throw storeErr;
const storeIdByName = Object.fromEntries(storeRows.map((s) => [s.name, s.id]));

for (const s of STORES) {
  const storeId = storeIdByName[s.name];
  if (!storeId) {
    console.error("店舗が見つかりません:", s.name);
    continue;
  }
  console.log("===", s.name, storeId);

  await admin.from("sales_categories").delete().eq("store_id", storeId);
  await admin.from("sales_categories").insert(
    SALES_CATEGORIES.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
  );

  await admin.from("vendors").delete().eq("store_id", storeId);
  await admin.from("vendors").insert(
    s.vendors.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
  );

  await admin.from("variable_cost_items").delete().eq("store_id", storeId);
  await admin.from("variable_cost_items").insert(
    VARIABLE_ITEMS.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
  );
  console.log("  カテゴリ/費目/取引先マスタ更新（取引先", s.vendors.length, "件）");

  // ---- 月初セットアップ + 月間目標: 2024-09 〜 2026-09(25ヶ月) ----
  for (const monthKey of END_MONTH_KEYS) {
    const yearMonth = `${monthKey}-01`;
    const g = growthFactor(monthKey);
    const { data: ms, error: msErr } = await admin
      .from("monthly_setups")
      .upsert({ store_id: storeId, year_month: yearMonth }, { onConflict: "store_id,year_month" })
      .select("id")
      .single();
    if (msErr) throw msErr;

    await admin.from("fixed_cost_lines").delete().eq("monthly_setup_id", ms.id);
    await admin.from("fixed_cost_lines").insert(
      s.fixed.map((f, i) => ({
        monthly_setup_id: ms.id,
        item: f.item,
        category: f.category,
        amount_monthly: Math.round(f.amount * (f.category === "借入返済" ? 1 : g)),
        sort_order: i,
      })),
    );

    await admin.from("monthly_staff").delete().eq("monthly_setup_id", ms.id);
    await admin.from("monthly_staff").insert(
      s.staff.map((st, i) => ({
        monthly_setup_id: ms.id,
        staff_name: st.name,
        amount_monthly: Math.round(st.amount * g),
        sort_order: i,
      })),
    );

    await admin.from("monthly_targets").upsert(
      { store_id: storeId, year_month: yearMonth, sales_target: Math.round(s.monthlyTarget * g) },
      { onConflict: "store_id,year_month" },
    );
  }
  console.log("  月初セットアップ投入:", END_MONTH_KEYS.length, "ヶ月分");

  // ---- 日次実績: 2024-09-01 〜 2026-09-13 ----
  const days = [];
  {
    let y = START.y, m = START.m;
    while (true) {
      const isLastMonth = y === 2026 && m === 9;
      const dim = isLastMonth ? 13 : daysInMonth(y, m);
      for (let d = 1; d <= dim; d++) days.push(isoDate(y, m, d));
      if (isLastMonth) break;
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }

  const recordRows = [];
  const catRows = [];
  const payRows = [];
  const costRows = [];

  for (let i = 0; i < days.length; i++) {
    const businessDate = days[i];
    const monthKey = businessDate.slice(0, 7);
    const g = growthFactor(monthKey);
    const dow = new Date(businessDate + "T00:00:00").getDay();
    const weekendBoost = dow === 0 || dow === 6 ? 1.18 : dow === 5 ? 1.1 : 1.0;
    const totalSales = Math.max(
      10000,
      Math.round(jitter(s.dailyTarget * g, 0.35) * weekendBoost),
    );

    const foodRatio = Math.min(0.92, Math.max(0.4, s.foodRatio * noise(0.08)));
    const foodSales = Math.round(totalSales * foodRatio);
    const drinkSales = totalSales - foodSales;

    const cashRatio = Math.min(0.85, Math.max(0.1, s.cashRatio * noise(0.15)));
    const cashAmt = Math.round(totalSales * cashRatio);
    const cardAmt = totalSales - cashAmt;

    const guestCount = Math.max(1, Math.round(totalSales * s.guestPerSales * noise(0.12)));
    const groupCount = Math.max(1, Math.round(totalSales * s.groupPerSales * noise(0.12)));

    const foodCogs = Math.round(foodSales * s.foodCostRatio * noise(0.2));
    const drinkCogs = Math.round(drinkSales * s.drinkCostRatio * noise(0.2));
    const laborAmt = Math.round(jitter(s.laborDaily * g, 0.25));

    const payType = () => (rand() < 0.22 ? "credit" : "cash");
    const foodVendor = i % 3 !== 2 ? s.foodVendors[i % s.foodVendors.length] : null;
    const drinkVendor = i % 4 !== 3 ? s.drinkVendors[i % s.drinkVendors.length] : null;

    const recordId = randomUUID();
    recordRows.push({
      id: recordId,
      store_id: storeId,
      business_date: businessDate,
      status: "confirmed",
      total_sales: totalSales,
      guest_count: guestCount,
      group_count: groupCount,
    });

    catRows.push(
      { daily_record_id: recordId, category: "フード", amount: foodSales, sort_order: 0 },
      { daily_record_id: recordId, category: "ドリンク", amount: drinkSales, sort_order: 1 },
    );

    payRows.push(
      { daily_record_id: recordId, method: "cash", amount: cashAmt },
      { daily_record_id: recordId, method: "card", amount: cardAmt },
      { daily_record_id: recordId, method: "emoney", amount: 0 },
      { daily_record_id: recordId, method: "receivable", amount: 0 },
    );

    costRows.push(
      {
        daily_record_id: recordId,
        cost_class: "cogs",
        item: "フード",
        amount: foodCogs,
        sort_order: 0,
        counterparty: foodVendor,
        payment_type: foodVendor ? payType() : "cash",
      },
      {
        daily_record_id: recordId,
        cost_class: "cogs",
        item: "ドリンク",
        amount: drinkCogs,
        sort_order: 1,
        counterparty: drinkVendor,
        payment_type: drinkVendor ? payType() : "cash",
      },
      {
        daily_record_id: recordId,
        cost_class: "labor",
        item: "日払い",
        amount: laborAmt,
        sort_order: 0,
        counterparty: null,
        payment_type: "cash",
      },
      {
        daily_record_id: recordId,
        cost_class: "variable",
        item: "消耗品",
        amount: Math.round(jitter(3500, 0.4)),
        sort_order: 0,
        counterparty: s.variableVendors[i % s.variableVendors.length],
        payment_type: payType(),
      },
    );
    if (i % 2 === 0) {
      const cyclerItem = VARIABLE_ITEMS[1 + (i % (VARIABLE_ITEMS.length - 1))];
      costRows.push({
        daily_record_id: recordId,
        cost_class: "variable",
        item: cyclerItem,
        amount: Math.round(jitter(2500, 0.5)),
        sort_order: 1,
        counterparty: s.variableVendors[(i + 1) % s.variableVendors.length],
        payment_type: payType(),
      });
    }
  }

  // 既存(以前投入した8-9月ぶん)を消してから作り直す
  await admin.from("daily_records").delete().eq("store_id", storeId);

  await insertChunked("daily_records", recordRows);
  await insertChunked("daily_sales_categories", catRows);
  await insertChunked("daily_payments", payRows);
  await insertChunked("daily_costs", costRows);

  console.log("  日次実績投入:", days.length, "日分(", days[0], "〜", days[days.length - 1], ")");
}

console.log("\ndone");

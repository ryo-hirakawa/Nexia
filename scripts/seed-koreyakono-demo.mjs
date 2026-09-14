/**
 * これやこの・なべやこの・たみじや のヒアリング用デモデータを投入する。
 *
 *   node --env-file=.env.local scripts/seed-koreyakono-demo.mjs
 *
 * これやこの・なべやこのは、実際にもらった日報Excel(2026-08-28 / 2026-08-26)から
 * 抽出した比率(カテゴリ配分・決済配分・原価率)と、Excel内の予算欄(月間目標)を
 * そのまま使い、8月・9月の日々の実績を作る(絶対額は目標を軸にした揺らぎ生成で、
 * 実データの「その日のコピー」ではない)。たみじやは参考データが無いため、
 * 姉妹2店の規模感に合わせた仮の数値(要ヒアリング差し替え)。
 * 経費まわりは「どこまで細かく設定できるか」を見せる目的で、固定費・流動費・
 * 月給スタッフ・日払いの全項目を使う。
 */
import { createClient } from "@supabase/supabase-js";

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

const STORES = [
  {
    name: "これやこの",
    dailyTarget: 4000000 / 30, // 月間目標を実日数で日割りした平均値を軸にする
    monthlyTarget: 4000000,
    foodRatio: 0.784, // 8/28実績: フード273,290 / 総売上348,690
    cashRatio: 0.408, // 8/28実績: 現金142,250 / 総売上348,690
    foodCostRatio: 0.291, // Excelの累計原価率(フード)
    drinkCostRatio: 0.187, // Excelの累計原価率(ドリンク)
    guestPerSales: 30 / 348690,
    groupPerSales: 13 / 348690,
    laborDaily: 24000, // 日払い中心(8/28実績4,500円は谷日。月平均目安として24,000円/日で生成)
    fixed: [
      { item: "店舗家賃", category: "地代家賃", amount: 300000 },
      { item: "厨房機器リース", category: "リース料", amount: 45000 },
      { item: "店舗総合保険", category: "保険料", amount: 12000 },
      { item: "Airレジ・電話・ネット", category: "通信・サブスク", amount: 18000 },
      { item: "開業時借入返済", category: "借入返済", amount: 60000 },
    ],
    staff: [{ name: "店長", amount: 320000 }],
  },
  {
    name: "なべやこの",
    dailyTarget: 3750000 / 30,
    monthlyTarget: 3750000,
    foodRatio: 0.674, // 8/26実績: フード75,680 / 総売上112,320
    cashRatio: 0.252, // 8/26実績: 現金28,290 / 総売上112,320
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
  },
  {
    name: "たみじや",
    // 参考Excel無し。姉妹2店の規模感に合わせた仮の数値(要ヒアリング差し替え)。
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
  },
];

const SALES_CATEGORIES = ["フード", "ドリンク"];
const VARIABLE_ITEMS = ["消耗品", "水道光熱費", "販促・広告", "衛生・清掃", "通信", "雑費"];

const { data: storeRows, error: storeErr } = await admin
  .from("stores")
  .select("id, name")
  .in(
    "name",
    STORES.map((s) => s.name),
  );
if (storeErr) throw storeErr;
const storeIdByName = Object.fromEntries(storeRows.map((s) => [s.name, s.id]));

for (const s of STORES) {
  const storeId = storeIdByName[s.name];
  if (!storeId) {
    console.error("店舗が見つかりません:", s.name);
    continue;
  }
  console.log("===", s.name, storeId);

  // ---- 売上カテゴリをフード/ドリンクに置き換え ----
  await admin.from("sales_categories").delete().eq("store_id", storeId);
  await admin.from("sales_categories").insert(
    SALES_CATEGORIES.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
  );

  // ---- 流動費費目を最新版に置き換え ----
  await admin.from("variable_cost_items").delete().eq("store_id", storeId);
  await admin.from("variable_cost_items").insert(
    VARIABLE_ITEMS.map((name, i) => ({ store_id: storeId, name, sort_order: i })),
  );
  console.log("  カテゴリ/費目マスタ更新");

  // ---- 8月・9月の月初セットアップ + 月間目標 ----
  for (const [year, month] of [
    [2026, 8],
    [2026, 9],
  ]) {
    const yearMonth = isoDate(year, month, 1);
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
        amount_monthly: f.amount,
        sort_order: i,
      })),
    );

    await admin.from("monthly_staff").delete().eq("monthly_setup_id", ms.id);
    await admin.from("monthly_staff").insert(
      s.staff.map((st, i) => ({
        monthly_setup_id: ms.id,
        staff_name: st.name,
        amount_monthly: st.amount,
        sort_order: i,
      })),
    );

    await admin
      .from("monthly_targets")
      .upsert(
        { store_id: storeId, year_month: yearMonth, sales_target: s.monthlyTarget },
        { onConflict: "store_id,year_month" },
      );
  }
  console.log("  月初セットアップ(8月・9月)投入: 固定費", s.fixed.length, "件 / 月給", s.staff.length, "件");

  // ---- 日次実績: 8/1-8/31, 9/1-9/13 ----
  const days = [];
  for (let d = 1; d <= daysInMonth(2026, 8); d++) days.push(isoDate(2026, 8, d));
  for (let d = 1; d <= 13; d++) days.push(isoDate(2026, 9, d));

  for (let i = 0; i < days.length; i++) {
    const businessDate = days[i];
    const dow = new Date(businessDate + "T00:00:00").getDay(); // 0=日
    const weekendBoost = dow === 0 || dow === 6 ? 1.18 : dow === 5 ? 1.1 : 1.0;
    const totalSales = Math.max(
      10000,
      Math.round(jitter(s.dailyTarget, 0.35) * weekendBoost),
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
    const laborAmt = Math.round(jitter(s.laborDaily, 0.25));

    // 流動費: 消耗品はほぼ毎日、他の費目は数日に1回のペース(経費の多様さを見せる)
    const variableCosts = [];
    variableCosts.push({
      cost_class: "variable",
      item: "消耗品",
      amount: Math.round(jitter(3500, 0.4)),
      sort_order: 0,
    });
    const cyclerItem = VARIABLE_ITEMS[1 + (i % (VARIABLE_ITEMS.length - 1))];
    if (i % 2 === 0) {
      variableCosts.push({
        cost_class: "variable",
        item: cyclerItem,
        amount: Math.round(jitter(2500, 0.5)),
        sort_order: 1,
      });
    }

    const { data: rec, error: recErr } = await admin
      .from("daily_records")
      .upsert(
        {
          store_id: storeId,
          business_date: businessDate,
          status: "confirmed",
          total_sales: totalSales,
          guest_count: guestCount,
          group_count: groupCount,
        },
        { onConflict: "store_id,business_date" },
      )
      .select("id")
      .single();
    if (recErr) throw recErr;
    const recordId = rec.id;

    await admin.from("daily_sales_categories").delete().eq("daily_record_id", recordId);
    await admin.from("daily_payments").delete().eq("daily_record_id", recordId);
    await admin.from("daily_costs").delete().eq("daily_record_id", recordId);

    await admin.from("daily_sales_categories").insert([
      { daily_record_id: recordId, category: "フード", amount: foodSales, sort_order: 0 },
      { daily_record_id: recordId, category: "ドリンク", amount: drinkSales, sort_order: 1 },
    ]);
    await admin.from("daily_payments").insert([
      { daily_record_id: recordId, method: "cash", amount: cashAmt },
      { daily_record_id: recordId, method: "card", amount: cardAmt },
      { daily_record_id: recordId, method: "emoney", amount: 0 },
      { daily_record_id: recordId, method: "receivable", amount: 0 },
    ]);
    await admin.from("daily_costs").insert([
      { daily_record_id: recordId, cost_class: "cogs", item: "フード", amount: foodCogs, sort_order: 0 },
      { daily_record_id: recordId, cost_class: "cogs", item: "ドリンク", amount: drinkCogs, sort_order: 1 },
      { daily_record_id: recordId, cost_class: "labor", item: "日払い", amount: laborAmt, sort_order: 0 },
      ...variableCosts,
    ]);
  }
  console.log("  日次実績投入:", days.length, "日分(8月・9月)");
}

console.log("\ndone");

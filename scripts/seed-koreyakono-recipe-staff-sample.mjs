// これやこの: レシピ原価(食材・メニュー)とアルバイト時給の直近2ヶ月分サンプルデータ投入。
// 既存のフード仕入・人件費(日払い)の合計金額は維持したまま、内訳(食材×数量／スタッフ×時間)に分解する。
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const STORE_ID = "80e2a431-4818-4540-82b0-a8c8d303999e"; // これやこの
const START = "2026-07-16";
const END = "2026-09-15";

function rand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

async function main() {
  // 1. 食材マスタを拡充
  const { data: existingIng } = await supabase.from("ingredients").select("id,name").eq("store_id", STORE_ID);
  const haveNames = new Set((existingIng ?? []).map((i) => i.name));
  const newIngredients = [
    { name: "牛肉", unit: "kg" },
    { name: "豚肉", unit: "kg" },
    { name: "もやし", unit: "kg" },
    { name: "玉ねぎ", unit: "kg" },
    { name: "米", unit: "kg" },
  ].filter((i) => !haveNames.has(i.name));
  if (newIngredients.length) {
    await supabase.from("ingredients").insert(
      newIngredients.map((i, idx) => ({
        store_id: STORE_ID,
        name: i.name,
        unit: i.unit,
        sort_order: (existingIng?.length ?? 0) + idx,
      })),
    );
  }
  const { data: ing } = await supabase.from("ingredients").select("id,name,unit").eq("store_id", STORE_ID);
  const ingByName = Object.fromEntries(ing.map((i) => [i.name, i]));

  // 単価の目安(円/kg) - COGS内訳の数量からその日の単価を逆算する時の中心値
  const UNIT_PRICE = { キャベツ: 150, 牛肉: 2600, 豚肉: 1200, もやし: 45, 玉ねぎ: 110, 米: 480 };

  // 2. メニューマスタを拡充(存在しなければ追加)
  const { data: existingMenu } = await supabase.from("menu_items").select("id,name").eq("store_id", STORE_ID);
  const haveMenu = new Set((existingMenu ?? []).map((m) => m.name));
  const menuPlan = [
    { name: "鉄板焼き定食", lines: [["キャベツ", 0.2], ["豚肉", 0.15], ["玉ねぎ", 0.05]] },
    { name: "牛カルビ鉄板", lines: [["牛肉", 0.18], ["キャベツ", 0.15], ["もやし", 0.1]] },
    { name: "豚ロース鉄板", lines: [["豚肉", 0.2], ["キャベツ", 0.15]] },
    { name: "お好み焼き", lines: [["キャベツ", 0.3], ["豚肉", 0.08]] },
    { name: "焼きそば", lines: [["もやし", 0.15], ["キャベツ", 0.1], ["豚肉", 0.05]] },
  ];
  for (let i = 0; i < menuPlan.length; i++) {
    const m = menuPlan[i];
    if (haveMenu.has(m.name)) continue;
    const { data: created } = await supabase
      .from("menu_items")
      .insert({ store_id: STORE_ID, name: m.name, sort_order: (existingMenu?.length ?? 0) + i })
      .select("id")
      .single();
    const lineRows = m.lines.map(([ingName, qty], j) => ({
      menu_item_id: created.id,
      ingredient_id: ingByName[ingName].id,
      quantity: qty,
      sort_order: j,
    }));
    await supabase.from("recipe_lines").insert(lineRows);
  }

  // 3. アルバイトマスタ(既存: 田中/山田/宮川)を取得
  const { data: staff } = await supabase.from("staff_members").select("id,name,hourly_wage").eq("store_id", STORE_ID);
  if (!staff?.length) throw new Error("staff_members が見つかりません");
  const weights = [0.4, 0.35, 0.25];

  // 4. 対象期間の日次レコードを取得
  const { data: records } = await supabase
    .from("daily_records")
    .select("id,business_date")
    .eq("store_id", STORE_ID)
    .gte("business_date", START)
    .lte("business_date", END)
    .order("business_date");

  const priceUpserts = [];
  let updated = 0;

  for (const rec of records) {
    const { data: costs } = await supabase
      .from("daily_costs")
      .select("id,cost_class,item,amount,counterparty,payment_type")
      .eq("daily_record_id", rec.id);

    const foodRows = (costs ?? []).filter((c) => c.cost_class === "cogs" && c.item === "フード");
    const laborRows = (costs ?? []).filter((c) => c.cost_class === "labor");
    if (!foodRows.length && !laborRows.length) continue;

    const rng = rand(Date.parse(rec.business_date));
    const toDelete = [...foodRows, ...laborRows].map((r) => r.id);
    if (toDelete.length) {
      await supabase.from("daily_costs").delete().in("id", toDelete);
    }

    const newRows = [];
    let sortOrder = 100;

    // --- フード仕入れを2食材に分解(合計は維持) ---
    if (foodRows.length) {
      const totalFood = foodRows.reduce((s, r) => s + Number(r.amount), 0);
      const cp = foodRows.find((r) => r.counterparty)?.counterparty ?? null;
      const payType = foodRows.find((r) => r.payment_type === "credit") ? "credit" : "cash";
      const pool = ["キャベツ", "牛肉", "豚肉", "もやし", "玉ねぎ"];
      const a = pool[Math.floor(rng() * pool.length)];
      let b = pool[Math.floor(rng() * pool.length)];
      if (b === a) b = pool[(pool.indexOf(a) + 1) % pool.length];
      const splitRatio = 0.5 + rng() * 0.2; // 50-70%を1品目に
      const amt1 = Math.round(totalFood * splitRatio);
      const amt2 = totalFood - amt1;
      for (const [name, amount] of [[a, amt1], [b, amt2]]) {
        if (amount <= 0) continue;
        const jitter = 0.9 + rng() * 0.2;
        const unitPrice = Math.round(UNIT_PRICE[name] * jitter);
        const quantity = Math.round((amount / unitPrice) * 100) / 100;
        if (quantity <= 0) continue;
        newRows.push({
          daily_record_id: rec.id,
          cost_class: "cogs",
          item: "フード",
          amount,
          note: null,
          counterparty: cp,
          payment_type: payType,
          ingredient_id: ingByName[name].id,
          quantity,
          sort_order: sortOrder++,
        });
        priceUpserts.push({
          ingredient_id: ingByName[name].id,
          business_date: rec.business_date,
          unit_price: Math.round((amount / quantity) * 100) / 100,
        });
      }
    }

    // --- 人件費を3名のスタッフ時給に分解(合計はおおむね維持) ---
    if (laborRows.length) {
      const totalLabor = laborRows.reduce((s, r) => s + Number(r.amount), 0);
      staff.forEach((s, idx) => {
        const share = totalLabor * weights[idx];
        let hours = Math.round((share / Number(s.hourly_wage)) * 2) / 2; // 0.5h単位
        if (hours <= 0) hours = 2;
        const amount = Math.round(Number(s.hourly_wage) * hours);
        newRows.push({
          daily_record_id: rec.id,
          cost_class: "labor",
          item: "スタッフ時給",
          amount,
          note: null,
          counterparty: null,
          payment_type: "cash",
          ingredient_id: null,
          quantity: hours,
          staff_id: s.id,
          sort_order: sortOrder++,
        });
      });
    }

    if (newRows.length) {
      const { error } = await supabase.from("daily_costs").insert(newRows);
      if (error) {
        console.error(rec.business_date, error.message);
        continue;
      }
      updated++;
    }
  }

  if (priceUpserts.length) {
    // 同一食材・同一日の重複は後勝ちにしてから一括upsert
    const dedup = new Map();
    for (const p of priceUpserts) dedup.set(`${p.ingredient_id}_${p.business_date}`, p);
    await supabase.from("ingredient_prices").upsert([...dedup.values()], { onConflict: "ingredient_id,business_date" });
  }

  console.log(`更新した日次レコード: ${updated}/${records.length}`);
  console.log(`食材単価レコード: ${priceUpserts.length}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * パイロット用のクライアント + バー店舗を1件だけ作る（無ければ）。
 *
 *   node --env-file=.env.local scripts/seed-pilot.mjs
 *
 * クライアント管理 UI ができるまでの暫定。service_role で実行。
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const CLIENT_NAME = "パイロット";
const STORE_NAME = "BAR（パイロット）";

let { data: client } = await admin
  .from("clients")
  .select("id, name")
  .eq("name", CLIENT_NAME)
  .maybeSingle();

if (!client) {
  const { data, error } = await admin
    .from("clients")
    .insert({ name: CLIENT_NAME })
    .select("id, name")
    .single();
  if (error) throw error;
  client = data;
  console.log("クライアント作成:", client.name, client.id);
} else {
  console.log("クライアント既存:", client.name, client.id);
}

let { data: store } = await admin
  .from("stores")
  .select("id, name")
  .eq("client_id", client.id)
  .eq("name", STORE_NAME)
  .maybeSingle();

if (!store) {
  const { data, error } = await admin
    .from("stores")
    .insert({
      client_id: client.id,
      name: STORE_NAME,
      industry: "bar",
      template: "bar_v1",
    })
    .select("id, name")
    .single();
  if (error) throw error;
  store = data;
  console.log("店舗作成:", data.name, data.id);
} else {
  console.log("店舗既存:", store.name, store.id);
}

// 流動費の費目マスタ（バー版プリセット）
const VITEMS = ["消耗品", "送り（タクシー）", "販促・広告", "衛生・清掃", "通信", "雑費"];
const { count } = await admin
  .from("variable_cost_items")
  .select("*", { count: "exact", head: true })
  .eq("store_id", store.id);
if (!count) {
  const { error } = await admin.from("variable_cost_items").insert(
    VITEMS.map((name, i) => ({ store_id: store.id, name, sort_order: i })),
  );
  if (error) throw error;
  console.log("流動費 費目マスタ作成:", VITEMS.length, "件");
} else {
  console.log("流動費 費目マスタ既存:", count, "件");
}

console.log("done");

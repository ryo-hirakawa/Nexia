/**
 * 飲食3店舗クライアント（これやこの/なべやこの/たみじや）を作る。
 *
 *   node --env-file=.env.local scripts/seed-koreyakono-group.mjs
 *
 * 前提: migration 0012（sales_categories テーブル）が反映済みであること。
 * クライアント管理 UI ができるまでの暫定。service_role で実行。
 *
 * 作成するもの:
 * - client「これやこの・なべやこの・たみじやグループ（仮）」（後で正式名称にリネーム可）
 * - store 3件（すべて industry=restaurant, template=restaurant_v1）
 *   各店に飲食版プリセットの 売上カテゴリ / 流動費費目 を投入
 * - ログイン: 社長（owner、3店舗とも自動で見える）+ 店長3名（manager、担当店のみ）
 *   すべて仮メールアドレス（Gmail の + エイリアス）・仮パスワード共通
 */
import { createClient } from "@supabase/supabase-js";

// src/lib/restaurant-preset.ts と同じ値（.mjs から直接 .ts は import できないため複製）
const SALES_CATEGORIES = ["料理", "ドリンク", "宴会コース", "その他"];
const VARIABLE_COST_ITEMS = ["消耗品", "販促・広告", "衛生・清掃", "通信", "雑費"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const CLIENT_NAME = "これやこの・なべやこの・たみじやグループ（仮）";
const TEMP_PASSWORD = "nexia-koreyakono-4127";

const STORES = [
  { name: "これやこの", note: "鉄板焼き" },
  { name: "なべやこの", note: "鍋料理・焼き鳥" },
  { name: "たみじや", note: "炉端焼き" },
];

// ---- client ----
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

// ---- stores ----
const storeRows = [];
for (const s of STORES) {
  let { data: store } = await admin
    .from("stores")
    .select("id, name")
    .eq("client_id", client.id)
    .eq("name", s.name)
    .maybeSingle();

  if (!store) {
    const { data, error } = await admin
      .from("stores")
      .insert({
        client_id: client.id,
        name: s.name,
        industry: "restaurant",
        template: "restaurant_v1",
      })
      .select("id, name")
      .single();
    if (error) throw error;
    store = data;
    console.log(`店舗作成: ${data.name}（${s.note}） ${data.id}`);
  } else {
    console.log(`店舗既存: ${store.name} ${store.id}`);
  }
  storeRows.push({ ...s, id: store.id });

  const { count: catCount } = await admin
    .from("sales_categories")
    .select("*", { count: "exact", head: true })
    .eq("store_id", store.id);
  if (!catCount) {
    const { error } = await admin.from("sales_categories").insert(
      SALES_CATEGORIES.map((name, i) => ({ store_id: store.id, name, sort_order: i })),
    );
    if (error) throw error;
    console.log(`  売上カテゴリ投入: ${SALES_CATEGORIES.length}件`);
  }

  const { count: viCount } = await admin
    .from("variable_cost_items")
    .select("*", { count: "exact", head: true })
    .eq("store_id", store.id);
  if (!viCount) {
    const { error } = await admin.from("variable_cost_items").insert(
      VARIABLE_COST_ITEMS.map((name, i) => ({ store_id: store.id, name, sort_order: i })),
    );
    if (error) throw error;
    console.log(`  流動費費目投入: ${VARIABLE_COST_ITEMS.length}件`);
  }
}

// ---- users / roles ----
async function findOrCreateUser(email, fullName) {
  let user = null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user || data.users.length < 200) break;
  }
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
    console.log("ユーザー作成:", email);
  } else {
    console.log("ユーザー既存:", email);
  }
  return user;
}

async function ensureClientRole(profileId, role) {
  const { data: existing } = await admin
    .from("client_members")
    .select("id, role")
    .eq("client_id", client.id)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing) {
    if (existing.role !== role) {
      await admin.from("client_members").update({ role }).eq("id", existing.id);
      console.log(`  role 更新 → ${role}`);
    }
    return;
  }
  const { error } = await admin
    .from("client_members")
    .insert({ client_id: client.id, profile_id: profileId, role });
  if (error) throw error;
  console.log(`  client_members 追加 (${role})`);
}

async function ensureStoreMember(storeId, profileId) {
  const { data: existing } = await admin
    .from("store_members")
    .select("id")
    .eq("store_id", storeId)
    .eq("profile_id", profileId)
    .maybeSingle();
  if (existing) return;
  const { error } = await admin
    .from("store_members")
    .insert({ store_id: storeId, profile_id: profileId });
  if (error) throw error;
  console.log("  store_members 追加");
}

const ownerEmail = "ryo.19880728+koreyakono-shacho@gmail.com";
const ownerUser = await findOrCreateUser(ownerEmail, "社長（これやこのグループ）");
await ensureClientRole(ownerUser.id, "owner");

const MANAGER_ALIASES = ["koreyakono-ten", "nabeyakono-ten", "tamijiya-ten"];
for (let i = 0; i < storeRows.length; i++) {
  const store = storeRows[i];
  const email = `ryo.19880728+${MANAGER_ALIASES[i]}@gmail.com`;
  const user = await findOrCreateUser(email, `${store.name} 店長`);
  await ensureClientRole(user.id, "manager");
  await ensureStoreMember(store.id, user.id);
}

console.log("\n=== ログイン情報（仮） ===");
console.log(`共通パスワード: ${TEMP_PASSWORD}`);
console.log(`社長（3店舗ロールアップ）: ${ownerEmail}`);
storeRows.forEach((s, i) => {
  console.log(`${s.name} 店長: ryo.19880728+${MANAGER_ALIASES[i]}@gmail.com`);
});
console.log("\ndone");

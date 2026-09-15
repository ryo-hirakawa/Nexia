/**
 * Cat's Group の1店舗目「Ibiza Beach Cafe」を作る。
 *
 *   node --env-file=.env.local scripts/seed-catsgroup-ibiza.mjs
 *
 * 前提: migration 0012（sales_categories テーブル）が反映済みであること。
 * クライアント管理 UI ができるまでの暫定。service_role で実行。
 *
 * 作成するもの:
 * - client「Cat's Group」（実クライアント。今後7店舗を順次追加予定）
 * - store「Ibiza Beach Cafe」（industry=restaurant, template=restaurant_v1）
 *   モーニング/ランチセット(パンビュッフェ付き)/ランチアラカルト/ディナーコース/ディナーアラカルト/ドリンク
 *   のオリジナル売上カテゴリ + 飲食版標準の流動費費目
 * - ログイン: オーナーは既存の統括アカウント(ryo.19880728@gmail.com)をそのまま owner として追加
 *            店長は仮メールアドレス・仮パスワード（決まり次第 create-admin.mjs 等で差し替え）
 */
import { createClient } from "@supabase/supabase-js";

const SALES_CATEGORIES = [
  "モーニング",
  "ランチセット（パンビュッフェ付き）",
  "ランチアラカルト",
  "ディナーコース",
  "ディナーアラカルト",
  "ドリンク",
];
// src/lib/restaurant-preset.ts の標準流動費費目
const VARIABLE_COST_ITEMS = ["消耗品", "水道光熱費", "販促・広告", "衛生・清掃", "通信", "雑費"];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const CLIENT_NAME = "Cat's Group";
const STORE_NAME = "Ibiza Beach Cafe";
const OWNER_EMAIL = "ryo.19880728@gmail.com";
const MANAGER_EMAIL = "ibizabeachcafe-ten@example.com";
const MANAGER_TEMP_PASSWORD = "nexia-catsgroup-3061";

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

// ---- store ----
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
      industry: "restaurant",
      template: "restaurant_v1",
    })
    .select("id, name")
    .single();
  if (error) throw error;
  store = data;
  console.log("店舗作成:", store.name, store.id);
} else {
  console.log("店舗既存:", store.name, store.id);
}

const { count: catCount } = await admin
  .from("sales_categories")
  .select("*", { count: "exact", head: true })
  .eq("store_id", store.id);
if (!catCount) {
  const { error } = await admin.from("sales_categories").insert(
    SALES_CATEGORIES.map((name, i) => ({ store_id: store.id, name, sort_order: i })),
  );
  if (error) throw error;
  console.log(`売上カテゴリ投入: ${SALES_CATEGORIES.length}件`);
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
  console.log(`流動費費目投入: ${VARIABLE_COST_ITEMS.length}件`);
}

// ---- users / roles ----
async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 200) break;
  }
  return null;
}

async function findOrCreateUser(email, fullName, password) {
  let user = await findUserByEmail(email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
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

const ownerUser = await findUserByEmail(OWNER_EMAIL);
if (!ownerUser) {
  throw new Error(`オーナーの既存ユーザーが見つかりません: ${OWNER_EMAIL}`);
}
await ensureClientRole(ownerUser.id, "owner");

const managerUser = await findOrCreateUser(
  MANAGER_EMAIL,
  `${STORE_NAME} 店長`,
  MANAGER_TEMP_PASSWORD,
);
await ensureClientRole(managerUser.id, "manager");
await ensureStoreMember(store.id, managerUser.id);

console.log("\n=== ログイン情報 ===");
console.log(`オーナー: ${OWNER_EMAIL}（既存パスワードのまま）`);
console.log(`${STORE_NAME} 店長（仮）: ${MANAGER_EMAIL} / ${MANAGER_TEMP_PASSWORD}`);
console.log("\ndone");

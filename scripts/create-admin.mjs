/**
 * コンサル管理者ユーザーを作る / 昇格させる。
 *
 *   node --env-file=.env.local scripts/create-admin.mjs <email> [password]
 *
 * - 既にそのメールのユーザーがいれば、管理者フラグを立てるだけ。
 * - いなければ作成（メール確認済み）してから管理者にする。
 * - password 省略時はランダム生成して表示する。
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
let password = process.argv[3];

if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!email) {
  console.error("使い方: node --env-file=.env.local scripts/create-admin.mjs <email> [password]");
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// 既存ユーザーを探す
let user = null;
for (let page = 1; page <= 20; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (user || data.users.length < 200) break;
}

let created = false;
if (!user) {
  if (!password) password = "Nx-" + randomBytes(12).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  user = data.user;
  created = true;
}

const { error: upErr } = await admin
  .from("profiles")
  .update({ is_platform_admin: true })
  .eq("id", user.id);
if (upErr) throw upErr;

console.log(created ? "作成しました" : "既存ユーザーを昇格しました");
console.log("  email:", email);
if (created) console.log("  password:", password, "（初回ログイン後に変更してください）");
console.log("  is_platform_admin: true");

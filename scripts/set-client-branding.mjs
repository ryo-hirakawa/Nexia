/**
 * クライアントのブランディングを設定する。
 *
 *   node --env-file=.env.local scripts/set-client-branding.mjs [logo画像パス]
 *
 * - client "パイロット" を "Bar Miami" にリネーム、ブランドカラーを設定
 * - 店舗名を "Bar Miami 大名" に
 * - 引数でロゴ画像を渡すと branding バケットにアップロードして logo_url を設定
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { extname, basename } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("env が足りません");
  process.exit(1);
}
const a = createClient(url, key, { auth: { persistSession: false } });

const CLIENT_MATCH = "パイロット";
const NEW_CLIENT_NAME = "Bar Miami";
const NEW_STORE_NAME = "Bar Miami 大名";
const BRAND_PRIMARY = "#14161a"; // 近黒
const BRAND_ACCENT = "#17a79a"; // ロゴのティール（UI 用に少し深め）

const logoPath = process.argv[2];

const { data: client } = await a
  .from("clients")
  .select("id, name")
  .or(`name.eq.${CLIENT_MATCH},name.eq.${NEW_CLIENT_NAME}`)
  .limit(1)
  .maybeSingle();

if (!client) {
  console.error("対象クライアントが見つかりません");
  process.exit(1);
}

let logo_url = null;
if (logoPath) {
  const buf = readFileSync(logoPath);
  const ext = extname(logoPath).toLowerCase() || ".png";
  const contentType =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : "image/png";
  const objectPath = `bar-miami/logo${ext}`;
  const up = await a.storage
    .from("branding")
    .upload(objectPath, buf, { contentType, upsert: true });
  if (up.error) throw up.error;
  logo_url = a.storage.from("branding").getPublicUrl(objectPath).data.publicUrl;
  console.log("ロゴをアップロード:", basename(logoPath), "→", logo_url);
}

const upd = {
  name: NEW_CLIENT_NAME,
  display_name: NEW_CLIENT_NAME,
  brand_primary: BRAND_PRIMARY,
  brand_accent: BRAND_ACCENT,
  ...(logo_url ? { logo_url } : {}),
};
const { error: cErr } = await a.from("clients").update(upd).eq("id", client.id);
if (cErr) throw cErr;

const { error: sErr } = await a
  .from("stores")
  .update({ name: NEW_STORE_NAME })
  .eq("client_id", client.id);
if (sErr) throw sErr;

console.log("設定完了:");
console.log("  client:", NEW_CLIENT_NAME, "/ primary", BRAND_PRIMARY, "/ accent", BRAND_ACCENT);
console.log("  store :", NEW_STORE_NAME);
console.log("  logo  :", logo_url ?? "(未設定 — 画像パスを引数で渡すと設定されます)");

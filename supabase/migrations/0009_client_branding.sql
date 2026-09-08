-- 0009_client_branding.sql
-- クライアント別ブランディング（店名表示・ブランドカラー・ロゴ）。
-- 適用はアプリの (app) レイアウトで、ログイン中ユーザーの所属クライアントを見て行う。
-- コンサル（platform admin）は中立の "Storeboard by Nexia" のまま。

alter table public.clients
  add column if not exists display_name  text,
  add column if not exists brand_primary text,   -- ヘッダー等の主色（HEX）
  add column if not exists brand_accent  text,   -- アクセント色（HEX）
  add column if not exists logo_url      text;

-- ロゴ用の公開バケット（読み取りは誰でも、書き込みは service_role のみ）
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "branding public read" on storage.objects;
create policy "branding public read" on storage.objects
  for select using (bucket_id = 'branding');

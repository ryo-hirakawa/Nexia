-- 0003_grants.sql
-- 「新しいテーブルを自動的に公開する」を OFF にしているため、
-- API ロールへの権限を明示的に付与する（付けないと service_role でも 403 になる）。

-- service_role（管理者キー。RLS を無視。サーバー / テスト用）: フルアクセス
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- authenticated（ログイン済みユーザー。RLS で行が絞られる）
grant select, insert, update, delete on
  public.clients, public.stores, public.profiles,
  public.client_members, public.store_members
  to authenticated;

-- anon（未ログイン）にはテーブル権限を与えない（RLS 以前にブロックされる）

-- 今後 public に作るテーブルにも自動で同じ権限が付くようにする
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- PostgREST にスキーマ再読み込みを通知
notify pgrst, 'reload schema';

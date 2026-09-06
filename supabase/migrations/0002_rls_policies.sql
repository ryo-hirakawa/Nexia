-- 0002_rls_policies.sql
-- RLS（行レベルセキュリティ）: 他社のデータは見えない・触れない。
-- 判定関数は security definer にして RLS を無視して素早く引く（無限ループ防止）。

-- ---- 判定用ヘルパー関数 ----

-- ログイン中ユーザーがコンサル管理者か
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- 所属する会社の id 一覧
create or replace function public.my_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.client_id from public.client_members cm
  where cm.profile_id = auth.uid();
$$;

-- 「経営者」として所属する会社の id 一覧
create or replace function public.my_owner_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cm.client_id from public.client_members cm
  where cm.profile_id = auth.uid() and cm.role = 'owner';
$$;

-- 見られる店舗の id 一覧（経営者=自社の全店 / 店舗責任者=割り当て店）
create or replace function public.my_store_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.stores s
    where s.client_id in (select public.my_owner_client_ids())
  union
  select sm.store_id from public.store_members sm
    where sm.profile_id = auth.uid();
$$;

-- ---- RLS 有効化 ----
alter table public.clients        enable row level security;
alter table public.stores         enable row level security;
alter table public.profiles       enable row level security;
alter table public.client_members enable row level security;
alter table public.store_members  enable row level security;

-- clients
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select using (
    public.is_platform_admin() or id in (select public.my_client_ids())
  );
drop policy if exists clients_admin_write on public.clients;
create policy clients_admin_write on public.clients
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- stores
drop policy if exists stores_select on public.stores;
create policy stores_select on public.stores
  for select using (
    public.is_platform_admin() or id in (select public.my_store_ids())
  );
drop policy if exists stores_admin_write on public.stores;
create policy stores_admin_write on public.stores
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.is_platform_admin());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- client_members
drop policy if exists client_members_select on public.client_members;
create policy client_members_select on public.client_members
  for select using (
    public.is_platform_admin()
    or profile_id = auth.uid()
    or client_id in (select public.my_owner_client_ids())
  );
drop policy if exists client_members_admin_write on public.client_members;
create policy client_members_admin_write on public.client_members
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- store_members
drop policy if exists store_members_select on public.store_members;
create policy store_members_select on public.store_members
  for select using (
    public.is_platform_admin()
    or profile_id = auth.uid()
    or store_id in (
      select s.id from public.stores s
      where s.client_id in (select public.my_owner_client_ids())
    )
  );
drop policy if exists store_members_admin_write on public.store_members;
create policy store_members_admin_write on public.store_members
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ---- 権限グラント ----
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on
  public.clients, public.stores, public.profiles,
  public.client_members, public.store_members
  to authenticated;
grant execute on function
  public.is_platform_admin(), public.my_client_ids(),
  public.my_owner_client_ids(), public.my_store_ids()
  to authenticated, anon;

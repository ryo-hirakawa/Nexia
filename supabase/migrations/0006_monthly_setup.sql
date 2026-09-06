-- 0006_monthly_setup.sql
-- M2′: 月初セットアップ（固定費・月給スタッフ・流動費の費目マスタ）。
-- 日割り = 月額 ÷ その月の実日数（計算はアプリ側）。

-- 店舗 × 対象月 のコンテナ
create table if not exists public.monthly_setups (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  year_month date not null,               -- 対象月の1日（例 2026-09-01）
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, year_month)
);
create index if not exists monthly_setups_store_idx
  on public.monthly_setups(store_id, year_month desc);

-- 固定費（ダッシュボード区分は常に「固定費」）
create table if not exists public.fixed_cost_lines (
  id uuid primary key default gen_random_uuid(),
  monthly_setup_id uuid not null references public.monthly_setups(id) on delete cascade,
  item text not null,
  category text not null default 'その他',
  amount_monthly bigint not null default 0,
  sort_order integer not null default 0
);
create index if not exists fcl_setup_idx on public.fixed_cost_lines(monthly_setup_id);

-- 月給スタッフ（ダッシュボード区分は「人件費」）
create table if not exists public.monthly_staff (
  id uuid primary key default gen_random_uuid(),
  monthly_setup_id uuid not null references public.monthly_setups(id) on delete cascade,
  staff_name text not null,
  amount_monthly bigint not null default 0,   -- 会社負担総額（社保・交通費込み）
  sort_order integer not null default 0
);
create index if not exists mstaff_setup_idx on public.monthly_staff(monthly_setup_id);

-- 流動費の費目マスタ（店舗レベル。日次フォームの選択肢になる）
create table if not exists public.variable_cost_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (store_id, name)
);
create index if not exists vci_store_idx on public.variable_cost_items(store_id, sort_order);

drop trigger if exists monthly_setups_touch on public.monthly_setups;
create trigger monthly_setups_touch before update on public.monthly_setups
  for each row execute function public.touch_updated_at();

-- ---- RLS ----
alter table public.monthly_setups      enable row level security;
alter table public.fixed_cost_lines    enable row level security;
alter table public.monthly_staff       enable row level security;
alter table public.variable_cost_items enable row level security;

drop policy if exists ms_select on public.monthly_setups;
create policy ms_select on public.monthly_setups for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists ms_write on public.monthly_setups;
create policy ms_write on public.monthly_setups for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

drop policy if exists fcl_all on public.fixed_cost_lines;
create policy fcl_all on public.fixed_cost_lines for all
  using (exists (select 1 from public.monthly_setups m
                 where m.id = monthly_setup_id
                   and (public.is_platform_admin() or m.store_id in (select public.my_store_ids()))))
  with check (exists (select 1 from public.monthly_setups m
                      where m.id = monthly_setup_id and public.can_write_store(m.store_id)));

drop policy if exists mstaff_all on public.monthly_staff;
create policy mstaff_all on public.monthly_staff for all
  using (exists (select 1 from public.monthly_setups m
                 where m.id = monthly_setup_id
                   and (public.is_platform_admin() or m.store_id in (select public.my_store_ids()))))
  with check (exists (select 1 from public.monthly_setups m
                      where m.id = monthly_setup_id and public.can_write_store(m.store_id)));

drop policy if exists vci_select on public.variable_cost_items;
create policy vci_select on public.variable_cost_items for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists vci_write on public.variable_cost_items;
create policy vci_write on public.variable_cost_items for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

-- ---- grants ----
grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on
  public.monthly_setups, public.fixed_cost_lines,
  public.monthly_staff, public.variable_cost_items
  to authenticated;

notify pgrst, 'reload schema';

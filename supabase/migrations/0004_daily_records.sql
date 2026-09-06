-- 0004_daily_records.sql
-- 日次入力（M1′）: 1店舗×1営業日の売上・決済・コスト明細。

-- 経費の大分類: cogs=仕入(原価) / labor=人件費 / fixed=固定費 / variable=流動費
do $$ begin
  create type public.cost_class as enum ('cogs', 'labor', 'fixed', 'variable');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_method as enum ('cash', 'card', 'emoney', 'receivable');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.record_status as enum ('draft', 'confirmed');
exception when duplicate_object then null;
end $$;

-- 1店舗 × 1営業日（営業日は開店日ベース）
create table if not exists public.daily_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  business_date date not null,
  status public.record_status not null default 'draft',
  weather text,
  note text,
  total_sales bigint not null default 0,
  guest_count integer not null default 0,
  group_count integer not null default 0,
  created_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, business_date)
);
create index if not exists daily_records_store_date_idx
  on public.daily_records(store_id, business_date desc);

-- 売上内訳（カテゴリ別）
create table if not exists public.daily_sales_categories (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  category text not null,
  amount bigint not null default 0,
  sort_order integer not null default 0
);
create index if not exists dsc_record_idx on public.daily_sales_categories(daily_record_id);

-- 決済手段別
create table if not exists public.daily_payments (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  method public.payment_method not null,
  amount bigint not null default 0,
  unique (daily_record_id, method)
);
create index if not exists dp_record_idx on public.daily_payments(daily_record_id);

-- コスト明細（日次入力ぶん: 仕入・人件費(時給/日払い)・流動費）
-- 固定費・月給スタッフは月初セットアップ由来なのでここには入らない（M2′）。
create table if not exists public.daily_costs (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  cost_class public.cost_class not null,
  item text not null,
  amount bigint not null default 0,
  note text,
  sort_order integer not null default 0
);
create index if not exists dc_record_idx on public.daily_costs(daily_record_id);

-- updated_at 自動更新
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists daily_records_touch on public.daily_records;
create trigger daily_records_touch before update on public.daily_records
  for each row execute function public.touch_updated_at();

-- 書き込み可能な店舗か（担当店 or 自社の経営者 or 管理者）
create or replace function public.can_write_store(p_store_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_platform_admin()
      or p_store_id in (select public.my_store_ids());
$$;

-- ---- RLS ----
alter table public.daily_records          enable row level security;
alter table public.daily_sales_categories enable row level security;
alter table public.daily_payments         enable row level security;
alter table public.daily_costs            enable row level security;

drop policy if exists dr_select on public.daily_records;
create policy dr_select on public.daily_records for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists dr_write on public.daily_records;
create policy dr_write on public.daily_records for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

drop policy if exists dsc_all on public.daily_sales_categories;
create policy dsc_all on public.daily_sales_categories for all
  using (exists (select 1 from public.daily_records r
                 where r.id = daily_record_id
                   and (public.is_platform_admin() or r.store_id in (select public.my_store_ids()))))
  with check (exists (select 1 from public.daily_records r
                      where r.id = daily_record_id and public.can_write_store(r.store_id)));

drop policy if exists dp_all on public.daily_payments;
create policy dp_all on public.daily_payments for all
  using (exists (select 1 from public.daily_records r
                 where r.id = daily_record_id
                   and (public.is_platform_admin() or r.store_id in (select public.my_store_ids()))))
  with check (exists (select 1 from public.daily_records r
                      where r.id = daily_record_id and public.can_write_store(r.store_id)));

drop policy if exists dc_all on public.daily_costs;
create policy dc_all on public.daily_costs for all
  using (exists (select 1 from public.daily_records r
                 where r.id = daily_record_id
                   and (public.is_platform_admin() or r.store_id in (select public.my_store_ids()))))
  with check (exists (select 1 from public.daily_records r
                      where r.id = daily_record_id and public.can_write_store(r.store_id)));

-- ---- grants（「新規テーブル自動公開」OFF のため明示）----
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant select, insert, update, delete on
  public.daily_records, public.daily_sales_categories,
  public.daily_payments, public.daily_costs
  to authenticated;
grant execute on function public.can_write_store(uuid) to authenticated, anon;

notify pgrst, 'reload schema';

-- 0005_receivables_casts.sql
-- M1′ 追加: 売掛（ツケ）の発生・回収明細 と キャスト別売上。

-- 売掛の方向: incurred=発生 / collected=回収
do $$ begin
  create type public.receivable_direction as enum ('incurred', 'collected');
exception when duplicate_object then null;
end $$;

-- 売掛明細（当日ぶん）
create table if not exists public.daily_receivable_entries (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  direction public.receivable_direction not null,
  counterparty text,
  amount bigint not null default 0,
  note text,
  sort_order integer not null default 0
);
create index if not exists dre_record_idx on public.daily_receivable_entries(daily_record_id);

-- キャスト別売上（本指名 / 場内 / 同伴 と バック）
create table if not exists public.daily_cast_sales (
  id uuid primary key default gen_random_uuid(),
  daily_record_id uuid not null references public.daily_records(id) on delete cascade,
  cast_name text not null,
  nominate_amount bigint not null default 0,  -- 本指名
  table_amount bigint not null default 0,     -- 場内
  companion_amount bigint not null default 0, -- 同伴
  back_amount bigint not null default 0,      -- バック（当面は手入力・調整可）
  sort_order integer not null default 0
);
create index if not exists dcs_record_idx on public.daily_cast_sales(daily_record_id);

-- ---- RLS（親 daily_record 経由で判定。0004 と同じ形）----
alter table public.daily_receivable_entries enable row level security;
alter table public.daily_cast_sales         enable row level security;

drop policy if exists dre_all on public.daily_receivable_entries;
create policy dre_all on public.daily_receivable_entries for all
  using (exists (select 1 from public.daily_records r
                 where r.id = daily_record_id
                   and (public.is_platform_admin() or r.store_id in (select public.my_store_ids()))))
  with check (exists (select 1 from public.daily_records r
                      where r.id = daily_record_id and public.can_write_store(r.store_id)));

drop policy if exists dcs_all on public.daily_cast_sales;
create policy dcs_all on public.daily_cast_sales for all
  using (exists (select 1 from public.daily_records r
                 where r.id = daily_record_id
                   and (public.is_platform_admin() or r.store_id in (select public.my_store_ids()))))
  with check (exists (select 1 from public.daily_records r
                      where r.id = daily_record_id and public.can_write_store(r.store_id)));

-- ---- grants ----
grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on
  public.daily_receivable_entries, public.daily_cast_sales
  to authenticated;

notify pgrst, 'reload schema';

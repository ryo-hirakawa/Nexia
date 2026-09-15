-- 0015_staff_hourly.sql
-- アルバイト(時給)スタッフの人件費を、人ごとの時給×時間で記録できるようにする。
-- 給与計算(月間の支給額一覧・明細)は保留。まずは日次の人件費内訳の精度を上げる。

create table if not exists public.staff_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  hourly_wage numeric not null default 0,
  sort_order integer not null default 0,
  unique (store_id, name)
);
create index if not exists staff_members_store_idx on public.staff_members(store_id, sort_order);

-- 仕入れの ingredient_id/quantity と同じ考え方で、人件費明細に
-- 「誰が」「何時間」を残せるようにする(quantity列を時間としても流用)。
alter table public.daily_costs
  add column if not exists staff_id uuid references public.staff_members(id) on delete set null;

alter table public.staff_members enable row level security;

drop policy if exists staff_members_select on public.staff_members;
create policy staff_members_select on public.staff_members for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists staff_members_write on public.staff_members;
create policy staff_members_write on public.staff_members for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on public.staff_members to authenticated;

notify pgrst, 'reload schema';

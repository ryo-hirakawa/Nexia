-- 0007_monthly_targets.sql
-- M3′: 月間の売上目標（達成率・着地予測に使う）。

create table if not exists public.monthly_targets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  year_month date not null,           -- 対象月の1日
  sales_target bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (store_id, year_month)
);
create index if not exists monthly_targets_store_idx
  on public.monthly_targets(store_id, year_month desc);

drop trigger if exists monthly_targets_touch on public.monthly_targets;
create trigger monthly_targets_touch before update on public.monthly_targets
  for each row execute function public.touch_updated_at();

alter table public.monthly_targets enable row level security;

drop policy if exists mt_select on public.monthly_targets;
create policy mt_select on public.monthly_targets for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists mt_write on public.monthly_targets;
create policy mt_write on public.monthly_targets for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on public.monthly_targets to authenticated;

notify pgrst, 'reload schema';

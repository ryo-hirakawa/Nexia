-- 0013_cost_counterparty.sql
-- 仕入れ・流動費の明細に「取引先」「現金／掛」を持たせる。
-- 飲食店の実運用（日報Excel）で、仕入れ・経費を取引先ごと・現金/掛（買掛）で
-- 記録していたのに合わせる。既存行は現金扱い（デフォルト）のまま。

do $$ begin
  create type public.cost_payment_type as enum ('cash', 'credit');
exception when duplicate_object then null;
end $$;

alter table public.daily_costs
  add column if not exists counterparty text,
  add column if not exists payment_type public.cost_payment_type not null default 'cash';

-- 取引先マスタ（店舗レベル。日次入力の取引先選択肢になる。流動費費目・売上
-- カテゴリと同じパターン）。都度手入力だと現場の負担・表記ゆれが増えるため、
-- 選ぶだけにする。
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (store_id, name)
);
create index if not exists vendors_store_idx on public.vendors(store_id, sort_order);

alter table public.vendors enable row level security;

drop policy if exists vendors_select on public.vendors;
create policy vendors_select on public.vendors for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists vendors_write on public.vendors;
create policy vendors_write on public.vendors for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on public.vendors to authenticated;

notify pgrst, 'reload schema';

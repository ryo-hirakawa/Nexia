-- 0012_sales_categories.sql
-- 売上カテゴリ（売上内訳の項目）を、流動費費目と同じく店舗ごとに設定可能にする。
-- これまでは全店舗共通の固定値（bar-preset.ts の SALES_CATEGORIES）だった。
-- 飲食テンプレ（鉄板焼き/鍋・焼き鳥/炉端焼きなど業態が違う複数店舗）を
-- 迎えるにあたり、店舗ごとに違うカテゴリ構成を持てるようにする。

create table if not exists public.sales_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (store_id, name)
);
create index if not exists sc_store_idx on public.sales_categories(store_id, sort_order);

alter table public.sales_categories enable row level security;

drop policy if exists sc_select on public.sales_categories;
create policy sc_select on public.sales_categories for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists sc_write on public.sales_categories;
create policy sc_write on public.sales_categories for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on public.sales_categories to authenticated;

-- 既存店舗（Bar Miami 大名）は今までの固定値をそのまま初期値として投入し、
-- 挙動を変えない（DailyForm 側はフォールバック付きなので必須ではないが、
-- 月初セットアップ画面で最初から編集できるようにするため明示的に投入する）。
insert into public.sales_categories (store_id, name, sort_order)
select s.id, v.name, v.sort_order
from public.stores s
cross join (values
  ('セット・チャージ', 0),
  ('ボトル・キープ', 1),
  ('ドリンク', 2),
  ('フード', 3),
  ('その他', 4)
) as v(name, sort_order)
where s.template = 'bar_v1'
on conflict (store_id, name) do nothing;

notify pgrst, 'reload schema';

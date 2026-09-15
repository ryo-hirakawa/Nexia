-- 0014_recipe_cost.sql
-- レシピ原価管理の土台: 食材マスタ・単価履歴・メニュー・レシピ(BOM)。
-- 出数(日々の販売数)はAirレジ連携待ちのため、ここでは「今のレシピ原価が
-- いくらか」を見える状態までを作る。日々の理論原価の自動集計は連携後。

-- 食材マスタ（店舗レベル。名称＋単位）
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  unit text not null default 'g', -- g / kg / ml / l / 個 など自由入力
  sort_order integer not null default 0,
  unique (store_id, name)
);
create index if not exists ingredients_store_idx on public.ingredients(store_id, sort_order);

-- 食材の単価履歴（「その日時点でいくらだったか」を積み重ねる。
-- 理論原価計算では、対象日以前で一番新しい行を「有効単価」として使う）
create table if not exists public.ingredient_prices (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  business_date date not null,
  unit_price numeric not null default 0, -- 1単位(unit)あたりの金額
  unique (ingredient_id, business_date)
);
create index if not exists ingredient_prices_lookup_idx
  on public.ingredient_prices(ingredient_id, business_date desc);

-- メニュー（売上を計上する商品。将来的にAirレジの商品名と対応付ける想定）
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (store_id, name)
);
create index if not exists menu_items_store_idx on public.menu_items(store_id, sort_order);

-- レシピ明細（メニュー1品 × 食材 × 分量）。分量は基本固定だが編集可能。
create table if not exists public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity numeric not null default 0, -- 食材の unit 単位での使用量(1食あたり)
  sort_order integer not null default 0,
  unique (menu_item_id, ingredient_id)
);
create index if not exists recipe_lines_menu_idx on public.recipe_lines(menu_item_id, sort_order);

-- 仕入れ明細(daily_costs)に「どの食材を」「どれだけ」買ったかを任意で残せるようにする。
-- 数量が分かるときだけ入れてもらい、金額÷数量でその日の単価を自動記録する
-- (ingredient_prices への反映はアプリ側の保存処理で行う)。
alter table public.daily_costs
  add column if not exists ingredient_id uuid references public.ingredients(id),
  add column if not exists quantity numeric;

-- ---- RLS ----
alter table public.ingredients enable row level security;
alter table public.ingredient_prices enable row level security;
alter table public.menu_items enable row level security;
alter table public.recipe_lines enable row level security;

drop policy if exists ingredients_select on public.ingredients;
create policy ingredients_select on public.ingredients for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists ingredients_write on public.ingredients;
create policy ingredients_write on public.ingredients for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

drop policy if exists ingredient_prices_select on public.ingredient_prices;
create policy ingredient_prices_select on public.ingredient_prices for select
  using (exists (
    select 1 from public.ingredients i
    where i.id = ingredient_id
      and (public.is_platform_admin() or i.store_id in (select public.my_store_ids()))
  ));
drop policy if exists ingredient_prices_write on public.ingredient_prices;
create policy ingredient_prices_write on public.ingredient_prices for all
  using (exists (
    select 1 from public.ingredients i
    where i.id = ingredient_id and public.can_write_store(i.store_id)
  ))
  with check (exists (
    select 1 from public.ingredients i
    where i.id = ingredient_id and public.can_write_store(i.store_id)
  ));

drop policy if exists menu_items_select on public.menu_items;
create policy menu_items_select on public.menu_items for select
  using (public.is_platform_admin() or store_id in (select public.my_store_ids()));
drop policy if exists menu_items_write on public.menu_items;
create policy menu_items_write on public.menu_items for all
  using (public.can_write_store(store_id))
  with check (public.can_write_store(store_id));

drop policy if exists recipe_lines_select on public.recipe_lines;
create policy recipe_lines_select on public.recipe_lines for select
  using (exists (
    select 1 from public.menu_items m
    where m.id = menu_item_id
      and (public.is_platform_admin() or m.store_id in (select public.my_store_ids()))
  ));
drop policy if exists recipe_lines_write on public.recipe_lines;
create policy recipe_lines_write on public.recipe_lines for all
  using (exists (
    select 1 from public.menu_items m
    where m.id = menu_item_id and public.can_write_store(m.store_id)
  ))
  with check (exists (
    select 1 from public.menu_items m
    where m.id = menu_item_id and public.can_write_store(m.store_id)
  ));

grant all privileges on all tables in schema public to service_role;
grant select, insert, update, delete on
  public.ingredients, public.ingredient_prices, public.menu_items, public.recipe_lines
  to authenticated;

notify pgrst, 'reload schema';

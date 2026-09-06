-- 0001_init_tenancy.sql
-- テナント（会社ごとにデータを完全に分ける）構造の土台。

create extension if not exists "pgcrypto";

-- 会社内の役割: owner=経営者 / manager=店舗責任者
do $$ begin
  create type public.client_role as enum ('owner', 'manager');
exception when duplicate_object then null;
end $$;

-- コンサルの顧客企業（テナント）
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 店舗
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  industry text not null default 'bar',
  template text not null default 'bar_v1',
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now()
);
create index if not exists stores_client_id_idx on public.stores(client_id);

-- 利用者（Supabase の auth.users と 1:1。id を共有）
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- 利用者 × 会社
create table if not exists public.client_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.client_role not null default 'manager',
  created_at timestamptz not null default now(),
  unique (client_id, profile_id)
);
create index if not exists client_members_profile_idx on public.client_members(profile_id);
create index if not exists client_members_client_idx on public.client_members(client_id);

-- 利用者 × 店舗（店舗責任者の担当店を絞る）
create table if not exists public.store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (store_id, profile_id)
);
create index if not exists store_members_profile_idx on public.store_members(profile_id);
create index if not exists store_members_store_idx on public.store_members(store_id);

-- auth.users が作られたら profiles を自動作成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 一般ユーザーが自分を管理者(is_platform_admin)に昇格させられないようにする。
-- 変更できるのは service_role（秘密の管理者キー）だけ。
create or replace function public.prevent_self_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jwt_role text;
begin
  if new.is_platform_admin is distinct from old.is_platform_admin then
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    if jwt_role is distinct from 'service_role' then
      raise exception 'is_platform_admin は変更できません';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_self_admin on public.profiles;
create trigger profiles_prevent_self_admin
  before update on public.profiles
  for each row execute function public.prevent_self_admin();

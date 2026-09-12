-- 0010_receivable_balance_rpc.sql
-- 売掛残高の集計をDB側のRPC(1クエリの集計)に変更する。
--
-- 経緯: ダッシュボードの売上・営業利益と違い、売掛残高は「期間末までの
-- 全履歴」を毎回スキャンする必要がある(前日以前からの繰越残高のため)。
-- 実測したところ、この画面の速度低下の最大の原因はこのクエリで、
-- デモデータ(約2年分・841件)を全件フェッチしてからJS側で合計しており、
-- 1回あたり2.7秒前後かかっていた(daily_receivable_entries から
-- daily_records を経由したRLSの行ごとのEXISTS判定コストと、
-- 841行分のJSON転送コストの両方が乗る)。
--
-- 対応: SUMをPostgres側で計算し、1行の数値だけを返すRPCにする。
-- 認可は既存の dre_all ポリシーと同じ条件(is_platform_admin() または
-- 自分が見られる店舗)をWHERE句に直接書いて再現する
-- (security definer だが、RLSと同じ範囲しか見せない)。
create or replace function public.receivable_balance(p_store_id uuid, p_as_of date)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    sum(case when dre.direction = 'incurred' then dre.amount else -dre.amount end),
    0
  )
  from public.daily_receivable_entries dre
  join public.daily_records dr on dr.id = dre.daily_record_id
  where dr.store_id = p_store_id
    and dr.business_date <= p_as_of
    and (public.is_platform_admin() or dr.store_id in (select public.my_store_ids()));
$$;

grant execute on function public.receivable_balance(uuid, date) to authenticated;

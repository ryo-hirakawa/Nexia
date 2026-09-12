-- 0011_dashboard_breakdown_rpc.sql
-- 費目別経費・カテゴリ別・決済別・キャスト別の4テーブルを、
-- 1回のRPC呼び出し(1往復)にまとめる。
--
-- 経緯: 0010番でRPC化した売掛残高に続き、計測(per-query timing、本番
-- 実測)で確認したところ、daily_costs/daily_sales_categories/
-- daily_payments/daily_cast_sales の4クエリはそれぞれ単独で実行しても
-- 約600ms、ダッシュボード読み込み時のように4つ同時に投げると
-- 約2秒前後まで悪化していた(件数はどれも30〜45行程度で、行数自体が
-- 原因ではない)。個々のHTTPリクエストに乗る固定コストが4回分
-- 積み重なっていたため、4テーブルぶんをPostgres側で1回のJSON集計に
-- まとめ、リクエスト回数を4→1に減らす。
--
-- 認可は既存の dsc_all/dp_all/dc_all/dcs_all ポリシーと同じ条件
-- (is_platform_admin() または自分が見られる店舗)をWHERE句に直接
-- 書いて再現する(security definer だが、RLSと同じ範囲しか見せない)。
create or replace function public.dashboard_breakdown(
  p_store_id uuid,
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'costs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cost_class', dc.cost_class, 'item', dc.item, 'amount', dc.amount
      ))
      from public.daily_costs dc
      join public.daily_records dr on dr.id = dc.daily_record_id
      where dr.store_id = p_store_id
        and dr.business_date between p_start and p_end
        and (public.is_platform_admin() or dr.store_id in (select public.my_store_ids()))
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', c.category, 'amount', c.amount
      ))
      from public.daily_sales_categories c
      join public.daily_records dr on dr.id = c.daily_record_id
      where dr.store_id = p_store_id
        and dr.business_date between p_start and p_end
        and (public.is_platform_admin() or dr.store_id in (select public.my_store_ids()))
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'method', p.method, 'amount', p.amount
      ))
      from public.daily_payments p
      join public.daily_records dr on dr.id = p.daily_record_id
      where dr.store_id = p_store_id
        and dr.business_date between p_start and p_end
        and (public.is_platform_admin() or dr.store_id in (select public.my_store_ids()))
    ), '[]'::jsonb),
    'casts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'cast_name', cs.cast_name,
        'nominate_amount', cs.nominate_amount,
        'table_amount', cs.table_amount,
        'companion_amount', cs.companion_amount,
        'back_amount', cs.back_amount
      ))
      from public.daily_cast_sales cs
      join public.daily_records dr on dr.id = cs.daily_record_id
      where dr.store_id = p_store_id
        and dr.business_date between p_start and p_end
        and (public.is_platform_admin() or dr.store_id in (select public.my_store_ids()))
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.dashboard_breakdown(uuid, date, date) to authenticated;

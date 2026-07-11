-- Etapa 12C — Corrige "canceling statement due to statement timeout" em
-- analytics_dashboard_snapshot (chamada por getSnapshot em lib/repositories/supabase.ts).
--
-- Causa: a versão original (202607114000) varria a tabela orders 7 vezes e a
-- tabela payments 2 vezes de forma independente, cada uma reaplicando o mesmo
-- filtro de company_id + período do zero. Sob volume real de dados isso soma
-- I/O suficiente para estourar o timeout do Supabase.
--
-- Correção: uma única passada por orders (CTE `period_orders`, marcada
-- MATERIALIZED para garantir que o Postgres não a re-inline em cada CTE
-- derivada) e uma única passada por payments (`period_payments`, idem).
-- Todo o resto (contagens, ranking, série temporal, pedidos recentes,
-- pedidos por status, pagamentos por forma) deriva dessas duas CTEs já
-- filtradas, sem tocar as tabelas base de novo. jsonb_build_object só
-- monta o resultado no final, sobre agregados já prontos.
begin;
set local check_function_bodies = off;

-- Índices de apoio às consultas analíticas (Dashboard e Relatórios da Etapa 12).
-- orders(company_id, created_at) já existe desde a Etapa 8 como
-- orders_company_date_idx(company_id, created_at desc) — não recriado aqui.
create index if not exists orders_company_status_created_idx on public.orders(company_id, status, created_at);
create index if not exists orders_company_payment_status_created_idx on public.orders(company_id, payment_status, created_at);
create index if not exists order_items_order_idx on public.order_items(order_id);
create index if not exists payments_company_order_status_idx on public.payments(company_id, order_id, status);
create index if not exists stock_movements_company_product_date_idx on public.stock_movements(company_id, product_id, created_at);
create index if not exists products_company_deleted_idx on public.products(company_id, deleted_at);

-- Mesma assinatura e mesmo formato de retorno (jsonb) da Etapa 12 original.
create or replace function public.analytics_dashboard_snapshot(p_company uuid, p_period text) returns jsonb
language plpgsql stable set search_path=public as $$
declare
  v_tz text; v_start timestamptz; v_end timestamptz; v_result jsonb;
begin
  select coalesce(timezone,'America/Sao_Paulo') into v_tz from companies where id=p_company;
  select b.p_start, b.p_end into v_start, v_end from analytics_period_bounds(p_company,p_period) b;

  with period_orders as materialized (
    select id, status, customer_id, customer_name, total_cents, created_at
    from orders
    where company_id=p_company and deleted_at is null and created_at>=v_start and created_at<=v_end
  ), valid_orders as (
    select * from period_orders where status<>'cancelled'
  ), order_counts as (
    select count(*) as orders_count,
           count(*) filter (where status in ('new','confirmed','preparing','ready','out_for_delivery')) as open_orders
    from period_orders
  ), valid_agg as (
    select count(*) as valid_count, coalesce(sum(total_cents),0) as revenue,
           count(distinct customer_id) as customers
    from valid_orders
  ), status_breakdown as (
    select s.status, coalesce(o.cnt,0) as cnt, coalesce(o.total,0) as total
    from unnest(array['new','confirmed','preparing','ready','out_for_delivery','completed','cancelled']) as s(status)
    left join (select status::text, count(*) as cnt, sum(total_cents) as total from period_orders group by 1) o on o.status=s.status
  ), recent as (
    select id, created_at from period_orders order by created_at desc limit 5
  ), item_sales as (
    select oi.product_id, max(oi.product_name) as name, sum(oi.quantity) as qty, sum(oi.total_cents) as rev
    from order_items oi join valid_orders vo on vo.id=oi.order_id
    group by oi.product_id order by qty desc limit 5
  ), customer_sales as (
    select coalesce(customer_id::text,'anonymous') as cust_id, max(customer_name) as name, count(*) as cnt, sum(total_cents) as rev
    from valid_orders group by 1 order by rev desc limit 5
  ), hourly_agg as (
    select extract(hour from (created_at at time zone v_tz))::int as hr, sum(total_cents) as total
    from valid_orders group by 1
  ), hourly_series as (
    select coalesce(jsonb_agg(jsonb_build_object('label', lpad(h::text,2,'0')||'h', 'value', coalesce(ha.total,0)) order by h), '[]'::jsonb) as series
    from generate_series(10,21) as h left join hourly_agg ha on ha.hr=h
  ), daily_agg as (
    select date_trunc('day', created_at at time zone v_tz) as day, sum(total_cents) as total
    from valid_orders group by 1
  ), daily_series as (
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(d,'DD/MM'), 'value', coalesce(da.total,0)) order by d), '[]'::jsonb) as series
    from generate_series(date_trunc('day', v_start at time zone v_tz), date_trunc('day', v_end at time zone v_tz), interval '1 day') as d
    left join daily_agg da on da.day=d
  ), period_payments as materialized (
    select method, status, amount_cents, refunded_cents
    from payments where company_id=p_company and created_at>=v_start and created_at<=v_end
  ), paid_agg as (
    select coalesce(sum(case when status in ('paid','refunded') then amount_cents-refunded_cents else 0 end),0) as paid
    from period_payments
  ), method_breakdown as (
    select m.method, coalesce(p.cnt,0) as cnt, coalesce(p.total,0) as total
    from unnest(array['pix','cash','credit_card','debit_card']) as m(method)
    left join (select method::text, count(*) as cnt, sum(case when status in ('paid','refunded') then amount_cents-refunded_cents else 0 end) as total from period_payments group by 1) p on p.method=m.method
  ), new_customers as (
    select count(*) as cnt from customers where company_id=p_company and deleted_at is null and created_at>=v_start and created_at<=v_end
  ), stock_agg as (
    select count(*) filter (where track_stock and current_stock<=minimum_stock) as low,
           count(*) filter (where status='out_of_stock') as out_of,
           coalesce(sum(current_stock*price_cents) filter (where track_stock),0) as value
    from products where company_id=p_company and deleted_at is null
  )
  select jsonb_build_object(
    'period', p_period, 'referenceDate', v_end,
    'orders', oc.orders_count, 'openOrders', oc.open_orders,
    'revenueCents', va.revenue, 'paidRevenueCents', pa.paid,
    'averageTicketCents', case when va.valid_count>0 then round(va.revenue::numeric/va.valid_count) else 0 end,
    'customers', va.customers, 'newCustomers', nc.cnt,
    'lowStock', sa.low, 'outOfStock', sa.out_of, 'stockValueCents', sa.value,
    'salesSeries', case when p_period='today' then (select series from hourly_series) else (select series from daily_series) end,
    'topProducts', (select coalesce(jsonb_agg(jsonb_build_object('id',product_id,'name',name,'quantity',qty,'revenueCents',rev) order by qty desc),'[]'::jsonb) from item_sales),
    'topCustomers', (select coalesce(jsonb_agg(jsonb_build_object('id',cust_id,'name',name,'quantity',cnt,'revenueCents',rev) order by rev desc),'[]'::jsonb) from customer_sales),
    'ordersByStatus', (select coalesce(jsonb_agg(jsonb_build_object('status',status,'count',cnt,'totalCents',total)),'[]'::jsonb) from status_breakdown),
    'paymentsByMethod', (select coalesce(jsonb_agg(jsonb_build_object('method',method,'count',cnt,'totalCents',total)),'[]'::jsonb) from method_breakdown),
    'recentOrderIds', (select coalesce(jsonb_agg(id order by created_at desc),'[]'::jsonb) from recent)
  )
  into v_result
  from order_counts oc, valid_agg va, paid_agg pa, new_customers nc, stock_agg sa;

  return v_result;
end $$;

grant execute on function public.analytics_dashboard_snapshot(uuid,text) to authenticated;

commit;

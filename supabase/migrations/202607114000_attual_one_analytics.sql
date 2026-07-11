-- Etapa 12 — Camada analítica para Dashboard e Relatórios.
-- Todas as funções abaixo são somente leitura e NÃO usam security definer:
-- rodam com o privilégio de quem chama, então as políticas RLS já existentes em
-- companies/products/orders/order_items/payments/customers continuam se aplicando
-- normalmente linha a linha — isolamento por empresa vem de graça, sem precisar
-- replicar checagem manual de is_company_member em cada função.
begin;
set local check_function_bodies = off;

alter table public.companies add column if not exists timezone text not null default 'America/Sao_Paulo';

-- Calcula o início/fim do período (hoje, 7d, 30d, tudo) no fuso horário da empresa.
create function public.analytics_period_bounds(p_company uuid, p_period text, out p_start timestamptz, out p_end timestamptz)
language plpgsql stable set search_path=public as $$
declare v_tz text; v_now timestamptz := now();
begin
  select coalesce(timezone,'America/Sao_Paulo') into v_tz from companies where id=p_company;
  p_end := v_now;
  p_start := case
    when p_period='today' then date_trunc('day', v_now at time zone v_tz) at time zone v_tz
    when p_period='7d' then date_trunc('day', v_now at time zone v_tz) at time zone v_tz - interval '6 days'
    when p_period='30d' then date_trunc('day', v_now at time zone v_tz) at time zone v_tz - interval '29 days'
    else '-infinity'::timestamptz
  end;
end $$;

-- Snapshot completo do dashboard em uma única viagem ao banco (evita carregar
-- categories/products/orders/order_items/payments inteiros no navegador).
create function public.analytics_dashboard_snapshot(p_company uuid, p_period text) returns jsonb
language plpgsql stable set search_path=public as $$
declare
  v_tz text; v_start timestamptz; v_end timestamptz;
  v_orders_count int; v_open_orders int; v_valid_count int; v_revenue bigint; v_paid bigint;
  v_customers int; v_new_customers int; v_low_stock int; v_out_of_stock int; v_stock_value bigint;
  v_series jsonb; v_top_products jsonb; v_top_customers jsonb; v_orders_by_status jsonb; v_payments_by_method jsonb; v_recent_orders jsonb;
begin
  select coalesce(timezone,'America/Sao_Paulo') into v_tz from companies where id=p_company;
  select b.p_start, b.p_end into v_start, v_end from analytics_period_bounds(p_company,p_period) b;

  select count(*), count(*) filter (where status in ('new','confirmed','preparing','ready','out_for_delivery'))
    into v_orders_count, v_open_orders
    from orders where company_id=p_company and deleted_at is null and created_at>=v_start and created_at<=v_end;

  select count(*), coalesce(sum(total_cents),0), count(distinct customer_id) filter (where customer_id is not null)
    into v_valid_count, v_revenue, v_customers
    from orders where company_id=p_company and deleted_at is null and status<>'cancelled' and created_at>=v_start and created_at<=v_end;

  select coalesce(sum(case when status in ('paid','refunded') then amount_cents-refunded_cents else 0 end),0)
    into v_paid from payments where company_id=p_company and created_at>=v_start and created_at<=v_end;

  select count(*) into v_new_customers from customers where company_id=p_company and deleted_at is null and created_at>=v_start and created_at<=v_end;

  select count(*) filter (where track_stock and current_stock<=minimum_stock),
         count(*) filter (where status='out_of_stock'),
         coalesce(sum(current_stock*price_cents) filter (where track_stock),0)
    into v_low_stock, v_out_of_stock, v_stock_value
    from products where company_id=p_company and deleted_at is null;

  if p_period='today' then
    select coalesce(jsonb_agg(jsonb_build_object('label', lpad(h::text,2,'0')||'h', 'value', coalesce(s.total,0)) order by h), '[]'::jsonb)
      into v_series
      from generate_series(10,21) as h
      left join (
        select extract(hour from (created_at at time zone v_tz))::int as hr, sum(total_cents) as total
        from orders where company_id=p_company and deleted_at is null and status<>'cancelled' and created_at>=v_start and created_at<=v_end
        group by 1
      ) s on s.hr=h;
  else
    select coalesce(jsonb_agg(jsonb_build_object('label', to_char(d,'DD/MM'), 'value', coalesce(s.total,0)) order by d), '[]'::jsonb)
      into v_series
      from generate_series(date_trunc('day', v_start at time zone v_tz), date_trunc('day', v_end at time zone v_tz), interval '1 day') as d
      left join (
        select date_trunc('day', created_at at time zone v_tz) as day, sum(total_cents) as total
        from orders where company_id=p_company and deleted_at is null and status<>'cancelled' and created_at>=v_start and created_at<=v_end
        group by 1
      ) s on s.day=d;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', product_id, 'name', name, 'quantity', qty, 'revenueCents', rev) order by qty desc), '[]'::jsonb)
    into v_top_products
    from (
      select oi.product_id, max(oi.product_name) as name, sum(oi.quantity) as qty, sum(oi.total_cents) as rev
      from order_items oi join orders o on o.id=oi.order_id
      where o.company_id=p_company and o.deleted_at is null and o.status<>'cancelled' and o.created_at>=v_start and o.created_at<=v_end
      group by oi.product_id order by qty desc limit 5
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object('id', cust_id, 'name', name, 'quantity', cnt, 'revenueCents', rev) order by rev desc), '[]'::jsonb)
    into v_top_customers
    from (
      select coalesce(customer_id::text,'anonymous') as cust_id, max(customer_name) as name, count(*) as cnt, sum(total_cents) as rev
      from orders where company_id=p_company and deleted_at is null and status<>'cancelled' and created_at>=v_start and created_at<=v_end
      group by 1 order by rev desc limit 5
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', coalesce(o.cnt,0), 'totalCents', coalesce(o.total,0))), '[]'::jsonb)
    into v_orders_by_status
    from unnest(array['new','confirmed','preparing','ready','out_for_delivery','completed','cancelled']) as s(status)
    left join (
      select status::text, count(*) as cnt, sum(total_cents) as total
      from orders where company_id=p_company and deleted_at is null and created_at>=v_start and created_at<=v_end
      group by 1
    ) o on o.status=s.status;

  select coalesce(jsonb_agg(jsonb_build_object('method', m.method, 'count', coalesce(p.cnt,0), 'totalCents', coalesce(p.total,0))), '[]'::jsonb)
    into v_payments_by_method
    from unnest(array['pix','cash','credit_card','debit_card']) as m(method)
    left join (
      select method::text, count(*) as cnt, sum(case when status in ('paid','refunded') then amount_cents-refunded_cents else 0 end) as total
      from payments where company_id=p_company and created_at>=v_start and created_at<=v_end
      group by 1
    ) p on p.method=m.method;

  select coalesce(jsonb_agg(t.id order by t.created_at desc), '[]'::jsonb) into v_recent_orders
    from (select id, created_at from orders where company_id=p_company and deleted_at is null and created_at>=v_start and created_at<=v_end order by created_at desc limit 5) t;

  return jsonb_build_object(
    'period', p_period, 'referenceDate', v_end,
    'orders', v_orders_count, 'openOrders', v_open_orders,
    'revenueCents', v_revenue, 'paidRevenueCents', v_paid,
    'averageTicketCents', case when v_valid_count>0 then round(v_revenue::numeric/v_valid_count) else 0 end,
    'customers', v_customers, 'newCustomers', v_new_customers,
    'lowStock', v_low_stock, 'outOfStock', v_out_of_stock, 'stockValueCents', v_stock_value,
    'salesSeries', v_series, 'topProducts', v_top_products, 'topCustomers', v_top_customers,
    'ordersByStatus', v_orders_by_status, 'paymentsByMethod', v_payments_by_method, 'recentOrderIds', v_recent_orders
  );
end $$;

-- Relatório paginado e pesquisável de produtos por vendas no período.
create function public.report_products(p_company uuid, p_period text, p_search text, p_limit int, p_offset int)
returns table(product_id uuid, name text, sku text, quantity bigint, revenue_cents bigint, current_stock int, minimum_stock int, status text, total_count bigint)
language plpgsql stable set search_path=public as $$
declare v_start timestamptz; v_end timestamptz;
begin
  select b.p_start, b.p_end into v_start, v_end from analytics_period_bounds(p_company,p_period) b;
  return query
    with sales as (
      select oi.product_id as id, sum(oi.quantity) as qty, sum(oi.total_cents) as rev
      from order_items oi join orders o on o.id=oi.order_id
      where o.company_id=p_company and o.deleted_at is null and o.status<>'cancelled' and o.created_at>=v_start and o.created_at<=v_end
      group by oi.product_id
    ), base as (
      select p.id, p.name, p.sku, coalesce(s.qty,0) as qty, coalesce(s.rev,0) as rev, p.current_stock, p.minimum_stock, p.status
      from products p left join sales s on s.id=p.id
      where p.company_id=p_company and p.deleted_at is null
        and (p_search is null or p_search='' or p.name ilike '%'||p_search||'%' or p.sku ilike '%'||p_search||'%')
    )
    select base.id, base.name, base.sku, base.qty, base.rev, base.current_stock, base.minimum_stock, base.status, count(*) over()
    from base order by base.qty desc, base.name asc limit p_limit offset p_offset;
end $$;

-- Relatório paginado e pesquisável de clientes por pedidos válidos no período.
create function public.report_customers(p_company uuid, p_period text, p_search text, p_limit int, p_offset int)
returns table(customer_id uuid, name text, phone text, orders_count bigint, revenue_cents bigint, total_count bigint)
language plpgsql stable set search_path=public as $$
declare v_start timestamptz; v_end timestamptz;
begin
  select b.p_start, b.p_end into v_start, v_end from analytics_period_bounds(p_company,p_period) b;
  return query
    with sales as (
      select customer_id as id, count(*) as cnt, sum(total_cents) as rev
      from orders where company_id=p_company and deleted_at is null and status<>'cancelled' and customer_id is not null and created_at>=v_start and created_at<=v_end
      group by customer_id
    ), base as (
      select c.id, c.name, c.phone, coalesce(s.cnt,0) as cnt, coalesce(s.rev,0) as rev
      from customers c left join sales s on s.id=c.id
      where c.company_id=p_company and c.deleted_at is null
        and (p_search is null or p_search='' or c.name ilike '%'||p_search||'%' or c.phone ilike '%'||p_search||'%')
    )
    select base.id, base.name, base.phone, base.cnt, base.rev, count(*) over()
    from base order by base.rev desc, base.name asc limit p_limit offset p_offset;
end $$;

-- Relatório paginado e pesquisável de estoque (não é filtrado por período: é saldo atual real).
create function public.report_stock(p_company uuid, p_search text, p_limit int, p_offset int)
returns table(product_id uuid, name text, sku text, current_stock int, minimum_stock int, status text, track_stock boolean, total_count bigint)
language sql stable set search_path=public as $$
  select id, name, sku, current_stock, minimum_stock, status, track_stock, count(*) over()
  from products
  where company_id=p_company and deleted_at is null
    and (p_search is null or p_search='' or name ilike '%'||p_search||'%' or sku ilike '%'||p_search||'%')
  order by (case when track_stock and current_stock<=minimum_stock then 0 else 1 end), current_stock asc, name asc
  limit p_limit offset p_offset;
$$;

grant execute on function public.analytics_period_bounds(uuid,text) to authenticated;
grant execute on function public.analytics_dashboard_snapshot(uuid,text) to authenticated;
grant execute on function public.report_products(uuid,text,text,int,int) to authenticated;
grant execute on function public.report_customers(uuid,text,text,int,int) to authenticated;
grant execute on function public.report_stock(uuid,text,int,int) to authenticated;

commit;

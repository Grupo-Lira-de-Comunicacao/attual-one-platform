-- Etapa 12B — Corrige "column reference customer_id is ambiguous" em report_customers.
--
-- Causa: em `returns table(customer_id uuid, ...)`, o nome do parâmetro de saída
-- (customer_id) fica acessível como identificador dentro do corpo da função
-- plpgsql. A CTE `sales` fazia `from orders where ... group by customer_id` sem
-- alias para a tabela `orders`, então `customer_id` ficava ambíguo entre o
-- parâmetro de saída e a coluna orders.customer_id. As demais CTEs da mesma
-- função e as funções report_products/report_stock já qualificavam todas as
-- colunas com alias e não têm esse problema.
--
-- Mesma assinatura, mesmo tipo de retorno, mesma paginação/filtro/busca/RLS —
-- só qualifica explicitamente company_id, deleted_at, status, customer_id e
-- created_at com o alias `o` da tabela orders.
begin;
set local check_function_bodies = off;

create or replace function public.report_customers(p_company uuid, p_period text, p_search text, p_limit int, p_offset int)
returns table(customer_id uuid, name text, phone text, orders_count bigint, revenue_cents bigint, total_count bigint)
language plpgsql stable set search_path=public as $$
declare v_start timestamptz; v_end timestamptz;
begin
  select b.p_start, b.p_end into v_start, v_end from analytics_period_bounds(p_company,p_period) b;
  return query
    with sales as (
      select o.customer_id as id, count(*) as cnt, sum(o.total_cents) as rev
      from orders o
      where o.company_id=p_company and o.deleted_at is null and o.status<>'cancelled' and o.customer_id is not null and o.created_at>=v_start and o.created_at<=v_end
      group by o.customer_id
    ), base as (
      select c.id as id, c.name as name, c.phone as phone, coalesce(s.cnt,0) as cnt, coalesce(s.rev,0) as rev
      from customers c left join sales s on s.id=c.id
      where c.company_id=p_company and c.deleted_at is null
        and (p_search is null or p_search='' or c.name ilike '%'||p_search||'%' or c.phone ilike '%'||p_search||'%')
    )
    select base.id, base.name, base.phone, base.cnt, base.rev, count(*) over()
    from base order by base.rev desc, base.name asc limit p_limit offset p_offset;
end $$;

grant execute on function public.report_customers(uuid,text,text,int,int) to authenticated;

commit;

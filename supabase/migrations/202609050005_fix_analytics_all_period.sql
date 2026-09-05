begin;
set local check_function_bodies = off;

-- `all` previously returned -infinity. The dashboard then used that value in
-- generate_series(), which can exhaust PostgreSQL temporary disk space.
-- Keep "all" semantically complete but finite by starting at the earliest
-- relevant record for the selected company.
create or replace function public.analytics_period_bounds(
  p_company uuid,
  p_period text,
  out p_start timestamptz,
  out p_end timestamptz
)
language plpgsql stable set search_path=public as $$
declare
  v_tz text;
  v_now timestamptz := now();
  v_first timestamptz;
begin
  select coalesce(timezone,'America/Sao_Paulo')
    into v_tz
    from companies
    where id=p_company;

  p_end := v_now;

  if p_period='today' then
    p_start := date_trunc('day', v_now at time zone v_tz) at time zone v_tz;
  elsif p_period='7d' then
    p_start := date_trunc('day', v_now at time zone v_tz) at time zone v_tz - interval '6 days';
  elsif p_period='30d' then
    p_start := date_trunc('day', v_now at time zone v_tz) at time zone v_tz - interval '29 days';
  else
    select min(ts) into v_first
    from (
      select min(created_at) as ts from orders where company_id=p_company
      union all
      select min(created_at) as ts from payments where company_id=p_company
      union all
      select min(created_at) as ts from customers where company_id=p_company
      union all
      select min(created_at) as ts from products where company_id=p_company
    ) dates
    where ts is not null;

    p_start := coalesce(
      date_trunc('day', v_first at time zone v_tz) at time zone v_tz,
      date_trunc('day', v_now at time zone v_tz) at time zone v_tz
    );
  end if;
end $$;

revoke all on function public.analytics_period_bounds(uuid,text) from public, anon;
grant execute on function public.analytics_period_bounds(uuid,text) to authenticated;

commit;

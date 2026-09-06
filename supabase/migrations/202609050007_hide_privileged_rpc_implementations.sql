begin;
set local check_function_bodies = off;

-- Keep privileged implementations out of the exposed PostgREST schema.
-- Public RPCs below are SECURITY INVOKER compatibility wrappers; the actual
-- privileged code lives in a non-exposed private schema with explicit checks.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Move existing SECURITY DEFINER implementations to the private schema.
alter function public.is_company_member(uuid) set schema private;
alter function public.has_company_role(uuid, public.company_role[]) set schema private;
alter function public.is_platform_admin() set schema private;
alter function public.adjust_stock(uuid,text,integer,text,text) set schema private;
alter function public.confirm_order(uuid,text) set schema private;
alter function public.cancel_order(uuid,text,text) set schema private;
alter function public.apply_order_coupon(uuid,text,text) set schema private;
alter function public.analytics_dashboard_snapshot(uuid,text) set schema private;
alter function public.platform_create_company(text,text,uuid) set schema private;
alter function public.platform_find_user_by_email(text) set schema private;
alter function public.platform_link_owner(uuid,uuid) set schema private;

-- Private helper functions: no anonymous access, explicit authenticated access.
revoke all on function private.is_company_member(uuid) from public, anon;
revoke all on function private.has_company_role(uuid, public.company_role[]) from public, anon;
revoke all on function private.is_platform_admin() from public, anon;
grant execute on function private.is_company_member(uuid) to authenticated;
grant execute on function private.has_company_role(uuid, public.company_role[]) to authenticated;
grant execute on function private.is_platform_admin() to authenticated;

-- Tighten the privileged operational RPCs with explicit role checks.
create or replace function private.adjust_stock(p_product uuid,p_type text,p_quantity integer,p_reason text,p_key text)
returns public.products
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.products; previous integer; resulting integer; qty integer;
begin
  if auth.uid() is null then raise exception 'autenticação obrigatória' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'motivo obrigatório'; end if;
  if p_type not in ('entry','exit','adjustment') then raise exception 'tipo de movimentação inválido'; end if;
  select * into p from public.products where id=p_product for update;
  if p.id is null or not private.has_company_role(p.company_id,array['owner','manager','operator']::public.company_role[]) then raise exception 'produto não encontrado ou operação não autorizada' using errcode='42501'; end if;
  if exists(select 1 from public.stock_movements where company_id=p.company_id and idempotency_key=p_key) then return p; end if;
  if not p.track_stock then raise exception 'este produto não controla estoque'; end if;
  if p_quantity is null or p_quantity<0 or (p_type<>'adjustment' and p_quantity=0) then raise exception 'informe uma quantidade válida'; end if;
  previous=p.current_stock;
  resulting=case when p_type='entry' then previous+p_quantity when p_type='exit' then previous-p_quantity else p_quantity end;
  if resulting<0 then raise exception 'o estoque não pode ficar negativo'; end if;
  qty=case when p_type='adjustment' then abs(resulting-previous) else p_quantity end;
  update public.products set current_stock=resulting,status=case when status<>'inactive' then(case when resulting=0 then 'out_of_stock' else 'available' end) else status end,updated_by=auth.uid() where id=p.id returning * into p;
  insert into public.stock_movements(company_id,product_id,type,quantity,previous_stock,resulting_stock,reason,idempotency_key,created_by)
    values(p.company_id,p.id,p_type,qty,previous,resulting,trim(p_reason),p_key,auth.uid())
    on conflict(company_id,idempotency_key) do nothing;
  return p;
end $$;

create or replace function private.confirm_order(p_order uuid,p_key text)
returns public.orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; i public.order_items; p public.products;
begin
  if auth.uid() is null then raise exception 'autenticação obrigatória' using errcode='42501'; end if;
  select * into o from public.orders where id=p_order for update;
  if o.id is null or not private.has_company_role(o.company_id,array['owner','manager','attendant','operator']::public.company_role[]) then raise exception 'pedido não encontrado ou operação não autorizada' using errcode='42501'; end if;
  if o.stock_applied then return o; end if;
  for i in select * from public.order_items where order_id=o.id loop
    select * into p from public.products where id=i.product_id for update;
    if p.status<>'available' or (p.track_stock and p.current_stock<i.quantity) then raise exception 'estoque indisponível: %',p.name; end if;
    if p.track_stock then
      update public.products set current_stock=current_stock-i.quantity,status=case when current_stock-i.quantity=0 then 'out_of_stock' else status end,updated_by=auth.uid() where id=p.id;
      insert into public.stock_movements(company_id,product_id,type,quantity,previous_stock,resulting_stock,reason,idempotency_key,created_by)
        values(o.company_id,p.id,'exit',i.quantity,p.current_stock,p.current_stock-i.quantity,'Confirmação pedido #'||o.number,p_key||':'||p.id,auth.uid())
        on conflict(company_id,idempotency_key) do nothing;
    end if;
  end loop;
  update public.orders set status='confirmed',stock_applied=true,updated_by=auth.uid() where id=o.id returning * into o;
  return o;
end $$;

create or replace function private.cancel_order(p_order uuid,p_reason text,p_key text)
returns public.orders
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; i public.order_items; p public.products;
begin
  if auth.uid() is null then raise exception 'autenticação obrigatória' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'motivo obrigatório'; end if;
  select * into o from public.orders where id=p_order for update;
  if o.id is null or not private.has_company_role(o.company_id,array['owner','manager','attendant','operator']::public.company_role[]) then raise exception 'pedido não encontrado ou operação não autorizada' using errcode='42501'; end if;
  if o.status='cancelled' then return o; end if;
  if o.stock_applied then
    for i in select * from public.order_items where order_id=o.id loop
      select * into p from public.products where id=i.product_id for update;
      if p.track_stock then
        update public.products set current_stock=current_stock+i.quantity,status=case when status='out_of_stock' then 'available' else status end,updated_by=auth.uid() where id=p.id;
        insert into public.stock_movements(company_id,product_id,type,quantity,previous_stock,resulting_stock,reason,idempotency_key,created_by)
          values(o.company_id,p.id,'reversal',i.quantity,p.current_stock,p.current_stock+i.quantity,'Cancelamento pedido #'||o.number||': '||p_reason,p_key||':'||p.id,auth.uid())
          on conflict(company_id,idempotency_key) do nothing;
      end if;
    end loop;
  end if;
  perform public.reverse_loyalty(o.id,p_key||':loyalty');
  update public.orders set status='cancelled',stock_applied=false,cancellation_reason=p_reason,updated_by=auth.uid() where id=o.id returning * into o;
  return o;
end $$;

create or replace function private.apply_order_coupon(p_order uuid,p_code text,p_key text)
returns public.coupon_usages
language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.orders; c public.coupons; discount integer; result public.coupon_usages; customer_uses integer;
begin
  if auth.uid() is null then raise exception 'autenticação obrigatória' using errcode='42501'; end if;
  select * into o from public.orders where id=p_order for update;
  if o.id is null or not private.has_company_role(o.company_id,array['owner','manager','attendant','operator']::public.company_role[]) then raise exception 'pedido não encontrado ou operação não autorizada' using errcode='42501'; end if;
  select * into c from public.coupons where company_id=o.company_id and upper(code)=upper(p_code) and status='active' and now() between starts_at and expires_at for update;
  if c.id is null or o.subtotal_cents<c.minimum_order_cents or (c.usage_limit is not null and c.usage_count>=c.usage_limit) then raise exception 'cupom inválido'; end if;
  if c.per_customer_limit is not null and o.customer_id is not null then
    select count(*) into customer_uses from public.coupon_usages where coupon_id=c.id and customer_id=o.customer_id;
    if customer_uses>=c.per_customer_limit then raise exception 'limite de uso deste cupom por cliente atingido'; end if;
  end if;
  discount:=least(o.subtotal_cents,case when c.type='percentage' then round(o.subtotal_cents*c.value/100.0)::integer else c.value end);
  insert into public.coupon_usages(company_id,coupon_id,order_id,customer_id,discount_cents)
    values(o.company_id,c.id,o.id,o.customer_id,discount)
    on conflict(coupon_id,order_id) do update set discount_cents=excluded.discount_cents returning * into result;
  update public.coupons set usage_count=(select count(*) from public.coupon_usages where coupon_id=c.id) where id=c.id;
  update public.orders set discount_cents=discount,total_cents=subtotal_cents-discount+delivery_fee_cents,updated_by=auth.uid() where id=o.id;
  return result;
end $$;

-- Harden platform-admin functions while they are private.
create or replace function private.platform_create_company(p_name text,p_slug text,p_owner_user_id uuid)
returns public.companies
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.companies; v_slug text:=lower(trim(coalesce(p_slug,'')));
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'apenas administradores da plataforma podem criar empresas' using errcode='42501'; end if;
  if length(trim(coalesce(p_name,'')))=0 then raise exception 'nome da empresa é obrigatório'; end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'slug inválido'; end if;
  if not exists(select 1 from public.profiles where id=p_owner_user_id) then raise exception 'usuário proprietário não encontrado'; end if;
  if exists(select 1 from public.companies where slug=v_slug) then raise exception 'slug já está em uso'; end if;
  insert into public.companies(name,slug) values(trim(p_name),v_slug) returning * into result;
  insert into public.company_users(company_id,user_id,role,status,created_by) values(result.id,p_owner_user_id,'owner','active',auth.uid());
  insert into public.audit_logs(company_id,user_id,action,entity,entity_id,essentials)
    values(result.id,auth.uid(),'insert','companies',result.id,jsonb_build_object('name',result.name,'slug',result.slug,'owner_user_id',p_owner_user_id,'via','platform_admin'));
  return result;
end $$;

create or replace function private.platform_find_user_by_email(p_email text)
returns table(user_id uuid,full_name text,email text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'apenas administradores da plataforma podem buscar usuários' using errcode='42501'; end if;
  return query select u.id,p.full_name,u.email::text from auth.users u left join public.profiles p on p.id=u.id where lower(u.email)=lower(trim(p_email));
end $$;

create or replace function private.platform_link_owner(p_company_id uuid,p_user_id uuid)
returns public.company_users
language plpgsql security definer set search_path=public,pg_temp as $$
declare result public.company_users;
begin
  if auth.uid() is null or not private.is_platform_admin() then raise exception 'apenas administradores da plataforma podem vincular proprietários' using errcode='42501'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'empresa não encontrada'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'usuário não encontrado'; end if;
  insert into public.company_users(company_id,user_id,role,status,created_by) values(p_company_id,p_user_id,'owner','active',auth.uid())
    on conflict(company_id,user_id) do update set role='owner',status='active',updated_at=now()
    returning * into result;
  insert into public.audit_logs(company_id,user_id,action,entity,entity_id,essentials)
    values(p_company_id,auth.uid(),'update','company_users',result.id,jsonb_build_object('linked_user_id',p_user_id,'role','owner','via','platform_admin'));
  return result;
end $$;

-- Private implementations may execute only for authenticated callers through
-- the public wrappers. They are not in an exposed API schema.
do $$
declare sig regprocedure;
begin
  foreach sig in array array[
    'private.adjust_stock(uuid,text,integer,text,text)'::regprocedure,
    'private.confirm_order(uuid,text)'::regprocedure,
    'private.cancel_order(uuid,text,text)'::regprocedure,
    'private.apply_order_coupon(uuid,text,text)'::regprocedure,
    'private.analytics_dashboard_snapshot(uuid,text)'::regprocedure,
    'private.platform_create_company(text,text,uuid)'::regprocedure,
    'private.platform_find_user_by_email(text)'::regprocedure,
    'private.platform_link_owner(uuid,uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon',sig);
    execute format('grant execute on function %s to authenticated',sig);
  end loop;
end $$;

-- Public compatibility wrappers are SECURITY INVOKER and keep the existing API.
create function public.is_company_member(p_company uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$ select private.is_company_member(p_company) $$;
create function public.has_company_role(p_company uuid,p_roles public.company_role[]) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$ select private.has_company_role(p_company,p_roles) $$;
create function public.is_platform_admin() returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$ select private.is_platform_admin() $$;

create function public.adjust_stock(p_product uuid,p_type text,p_quantity integer,p_reason text,p_key text) returns public.products
language sql security invoker set search_path=public,pg_temp as $$ select private.adjust_stock(p_product,p_type,p_quantity,p_reason,p_key) $$;
create function public.confirm_order(p_order uuid,p_key text) returns public.orders
language sql security invoker set search_path=public,pg_temp as $$ select private.confirm_order(p_order,p_key) $$;
create function public.cancel_order(p_order uuid,p_reason text,p_key text) returns public.orders
language sql security invoker set search_path=public,pg_temp as $$ select private.cancel_order(p_order,p_reason,p_key) $$;
create function public.apply_order_coupon(p_order uuid,p_code text,p_key text) returns public.coupon_usages
language sql security invoker set search_path=public,pg_temp as $$ select private.apply_order_coupon(p_order,p_code,p_key) $$;
create function public.analytics_dashboard_snapshot(p_company uuid,p_period text) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$ select private.analytics_dashboard_snapshot(p_company,p_period) $$;
create function public.platform_create_company(p_name text,p_slug text,p_owner_user_id uuid) returns public.companies
language sql security invoker set search_path=public,pg_temp as $$ select private.platform_create_company(p_name,p_slug,p_owner_user_id) $$;
create function public.platform_find_user_by_email(p_email text) returns table(user_id uuid,full_name text,email text)
language sql stable security invoker set search_path=public,pg_temp as $$ select * from private.platform_find_user_by_email(p_email) $$;
create function public.platform_link_owner(p_company_id uuid,p_user_id uuid) returns public.company_users
language sql security invoker set search_path=public,pg_temp as $$ select private.platform_link_owner(p_company_id,p_user_id) $$;

revoke all on function public.is_company_member(uuid) from public,anon;
revoke all on function public.has_company_role(uuid,public.company_role[]) from public,anon;
revoke all on function public.is_platform_admin() from public,anon;
revoke all on function public.adjust_stock(uuid,text,integer,text,text) from public,anon;
revoke all on function public.confirm_order(uuid,text) from public,anon;
revoke all on function public.cancel_order(uuid,text,text) from public,anon;
revoke all on function public.apply_order_coupon(uuid,text,text) from public,anon;
revoke all on function public.analytics_dashboard_snapshot(uuid,text) from public,anon;
revoke all on function public.platform_create_company(text,text,uuid) from public,anon;
revoke all on function public.platform_find_user_by_email(text) from public,anon;
revoke all on function public.platform_link_owner(uuid,uuid) from public,anon;

grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid,public.company_role[]) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.adjust_stock(uuid,text,integer,text,text) to authenticated;
grant execute on function public.confirm_order(uuid,text) to authenticated;
grant execute on function public.cancel_order(uuid,text,text) to authenticated;
grant execute on function public.apply_order_coupon(uuid,text,text) to authenticated;
grant execute on function public.analytics_dashboard_snapshot(uuid,text) to authenticated;
grant execute on function public.platform_create_company(text,text,uuid) to authenticated;
grant execute on function public.platform_find_user_by_email(text) to authenticated;
grant execute on function public.platform_link_owner(uuid,uuid) to authenticated;

-- Fail closed: no SECURITY DEFINER function in the exposed public schema may be
-- executable by anon/authenticated after this migration.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
      and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
  ) then
    raise exception 'SECURITY HARDENING FAILED: exposed SECURITY DEFINER function remains executable';
  end if;
end $$;

commit;

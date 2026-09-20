-- Create/update the authenticated storefront customer profile atomically.
-- Only trusted server callers can execute this function.

create or replace function public.upsert_store_customer_profile(
  p_company uuid,
  p_auth_user uuid,
  p_email text,
  p_name text,
  p_phone text,
  p_address jsonb
)
returns public.store_customer_accounts
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_account public.store_customer_accounts;
  v_customer public.customers;
  v_name text := left(trim(coalesce(p_name,'')),160);
  v_phone text := left(trim(coalesce(p_phone,'')),40);
  v_address jsonb := case when jsonb_typeof(coalesce(p_address,'{}'::jsonb))='object' then coalesce(p_address,'{}'::jsonb) else '{}'::jsonb end;
begin
  if p_company is null or p_auth_user is null or v_name='' or v_phone='' then
    raise exception 'STORE_CUSTOMER_PROFILE_INVALID';
  end if;

  if not exists (
    select 1 from public.companies
    where id=p_company and public_store_enabled=true and deleted_at is null
  ) then
    raise exception 'STORE_CUSTOMER_COMPANY_INVALID';
  end if;

  insert into public.store_customer_accounts(company_id,auth_user_id,email)
  values(p_company,p_auth_user,nullif(trim(coalesce(p_email,'')),''))
  on conflict(company_id,auth_user_id) do nothing;

  select *
    into v_account
    from public.store_customer_accounts
   where company_id=p_company and auth_user_id=p_auth_user
   for update;

  if v_account.id is null then
    raise exception 'STORE_CUSTOMER_ACCOUNT_UNAVAILABLE';
  end if;

  if v_account.customer_id is not null then
    select *
      into v_customer
      from public.customers
     where id=v_account.customer_id
       and company_id=p_company
       and deleted_at is null
     for update;

    if v_customer.id is null then
      raise exception 'STORE_CUSTOMER_LINK_INVALID';
    end if;

    update public.customers
       set name=v_name,
           phone=v_phone,
           email=nullif(trim(coalesce(p_email,'')),''),
           address=v_address,
           status='active',
           updated_at=now()
     where id=v_customer.id
     returning * into v_customer;
  else
    insert into public.customers(company_id,name,phone,email,address,status)
    values(
      p_company,
      v_name,
      v_phone,
      nullif(trim(coalesce(p_email,'')),''),
      v_address,
      'active'
    )
    returning * into v_customer;
  end if;

  update public.store_customer_accounts
     set customer_id=v_customer.id,
         email=nullif(trim(coalesce(p_email,'')),''),
         name=v_name,
         phone=v_phone,
         address=v_address,
         updated_at=now()
   where id=v_account.id
   returning * into v_account;

  return v_account;
end
$function$;

revoke all on function public.upsert_store_customer_profile(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.upsert_store_customer_profile(uuid,uuid,text,text,text,jsonb) to postgres,service_role;

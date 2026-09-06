-- Consumer accounts for public storefronts.
-- Keeps internal company users separate from customer identity while reusing Supabase Auth.

create table if not exists public.store_customer_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  email text,
  name text not null default '',
  phone text not null default '',
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, auth_user_id)
);

create unique index if not exists store_customer_accounts_company_customer_uidx
  on public.store_customer_accounts(company_id, customer_id)
  where customer_id is not null;

create index if not exists store_customer_accounts_auth_user_idx
  on public.store_customer_accounts(auth_user_id);

alter table public.store_customer_accounts enable row level security;
revoke all on public.store_customer_accounts from public, anon, authenticated;
grant all on public.store_customer_accounts to service_role;

create or replace function public.link_public_store_order_customer(
  p_order uuid,
  p_customer uuid
) returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_order public.orders;
  v_customer public.customers;
begin
  select * into v_order
  from public.orders
  where id = p_order and source = 'store' and deleted_at is null
  for update;

  if v_order.id is null then raise exception 'STORE_ACCOUNT_ORDER_NOT_FOUND'; end if;

  select * into v_customer
  from public.customers
  where id = p_customer
    and company_id = v_order.company_id
    and deleted_at is null;

  if v_customer.id is null then raise exception 'STORE_ACCOUNT_CUSTOMER_INVALID'; end if;

  update public.orders
  set customer_id = v_customer.id,
      customer_name = v_customer.name,
      customer_phone = nullif(v_customer.phone, ''),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  update public.coupon_usages
  set customer_id = v_customer.id
  where order_id = v_order.id
    and company_id = v_order.company_id;

  return v_order;
end;
$function$;

revoke all on function public.link_public_store_order_customer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_public_store_order_customer(uuid, uuid) to service_role;

-- Harden public store order claiming against concurrent ownership overwrite.
-- The route still determines claim eligibility; this function is the atomic write boundary.

create or replace function public.link_public_store_order_customer(
  p_order uuid,
  p_customer uuid
)
returns public.orders
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_order public.orders;
  v_customer public.customers;
begin
  select *
    into v_order
    from public.orders
   where id = p_order
     and source = 'store'
     and deleted_at is null
   for update;

  if v_order.id is null then
    raise exception 'STORE_ACCOUNT_ORDER_NOT_FOUND';
  end if;

  select *
    into v_customer
    from public.customers
   where id = p_customer
     and company_id = v_order.company_id
     and deleted_at is null;

  if v_customer.id is null then
    raise exception 'STORE_ACCOUNT_CUSTOMER_INVALID';
  end if;

  if v_order.customer_id is not null then
    if v_order.customer_id = v_customer.id then
      return v_order;
    end if;
    raise exception 'STORE_ACCOUNT_ORDER_ALREADY_LINKED';
  end if;

  update public.orders
     set customer_id = v_customer.id,
         customer_name = v_customer.name,
         customer_phone = nullif(v_customer.phone, ''),
         updated_at = now()
   where id = v_order.id
     and customer_id is null
   returning * into v_order;

  if v_order.id is null then
    raise exception 'STORE_ACCOUNT_ORDER_ALREADY_LINKED';
  end if;

  update public.coupon_usages
     set customer_id = v_customer.id
   where order_id = v_order.id
     and company_id = v_order.company_id
     and (customer_id is null or customer_id = v_customer.id);

  return v_order;
end
$function$;

revoke all on function public.link_public_store_order_customer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_public_store_order_customer(uuid, uuid) to postgres, service_role;

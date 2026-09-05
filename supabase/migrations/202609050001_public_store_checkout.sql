begin;
set local check_function_bodies = off;

-- Checkout da loja pública.
-- Executado apenas pelo backend com service_role. O navegador nunca recebe a chave service role.
-- Preços, disponibilidade, taxa de entrega e cupom são recalculados no banco.
create or replace function public.public_store_checkout(
  p_slug text,
  p_submission_id text,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment public.fulfillment_type,
  p_delivery_address jsonb,
  p_payment_method public.payment_method,
  p_coupon_code text,
  p_items jsonb
) returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company public.companies;
  v_existing public.orders;
  v_order public.orders;
  v_order_id uuid;
  v_number bigint;
  v_item jsonb;
  v_product public.products;
  v_coupon public.coupons;
  v_qty integer;
  v_unit integer;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_delivery_fee integer := 0;
  v_total integer := 0;
  v_key text;
  v_accept_closed boolean := false;
  v_name text;
  v_phone text;
begin
  if p_slug is null or length(trim(p_slug)) = 0 then
    raise exception 'PUBLIC_STORE_NOT_FOUND';
  end if;
  if p_submission_id is null or length(trim(p_submission_id)) < 8 or length(p_submission_id) > 128 then
    raise exception 'PUBLIC_STORE_INVALID_SUBMISSION';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'PUBLIC_STORE_EMPTY_CART';
  end if;

  select * into v_company
  from public.companies
  where slug = trim(p_slug)
    and public_store_enabled = true
    and deleted_at is null
  for update;

  if v_company.id is null then
    raise exception 'PUBLIC_STORE_NOT_FOUND';
  end if;

  v_accept_closed := coalesce((v_company.public_profile ->> 'accept_orders_when_closed')::boolean, false);
  if not v_company.public_store_open and not v_accept_closed then
    raise exception 'PUBLIC_STORE_CLOSED';
  end if;

  if p_fulfillment = 'delivery' and (
    p_delivery_address is null
    or coalesce(trim(p_delivery_address ->> 'street'), '') = ''
    or coalesce(trim(p_delivery_address ->> 'number'), '') = ''
  ) then
    raise exception 'PUBLIC_STORE_ADDRESS';
  end if;

  v_key := 'store:' || trim(p_submission_id);
  select * into v_existing
  from public.orders
  where company_id = v_company.id and idempotency_key = v_key;
  if v_existing.id is not null then
    return v_existing;
  end if;

  v_name := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone := nullif(trim(coalesce(p_customer_phone, '')), '');

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'PUBLIC_STORE_INVALID_ITEM';
    end if;

    begin
      v_qty := (v_item ->> 'quantity')::integer;
    exception when others then
      raise exception 'PUBLIC_STORE_INVALID_ITEM';
    end;
    if v_qty is null or v_qty <= 0 or v_qty > 99 then
      raise exception 'PUBLIC_STORE_INVALID_ITEM';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and company_id = v_company.id
      and is_public = true
      and deleted_at is null
    for update;

    if v_product.id is null or v_product.status <> 'available' then
      raise exception 'PUBLIC_STORE_PRODUCT_UNAVAILABLE';
    end if;
    if v_product.track_stock and v_qty > v_product.current_stock then
      raise exception 'PUBLIC_STORE_STOCK';
    end if;

    v_unit := coalesce(v_product.promotional_price_cents, v_product.price_cents);
    v_subtotal := v_subtotal + (v_unit * v_qty);
  end loop;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon
    from public.coupons
    where company_id = v_company.id
      and upper(code) = upper(trim(p_coupon_code))
      and status = 'active'
      and deleted_at is null
      and now() between starts_at and expires_at
    for update;

    if v_coupon.id is null
      or v_subtotal < v_coupon.minimum_order_cents
      or (v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit)
    then
      raise exception 'PUBLIC_STORE_COUPON';
    end if;

    v_discount := least(
      v_subtotal,
      case
        when v_coupon.type = 'percentage' then round(v_subtotal * v_coupon.value / 100.0)::integer
        else v_coupon.value
      end
    );
  end if;

  if p_fulfillment = 'delivery' then
    begin
      v_delivery_fee := greatest(coalesce((v_company.public_profile ->> 'delivery_fee_cents')::integer, 0), 0);
    exception when others then
      v_delivery_fee := 0;
    end;
  end if;

  v_total := v_subtotal - v_discount + v_delivery_fee;
  select coalesce(max(number), 0) + 1 into v_number
  from public.orders
  where company_id = v_company.id;

  insert into public.orders(
    company_id, number, customer_id, customer_name, customer_phone,
    fulfillment, delivery_address, subtotal_cents, discount_cents,
    delivery_fee_cents, total_cents, payment_method, payment_status,
    status, source, idempotency_key
  ) values (
    v_company.id, v_number, null, coalesce(v_name, 'Consumidor não identificado'), v_phone,
    p_fulfillment, case when p_fulfillment = 'delivery' then p_delivery_address else null end,
    v_subtotal, v_discount, v_delivery_fee, v_total, p_payment_method, 'pending',
    'new', 'store', v_key
  ) returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid and company_id = v_company.id;
    v_qty := (v_item ->> 'quantity')::integer;
    v_unit := coalesce(v_product.promotional_price_cents, v_product.price_cents);

    insert into public.order_items(
      company_id, order_id, product_id, product_name, unit_price_cents,
      quantity, additions, note, total_cents
    ) values (
      v_company.id, v_order_id, v_product.id, v_product.name, v_unit,
      v_qty,
      case when jsonb_typeof(v_item -> 'additions') = 'array' then v_item -> 'additions' else '[]'::jsonb end,
      nullif(left(trim(coalesce(v_item ->> 'note', '')), 500), ''),
      v_unit * v_qty
    );
  end loop;

  if v_coupon.id is not null then
    insert into public.coupon_usages(company_id, coupon_id, order_id, customer_id, discount_cents)
    values(v_company.id, v_coupon.id, v_order_id, null, v_discount);
    update public.coupons set usage_count = usage_count + 1 where id = v_coupon.id;
  end if;

  insert into public.payments(
    company_id, order_id, amount_cents, method, status, notes, idempotency_key
  ) values (
    v_company.id, v_order_id, v_total, p_payment_method, 'pending',
    'Checkout da loja pública', v_key || ':payment'
  );

  select * into v_order from public.orders where id = v_order_id;
  return v_order;
end;
$$;

revoke all on function public.public_store_checkout(text,text,text,text,public.fulfillment_type,jsonb,public.payment_method,text,jsonb) from public;
revoke all on function public.public_store_checkout(text,text,text,text,public.fulfillment_type,jsonb,public.payment_method,text,jsonb) from anon;
revoke all on function public.public_store_checkout(text,text,text,text,public.fulfillment_type,jsonb,public.payment_method,text,jsonb) from authenticated;
grant execute on function public.public_store_checkout(text,text,text,text,public.fulfillment_type,jsonb,public.payment_method,text,jsonb) to service_role;

commit;

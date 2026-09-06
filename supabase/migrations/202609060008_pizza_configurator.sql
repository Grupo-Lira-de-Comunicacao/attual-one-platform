-- Pizza configurator for storefronts.
-- Supports whole or half-and-half pizzas while keeping authoritative pricing on the server.

alter table public.order_items
  add column if not exists configuration jsonb not null default '{}'::jsonb;

comment on column public.order_items.configuration is
  'Structured storefront item configuration, such as whole/half pizza selections.';

update public.companies
set public_profile = jsonb_set(
      jsonb_set(coalesce(public_profile, '{}'::jsonb), '{pizza_configurator_enabled}', 'true'::jsonb, true),
      '{pizza_half_price_rule}',
      '"highest"'::jsonb,
      true
    ),
    updated_at = now()
where slug = 'padaria-conquista'
  and deleted_at is null;

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
set search_path = 'public'
as $function$
declare
  v_company public.companies;
  v_existing public.orders;
  v_order public.orders;
  v_order_id uuid;
  v_number bigint;
  v_item jsonb;
  v_configuration jsonb;
  v_product public.products;
  v_second_product public.products;
  v_coupon public.coupons;
  v_qty integer;
  v_unit integer;
  v_second_unit integer;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_delivery_fee integer := 0;
  v_total integer := 0;
  v_key text;
  v_accept_closed boolean := false;
  v_name text;
  v_phone text;
  v_district text;
  v_size text;
  v_second_size text;
  v_flavor text;
  v_second_flavor text;
  v_product_name text;
  v_item_configuration jsonb;
  v_is_pizza boolean;
begin
  if p_slug is null or length(trim(p_slug)) = 0 then raise exception 'PUBLIC_STORE_NOT_FOUND'; end if;
  if p_submission_id is null or length(trim(p_submission_id)) < 8 or length(p_submission_id) > 128 then raise exception 'PUBLIC_STORE_INVALID_SUBMISSION'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'PUBLIC_STORE_EMPTY_CART'; end if;

  select * into v_company
  from public.companies
  where slug = trim(p_slug)
    and public_store_enabled = true
    and deleted_at is null
  for update;

  if v_company.id is null then raise exception 'PUBLIC_STORE_NOT_FOUND'; end if;

  v_accept_closed := coalesce((v_company.public_profile ->> 'accept_orders_when_closed')::boolean, false);
  if not v_company.public_store_open and not v_accept_closed then raise exception 'PUBLIC_STORE_CLOSED'; end if;

  if p_fulfillment = 'delivery' and (
    p_delivery_address is null
    or coalesce(trim(p_delivery_address ->> 'street'), '') = ''
    or coalesce(trim(p_delivery_address ->> 'number'), '') = ''
    or coalesce(trim(p_delivery_address ->> 'district'), '') = ''
  ) then raise exception 'PUBLIC_STORE_ADDRESS'; end if;

  v_key := 'store:' || trim(p_submission_id);
  select * into v_existing
  from public.orders
  where company_id = v_company.id and idempotency_key = v_key;
  if v_existing.id is not null then return v_existing; end if;

  v_name := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone := nullif(trim(coalesce(p_customer_phone, '')), '');

  -- Validate and calculate authoritative subtotal.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'PUBLIC_STORE_INVALID_ITEM';
    end if;

    begin v_qty := (v_item ->> 'quantity')::integer;
    exception when others then raise exception 'PUBLIC_STORE_INVALID_ITEM'; end;
    if v_qty is null or v_qty <= 0 or v_qty > 99 then raise exception 'PUBLIC_STORE_INVALID_ITEM'; end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and company_id = v_company.id
      and is_public = true
      and deleted_at is null
    for update;

    if v_product.id is null or v_product.status <> 'available' then raise exception 'PUBLIC_STORE_PRODUCT_UNAVAILABLE'; end if;
    if v_product.track_stock and v_qty > v_product.current_stock then raise exception 'PUBLIC_STORE_STOCK'; end if;

    v_unit := coalesce(v_product.promotional_price_cents, v_product.price_cents);
    if v_company.slug = 'padaria-conquista' and v_product.sku = any(array['PC-PIZ-MODA-DA-CASA-G','PC-PIZ-CALABRESA-G','PC-PIZ-BAURU-G','PC-PIZ-LOMBO-G']) then
      if extract(isodow from (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo')))::int between 1 and 4
         and (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo'))::date not in (
           date '2026-01-01', date '2026-04-03', date '2026-04-14', date '2026-04-21', date '2026-05-01', date '2026-06-04', date '2026-06-24', date '2026-07-09', date '2026-09-07', date '2026-10-12', date '2026-11-02', date '2026-11-15', date '2026-11-20', date '2026-12-25'
         ) then v_unit := 2990; end if;
    end if;

    v_configuration := case when jsonb_typeof(v_item -> 'configuration') = 'object' then v_item -> 'configuration' else '{}'::jsonb end;

    if coalesce(v_configuration ->> 'kind', '') = 'pizza' then
      if coalesce(v_configuration ->> 'mode', '') not in ('whole','half') then raise exception 'PUBLIC_STORE_INVALID_PIZZA'; end if;

      select exists(
        select 1 from public.categories c
        where c.id = v_product.category_id
          and c.company_id = v_company.id
          and lower(c.name) like '%pizza%'
          and c.status = 'active'
          and c.deleted_at is null
      ) into v_is_pizza;
      if not v_is_pizza then raise exception 'PUBLIC_STORE_INVALID_PIZZA'; end if;

      v_size := case
        when coalesce(v_product.sku,'') ~ '-G$' then 'Grande'
        when coalesce(v_product.sku,'') ~ '-M$' then 'Média'
        when v_product.name ~* ' - Grande$' then 'Grande'
        when v_product.name ~* ' - M[eé]dia$' then 'Média'
        else null
      end;
      if v_size is null or lower(v_size) <> lower(trim(coalesce(v_configuration ->> 'size',''))) then raise exception 'PUBLIC_STORE_INVALID_PIZZA'; end if;

      if v_configuration ->> 'mode' = 'whole' then
        if coalesce(v_configuration ->> 'second_product_id','') <> '' then raise exception 'PUBLIC_STORE_INVALID_PIZZA'; end if;
      else
        if coalesce(v_configuration ->> 'second_product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'PUBLIC_STORE_INVALID_PIZZA'; end if;
        if (v_configuration ->> 'second_product_id')::uuid = v_product.id then raise exception 'PUBLIC_STORE_INVALID_PIZZA'; end if;

        select * into v_second_product
        from public.products
        where id = (v_configuration ->> 'second_product_id')::uuid
          and company_id = v_company.id
          and category_id = v_product.category_id
          and is_public = true
          and deleted_at is null
        for update;

        if v_second_product.id is null or v_second_product.status <> 'available' then raise exception 'PUBLIC_STORE_PRODUCT_UNAVAILABLE'; end if;
        if v_second_product.track_stock and v_qty > v_second_product.current_stock then raise exception 'PUBLIC_STORE_STOCK'; end if;

        v_second_size := case
          when coalesce(v_second_product.sku,'') ~ '-G$' then 'Grande'
          when coalesce(v_second_product.sku,'') ~ '-M$' then 'Média'
          when v_second_product.name ~* ' - Grande$' then 'Grande'
          when v_second_product.name ~* ' - M[eé]dia$' then 'Média'
          else null
        end;
        if v_second_size is null or lower(v_second_size) <> lower(v_size) then raise exception 'PUBLIC_STORE_INVALID_PIZZA'; end if;

        v_second_unit := coalesce(v_second_product.promotional_price_cents, v_second_product.price_cents);
        if v_company.slug = 'padaria-conquista' and v_second_product.sku = any(array['PC-PIZ-MODA-DA-CASA-G','PC-PIZ-CALABRESA-G','PC-PIZ-BAURU-G','PC-PIZ-LOMBO-G']) then
          if extract(isodow from (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo')))::int between 1 and 4
             and (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo'))::date not in (
               date '2026-01-01', date '2026-04-03', date '2026-04-14', date '2026-04-21', date '2026-05-01', date '2026-06-04', date '2026-06-24', date '2026-07-09', date '2026-09-07', date '2026-10-12', date '2026-11-02', date '2026-11-15', date '2026-11-20', date '2026-12-25'
             ) then v_second_unit := 2990; end if;
        end if;

        -- Commercial rule: half-and-half is charged by the higher-priced flavor.
        v_unit := greatest(v_unit, v_second_unit);
      end if;
    elsif v_configuration <> '{}'::jsonb then
      raise exception 'PUBLIC_STORE_INVALID_ITEM';
    end if;

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
    then raise exception 'PUBLIC_STORE_COUPON'; end if;

    v_discount := least(v_subtotal, case when v_coupon.type = 'percentage' then round(v_subtotal * v_coupon.value / 100.0)::integer else v_coupon.value end);
  end if;

  if p_fulfillment = 'delivery' then
    v_district := trim(p_delivery_address ->> 'district');
    select dz.fee_cents into v_delivery_fee
    from public.delivery_zones dz
    where dz.company_id = v_company.id and dz.active = true and lower(dz.name) = lower(v_district)
    limit 1;

    if v_delivery_fee is null then
      select dz.fee_cents into v_delivery_fee
      from public.delivery_zones dz
      where dz.company_id = v_company.id and dz.active = true and dz.is_default = true
      limit 1;
    end if;

    if v_delivery_fee is null then
      begin v_delivery_fee := greatest(coalesce((v_company.public_profile ->> 'delivery_fee_cents')::integer, 0), 0);
      exception when others then v_delivery_fee := 0; end;
    end if;
  end if;

  v_total := v_subtotal - v_discount + v_delivery_fee;
  select coalesce(max(number), 0) + 1 into v_number from public.orders where company_id = v_company.id;

  insert into public.orders(company_id, number, customer_id, customer_name, customer_phone, fulfillment, delivery_address, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method, payment_status, status, source, idempotency_key)
  values(v_company.id, v_number, null, coalesce(v_name, 'Consumidor não identificado'), v_phone, p_fulfillment, case when p_fulfillment = 'delivery' then p_delivery_address else null end, v_subtotal, v_discount, v_delivery_fee, v_total, p_payment_method, 'pending', 'new', 'store', v_key)
  returning id into v_order_id;

  -- Persist order items using the same authoritative calculation and a readable kitchen label.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::uuid and company_id = v_company.id;
    v_qty := (v_item ->> 'quantity')::integer;
    v_unit := coalesce(v_product.promotional_price_cents, v_product.price_cents);
    if v_company.slug = 'padaria-conquista' and v_product.sku = any(array['PC-PIZ-MODA-DA-CASA-G','PC-PIZ-CALABRESA-G','PC-PIZ-BAURU-G','PC-PIZ-LOMBO-G']) then
      if extract(isodow from (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo')))::int between 1 and 4
         and (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo'))::date not in (
           date '2026-01-01', date '2026-04-03', date '2026-04-14', date '2026-04-21', date '2026-05-01', date '2026-06-04', date '2026-06-24', date '2026-07-09', date '2026-09-07', date '2026-10-12', date '2026-11-02', date '2026-11-15', date '2026-11-20', date '2026-12-25'
         ) then v_unit := 2990; end if;
    end if;

    v_configuration := case when jsonb_typeof(v_item -> 'configuration') = 'object' then v_item -> 'configuration' else '{}'::jsonb end;
    v_product_name := v_product.name;
    v_item_configuration := '{}'::jsonb;

    if coalesce(v_configuration ->> 'kind', '') = 'pizza' then
      v_size := case
        when coalesce(v_product.sku,'') ~ '-G$' then 'Grande'
        when coalesce(v_product.sku,'') ~ '-M$' then 'Média'
        when v_product.name ~* ' - Grande$' then 'Grande'
        when v_product.name ~* ' - M[eé]dia$' then 'Média'
        else trim(v_configuration ->> 'size')
      end;
      v_flavor := regexp_replace(v_product.name, '\s+-\s+(Grande|M[eé]dia)$', '', 'i');

      if v_configuration ->> 'mode' = 'half' then
        select * into v_second_product from public.products where id = (v_configuration ->> 'second_product_id')::uuid and company_id = v_company.id;
        v_second_unit := coalesce(v_second_product.promotional_price_cents, v_second_product.price_cents);
        if v_company.slug = 'padaria-conquista' and v_second_product.sku = any(array['PC-PIZ-MODA-DA-CASA-G','PC-PIZ-CALABRESA-G','PC-PIZ-BAURU-G','PC-PIZ-LOMBO-G']) then
          if extract(isodow from (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo')))::int between 1 and 4
             and (now() at time zone coalesce(v_company.timezone,'America/Sao_Paulo'))::date not in (
               date '2026-01-01', date '2026-04-03', date '2026-04-14', date '2026-04-21', date '2026-05-01', date '2026-06-04', date '2026-06-24', date '2026-07-09', date '2026-09-07', date '2026-10-12', date '2026-11-02', date '2026-11-15', date '2026-11-20', date '2026-12-25'
             ) then v_second_unit := 2990; end if;
        end if;
        v_unit := greatest(v_unit, v_second_unit);
        v_second_flavor := regexp_replace(v_second_product.name, '\s+-\s+(Grande|M[eé]dia)$', '', 'i');
        v_product_name := '½ ' || v_flavor || ' + ½ ' || v_second_flavor || ' — ' || v_size;
        v_item_configuration := jsonb_build_object(
          'kind','pizza', 'mode','half', 'size',v_size,
          'first_product_id',v_product.id, 'second_product_id',v_second_product.id,
          'first_flavor',v_flavor, 'second_flavor',v_second_flavor,
          'price_rule','highest'
        );
      else
        v_product_name := 'Pizza ' || v_size || ' — ' || v_flavor;
        v_item_configuration := jsonb_build_object(
          'kind','pizza', 'mode','whole', 'size',v_size,
          'first_product_id',v_product.id, 'first_flavor',v_flavor
        );
      end if;
    end if;

    insert into public.order_items(company_id, order_id, product_id, product_name, unit_price_cents, quantity, additions, note, total_cents, configuration)
    values(
      v_company.id,
      v_order_id,
      v_product.id,
      v_product_name,
      v_unit,
      v_qty,
      case when jsonb_typeof(v_item -> 'additions') = 'array' then v_item -> 'additions' else '[]'::jsonb end,
      nullif(left(trim(coalesce(v_item ->> 'note', '')), 500), ''),
      v_unit * v_qty,
      v_item_configuration
    );
  end loop;

  if v_coupon.id is not null then
    insert into public.coupon_usages(company_id, coupon_id, order_id, customer_id, discount_cents)
    values(v_company.id, v_coupon.id, v_order_id, null, v_discount);
    update public.coupons set usage_count = usage_count + 1 where id = v_coupon.id;
  end if;

  insert into public.payments(company_id, order_id, amount_cents, method, status, notes, idempotency_key)
  values(v_company.id, v_order_id, v_total, p_payment_method, 'pending', 'Checkout da loja pública', v_key || ':payment');

  select * into v_order from public.orders where id = v_order_id;
  return v_order;
end;
$function$;

revoke all on function public.public_store_checkout(text,text,text,text,public.fulfillment_type,jsonb,public.payment_method,text,jsonb) from public;
grant execute on function public.public_store_checkout(text,text,text,text,public.fulfillment_type,jsonb,public.payment_method,text,jsonb) to service_role;

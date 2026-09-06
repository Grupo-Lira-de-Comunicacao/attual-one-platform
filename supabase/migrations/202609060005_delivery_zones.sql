-- Delivery zones per company, public storefront fees, and authoritative checkout pricing.

create table if not exists public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  fee_cents integer not null check (fee_cents >= 0),
  distance_band text,
  display_order integer not null default 0,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

create unique index if not exists delivery_zones_one_default_per_company_idx
  on public.delivery_zones(company_id)
  where is_default = true and active = true;

create index if not exists delivery_zones_company_active_order_idx
  on public.delivery_zones(company_id, active, display_order);

alter table public.delivery_zones enable row level security;

revoke all on public.delivery_zones from public;
grant select on public.delivery_zones to anon, authenticated;
grant insert, update, delete on public.delivery_zones to authenticated;

create policy delivery_zones_public_read
  on public.delivery_zones for select
  to anon, authenticated
  using (
    active = true
    and exists (
      select 1 from public.companies c
      where c.id = delivery_zones.company_id
        and c.public_store_enabled = true
        and c.deleted_at is null
    )
  );

create policy delivery_zones_company_manage
  on public.delivery_zones for all
  to authenticated
  using (
    exists (
      select 1 from public.company_users cu
      where cu.company_id = delivery_zones.company_id
        and cu.user_id = (select auth.uid())
        and cu.status = 'active'
        and cu.role in ('owner','manager')
    )
  )
  with check (
    exists (
      select 1 from public.company_users cu
      where cu.company_id = delivery_zones.company_id
        and cu.user_id = (select auth.uid())
        and cu.status = 'active'
        and cu.role in ('owner','manager')
    )
  );

-- Seed Padaria Conquista from the researched Caçapava market reference.
with target as (
  select id from public.companies where slug = 'padaria-conquista' and deleted_at is null
), seed(name, fee_cents, distance_band, display_order, is_default) as (
  values
    ('Centro', 500, 'até ~2 km', 10, false),
    ('Jardim São José', 500, 'até ~2 km', 20, false),
    ('Jardim Campo Grande', 500, 'até ~2 km', 30, false),
    ('Jardim Julieta', 500, 'até ~2 km', 40, false),
    ('Jardim América', 600, '~2 a 4 km', 50, false),
    ('Jardim Caçapava', 600, '~2 a 4 km', 60, false),
    ('Jardim Maria Cândida', 600, '~2 a 4 km', 70, false),
    ('Jardim Rafael', 600, '~2 a 4 km', 80, false),
    ('Jardim Amália', 600, '~2 a 4 km', 90, false),
    ('Jardim Jequitibá', 600, '~2 a 4 km', 100, false),
    ('Jardim Primavera', 600, '~2 a 4 km', 110, false),
    ('Jardim Panorama', 600, '~2 a 4 km', 120, false),
    ('Borda da Mata', 600, '~2 a 4 km', 130, false),
    ('Parque Residencial Alvorada', 600, '~2 a 4 km', 140, false),
    ('Portal da Mata', 700, '~2 a 4 km', 150, false),
    ('Loteamento Real Park', 700, '~2 a 4 km', 160, false),
    ('Pinus de Iriguassu', 800, '~4 a 6 km', 170, false),
    ('Condomínio Bela Vista', 800, '~4 a 6 km', 180, false),
    ('Paineiras', 900, '~4 a 6 km', 190, false),
    ('Sapé 1', 1100, '~6 a 8 km', 200, false),
    ('Outros bairros', 1300, 'acima de ~8 km / não cadastrado', 999, true)
)
insert into public.delivery_zones(company_id, name, fee_cents, distance_band, display_order, is_default)
select target.id, seed.name, seed.fee_cents, seed.distance_band, seed.display_order, seed.is_default
from target cross join seed
on conflict (company_id, name) do update set
  fee_cents = excluded.fee_cents,
  distance_band = excluded.distance_band,
  display_order = excluded.display_order,
  is_default = excluded.is_default,
  active = true,
  updated_at = now();

-- Keep the legacy flat fee aligned with the default fallback for compatibility.
update public.companies
set public_profile = jsonb_set(coalesce(public_profile, '{}'::jsonb), '{delivery_fee_cents}', '1300'::jsonb, true),
    updated_at = now()
where slug = 'padaria-conquista' and deleted_at is null;

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
  v_product public.products;
  v_coupon public.coupons;
  v_qty integer;
  v_unit integer;
  v_subtotal integer := 0;
  v_discount integer := 0;
  v_delivery_fee integer := 0;
  v_key text;
  v_accept_closed boolean := false;
  v_name text;
  v_phone text;
  v_district text;
begin
  if p_slug is null or length(trim(p_slug)) = 0 then raise exception 'PUBLIC_STORE_NOT_FOUND'; end if;
  if p_submission_id is null or length(trim(p_submission_id)) < 8 or length(p_submission_id) > 128 then raise exception 'PUBLIC_STORE_INVALID_SUBMISSION'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then raise exception 'PUBLIC_STORE_EMPTY_CART'; end if;

  select * into v_company from public.companies
  where slug = trim(p_slug) and public_store_enabled = true and deleted_at is null
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
  select * into v_existing from public.orders where company_id = v_company.id and idempotency_key = v_key;
  if v_existing.id is not null then return v_existing; end if;

  v_name := nullif(trim(coalesce(p_customer_name, '')), '');
  v_phone := nullif(trim(coalesce(p_customer_phone, '')), '');

  for v_item in select * from jsonb_array_elements(p_items) loop
    if coalesce(v_item ->> 'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'PUBLIC_STORE_INVALID_ITEM'; end if;
    begin v_qty := (v_item ->> 'quantity')::integer; exception when others then raise exception 'PUBLIC_STORE_INVALID_ITEM'; end;
    if v_qty is null or v_qty <= 0 or v_qty > 99 then raise exception 'PUBLIC_STORE_INVALID_ITEM'; end if;

    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and company_id = v_company.id and is_public = true and deleted_at is null
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
    v_subtotal := v_subtotal + (v_unit * v_qty);
  end loop;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from public.coupons
    where company_id = v_company.id and upper(code) = upper(trim(p_coupon_code)) and status = 'active' and deleted_at is null and now() between starts_at and expires_at
    for update;
    if v_coupon.id is null or v_subtotal < v_coupon.minimum_order_cents or (v_coupon.usage_limit is not null and v_coupon.usage_count >= v_coupon.usage_limit) then raise exception 'PUBLIC_STORE_COUPON'; end if;
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

    insert into public.order_items(company_id, order_id, product_id, product_name, unit_price_cents, quantity, additions, note, total_cents)
    values(v_company.id, v_order_id, v_product.id, v_product.name, v_unit, v_qty, case when jsonb_typeof(v_item -> 'additions') = 'array' then v_item -> 'additions' else '[]'::jsonb end, nullif(left(trim(coalesce(v_item ->> 'note', '')), 500), ''), v_unit * v_qty);
  end loop;

  if v_coupon.id is not null then
    insert into public.coupon_usages(company_id, coupon_id, order_id, customer_id, discount_cents) values(v_company.id, v_coupon.id, v_order_id, null, v_discount);
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

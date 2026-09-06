-- Age-restricted products and handoff verification.
-- The storefront stays open to minors for normal products; only age-restricted
-- items require an adult recipient and document verification at handoff.

alter table public.products
  add column if not exists age_restricted_min smallint
  check (age_restricted_min is null or (age_restricted_min >= 0 and age_restricted_min <= 130));

comment on column public.products.age_restricted_min is
  'Minimum age required to receive this product. NULL means no age restriction.';

alter table public.orders
  add column if not exists contains_age_restricted_product boolean not null default false,
  add column if not exists age_handoff_status text not null default 'not_required',
  add column if not exists age_handoff_verified_at timestamptz;

alter table public.orders
  drop constraint if exists orders_age_handoff_status_check;
alter table public.orders
  add constraint orders_age_handoff_status_check
  check (age_handoff_status in ('not_required','document_required','verified'));

-- Seed the currently known alcoholic assortment for Padaria Conquista.
update public.products p
set age_restricted_min = 18,
    updated_at = now()
from public.categories c, public.companies co
where p.category_id = c.id
  and p.company_id = co.id
  and c.company_id = co.id
  and co.slug = 'padaria-conquista'
  and c.name = 'Cervejas'
  and p.deleted_at is null
  and c.deleted_at is null
  and co.deleted_at is null;

create or replace function public.refresh_order_age_restriction()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_order_id uuid;
  v_contains boolean;
begin
  v_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;

  select exists(
    select 1
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = v_order_id
      and coalesce(p.age_restricted_min, 0) >= 18
  ) into v_contains;

  update public.orders
  set contains_age_restricted_product = v_contains,
      age_handoff_status = case
        when not v_contains then 'not_required'
        when age_handoff_status = 'verified' then 'verified'
        else 'document_required'
      end,
      age_handoff_verified_at = case
        when not v_contains then null
        else age_handoff_verified_at
      end,
      updated_at = now()
  where id = v_order_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function public.refresh_order_age_restriction() from public, anon, authenticated;

drop trigger if exists trg_refresh_order_age_restriction on public.order_items;
create trigger trg_refresh_order_age_restriction
after insert or update of product_id, order_id or delete
on public.order_items
for each row execute function public.refresh_order_age_restriction();

-- Recalculate existing orders after the product classification is seeded.
update public.orders o
set contains_age_restricted_product = exists(
      select 1
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = o.id
        and coalesce(p.age_restricted_min, 0) >= 18
    ),
    age_handoff_status = case
      when exists(
        select 1
        from public.order_items oi
        join public.products p on p.id = oi.product_id
        where oi.order_id = o.id
          and coalesce(p.age_restricted_min, 0) >= 18
      ) then 'document_required'
      else 'not_required'
    end,
    age_handoff_verified_at = null;

create or replace function public.guard_age_restricted_order_completion()
returns trigger
language plpgsql
set search_path = 'public'
as $function$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.contains_age_restricted_product
     and new.age_handoff_status <> 'verified'
  then
    raise exception 'AGE_HANDOFF_VERIFICATION_REQUIRED';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_age_restricted_order_completion() from public, anon, authenticated;

drop trigger if exists trg_guard_age_restricted_order_completion on public.orders;
create trigger trg_guard_age_restricted_order_completion
before update of status on public.orders
for each row execute function public.guard_age_restricted_order_completion();

create or replace function public.verify_order_age_handoff(p_order uuid)
returns public.orders
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_order public.orders;
begin
  select * into v_order
  from public.orders
  where id = p_order and deleted_at is null
  for update;

  if v_order.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.company_users cu
    where cu.company_id = v_order.company_id
      and cu.user_id = auth.uid()
      and cu.status = 'active'
  ) then
    raise exception 'ORDER_FORBIDDEN';
  end if;

  if not v_order.contains_age_restricted_product then
    raise exception 'AGE_HANDOFF_NOT_REQUIRED';
  end if;

  update public.orders
  set age_handoff_status = 'verified',
      age_handoff_verified_at = now(),
      updated_at = now()
  where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$function$;

revoke all on function public.verify_order_age_handoff(uuid) from public, anon;
grant execute on function public.verify_order_age_handoff(uuid) to authenticated;

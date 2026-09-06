begin;
set local check_function_bodies = off;

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','assigned','ready','out_for_delivery','delivered','cancelled')),
  driver_name text,
  driver_phone text,
  public_tracking_token uuid not null unique default gen_random_uuid(),
  driver_access_token uuid not null unique default gen_random_uuid(),
  current_lat double precision,
  current_lng double precision,
  accuracy_m double precision,
  last_location_at timestamptz,
  assigned_at timestamptz,
  started_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_coordinates_valid check (
    (current_lat is null and current_lng is null)
    or (current_lat between -90 and 90 and current_lng between -180 and 180)
  )
);

create index if not exists deliveries_company_status_idx on public.deliveries(company_id,status,updated_at desc);
create index if not exists deliveries_tracking_token_idx on public.deliveries(public_tracking_token);
create index if not exists deliveries_driver_token_idx on public.deliveries(driver_access_token);

alter table public.deliveries enable row level security;

revoke all on table public.deliveries from public, anon;
grant select, update on table public.deliveries to authenticated;

create policy deliveries_management_read
on public.deliveries for select to authenticated
using (public.has_company_role(company_id, array['owner','manager','attendant']::public.company_role[]));

create policy deliveries_management_update
on public.deliveries for update to authenticated
using (public.has_company_role(company_id, array['owner','manager','attendant']::public.company_role[]))
with check (public.has_company_role(company_id, array['owner','manager','attendant']::public.company_role[]));

create or replace function private.bootstrap_delivery()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.fulfillment = 'delivery' then
    insert into public.deliveries(company_id,order_id,status)
    values (
      new.company_id,
      new.id,
      case new.status
        when 'ready' then 'ready'
        when 'out_for_delivery' then 'out_for_delivery'
        when 'completed' then 'delivered'
        when 'cancelled' then 'cancelled'
        else 'pending'
      end
    )
    on conflict(order_id) do nothing;
  end if;
  return new;
end $$;

revoke all on function private.bootstrap_delivery() from public,anon,authenticated;

create or replace function private.sync_delivery_from_order()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  if new.fulfillment <> 'delivery' then return new; end if;
  if new.status is not distinct from old.status then return new; end if;

  update public.deliveries
  set status = case new.status
      when 'ready' then case when status='assigned' then 'assigned' else 'ready' end
      when 'out_for_delivery' then 'out_for_delivery'
      when 'completed' then 'delivered'
      when 'cancelled' then 'cancelled'
      else status
    end,
    started_at = case when new.status='out_for_delivery' then coalesce(started_at,now()) else started_at end,
    delivered_at = case when new.status='completed' then coalesce(delivered_at,now()) else delivered_at end,
    updated_at = now()
  where order_id = new.id;
  return new;
end $$;

revoke all on function private.sync_delivery_from_order() from public,anon,authenticated;

drop trigger if exists orders_bootstrap_delivery on public.orders;
create trigger orders_bootstrap_delivery
after insert on public.orders
for each row execute function private.bootstrap_delivery();

drop trigger if exists orders_sync_delivery on public.orders;
create trigger orders_sync_delivery
after update of status on public.orders
for each row execute function private.sync_delivery_from_order();

insert into public.deliveries(company_id,order_id,status,created_at,updated_at)
select o.company_id,o.id,
  case o.status
    when 'ready' then 'ready'
    when 'out_for_delivery' then 'out_for_delivery'
    when 'completed' then 'delivered'
    when 'cancelled' then 'cancelled'
    else 'pending'
  end,
  o.created_at,o.updated_at
from public.orders o
where o.fulfillment='delivery'
on conflict(order_id) do nothing;

-- Never expose delivery tokens through the anonymous REST API.
do $$
begin
  if has_table_privilege('anon','public.deliveries','SELECT') then
    raise exception 'DELIVERY SECURITY FAILED: anon can read deliveries';
  end if;
end $$;

commit;

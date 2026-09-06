-- Padaria Conquista loyalty club: visible progress, exclusive welcome coupon,
-- and one-time reward coupons generated from earned loyalty rewards.

alter table public.loyalty_rules
  add column if not exists reward_value_cents integer not null default 0 check (reward_value_cents >= 0),
  add column if not exists reward_minimum_order_cents integer not null default 0 check (reward_minimum_order_cents >= 0),
  add column if not exists reward_valid_days integer not null default 30 check (reward_valid_days > 0);

create table if not exists public.store_customer_coupon_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  source text not null check (source in ('welcome','loyalty_reward')),
  redeemed_at timestamptz,
  redeemed_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(company_id, customer_id, coupon_id)
);

create unique index if not exists store_customer_coupon_one_welcome_idx
  on public.store_customer_coupon_entitlements(company_id, customer_id, source)
  where source = 'welcome';

create index if not exists store_customer_coupon_customer_idx
  on public.store_customer_coupon_entitlements(company_id, customer_id, redeemed_at, created_at desc);

alter table public.store_customer_coupon_entitlements enable row level security;
revoke all on public.store_customer_coupon_entitlements from public, anon, authenticated;
grant all on public.store_customer_coupon_entitlements to service_role;

-- Initial commercial rule for Padaria Conquista:
-- every 5 paid + completed orders unlocks a R$10 reward coupon.
with target as (
  select id from public.companies where slug = 'padaria-conquista' and deleted_at is null
)
update public.loyalty_rules
set status = 'inactive', updated_at = now()
where company_id in (select id from target)
  and name <> 'Clube Conquista'
  and status = 'active';

with target as (
  select id from public.companies where slug = 'padaria-conquista' and deleted_at is null
)
insert into public.loyalty_rules(
  company_id, name, mode, points_per_real, reward_threshold, reward_description,
  reward_value_cents, reward_minimum_order_cents, reward_valid_days, status
)
select
  id,
  'Clube Conquista',
  'buy_and_get',
  0,
  5,
  'R$ 10 de desconto no próximo pedido',
  1000,
  3000,
  30,
  'active'
from target
on conflict(company_id, name) do update set
  mode = excluded.mode,
  points_per_real = excluded.points_per_real,
  reward_threshold = excluded.reward_threshold,
  reward_description = excluded.reward_description,
  reward_value_cents = excluded.reward_value_cents,
  reward_minimum_order_cents = excluded.reward_minimum_order_cents,
  reward_valid_days = excluded.reward_valid_days,
  status = excluded.status,
  updated_at = now();

-- Service-role-only provisioning of a unique welcome coupon.
create or replace function public.provision_store_welcome_coupon(
  p_company uuid,
  p_customer uuid
) returns text
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_customer public.customers;
  v_existing text;
  v_coupon public.coupons;
  v_code text;
begin
  select * into v_customer
  from public.customers
  where id = p_customer and company_id = p_company and deleted_at is null;

  if v_customer.id is null then
    raise exception 'STORE_CUSTOMER_INVALID';
  end if;

  select c.code into v_existing
  from public.store_customer_coupon_entitlements e
  join public.coupons c on c.id = e.coupon_id
  where e.company_id = p_company
    and e.customer_id = p_customer
    and e.source = 'welcome'
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  v_code := 'BEMVINDO10-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.coupons(
    company_id, code, description, type, value, minimum_order_cents,
    usage_limit, usage_count, per_customer_limit, starts_at, expires_at, status
  ) values (
    p_company,
    v_code,
    '10% de desconto de boas-vindas para cliente com conta',
    'percentage',
    10,
    3000,
    1,
    0,
    1,
    now(),
    now() + interval '90 days',
    'active'
  ) returning * into v_coupon;

  insert into public.store_customer_coupon_entitlements(company_id, customer_id, coupon_id, source)
  values(p_company, p_customer, v_coupon.id, 'welcome');

  return v_coupon.code;
end;
$function$;

-- Turns one earned reward into a private, one-use fixed-value coupon.
create or replace function public.redeem_store_customer_reward(
  p_company uuid,
  p_customer uuid
) returns text
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_customer public.customers;
  v_rule public.loyalty_rules;
  v_account public.loyalty_accounts;
  v_coupon public.coupons;
  v_code text;
begin
  select * into v_customer
  from public.customers
  where id = p_customer and company_id = p_company and deleted_at is null;

  if v_customer.id is null then
    raise exception 'STORE_CUSTOMER_INVALID';
  end if;

  select * into v_rule
  from public.loyalty_rules
  where company_id = p_company and status = 'active'
  order by created_at
  limit 1;

  if v_rule.id is null or v_rule.mode <> 'buy_and_get' or coalesce(v_rule.reward_value_cents, 0) <= 0 then
    raise exception 'STORE_REWARD_RULE_UNAVAILABLE';
  end if;

  select * into v_account
  from public.loyalty_accounts
  where company_id = p_company and customer_id = p_customer
  for update;

  if v_account.id is null or v_account.rewards_available <= 0 then
    raise exception 'STORE_REWARD_UNAVAILABLE';
  end if;

  v_code := 'CONQUISTA10-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.coupons(
    company_id, code, description, type, value, minimum_order_cents,
    usage_limit, usage_count, per_customer_limit, starts_at, expires_at, status
  ) values (
    p_company,
    v_code,
    v_rule.reward_description,
    'fixed',
    v_rule.reward_value_cents,
    v_rule.reward_minimum_order_cents,
    1,
    0,
    1,
    now(),
    now() + make_interval(days => v_rule.reward_valid_days),
    'active'
  ) returning * into v_coupon;

  update public.loyalty_accounts
  set rewards_available = rewards_available - 1,
      updated_at = now()
  where id = v_account.id;

  insert into public.loyalty_transactions(
    company_id, account_id, order_id, type, points, purchases, rewards,
    reason, idempotency_key, created_by
  ) values (
    p_company,
    v_account.id,
    null,
    'reward',
    0,
    0,
    -1,
    'Resgate no Clube Conquista: ' || v_rule.reward_description,
    'store-reward:' || v_coupon.id::text,
    null
  );

  insert into public.store_customer_coupon_entitlements(company_id, customer_id, coupon_id, source)
  values(p_company, p_customer, v_coupon.id, 'loyalty_reward');

  return v_coupon.code;
end;
$function$;

create or replace function public.mark_store_customer_coupon_redeemed(
  p_company uuid,
  p_customer uuid,
  p_code text,
  p_order uuid
) returns boolean
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_coupon_id uuid;
  v_entitlement_id uuid;
begin
  select c.id into v_coupon_id
  from public.coupons c
  where c.company_id = p_company
    and upper(c.code) = upper(trim(p_code))
    and c.deleted_at is null
  limit 1;

  if v_coupon_id is null then
    return false;
  end if;

  select e.id into v_entitlement_id
  from public.store_customer_coupon_entitlements e
  where e.company_id = p_company
    and e.customer_id = p_customer
    and e.coupon_id = v_coupon_id
    and e.redeemed_at is null
  for update;

  if v_entitlement_id is null then
    return false;
  end if;

  if not exists (
    select 1 from public.coupon_usages u
    where u.company_id = p_company
      and u.customer_id = p_customer
      and u.coupon_id = v_coupon_id
      and u.order_id = p_order
  ) then
    return false;
  end if;

  update public.store_customer_coupon_entitlements
  set redeemed_at = now(), redeemed_order_id = p_order
  where id = v_entitlement_id;

  return true;
end;
$function$;

revoke all on function public.provision_store_welcome_coupon(uuid, uuid) from public, anon, authenticated;
revoke all on function public.redeem_store_customer_reward(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_store_customer_coupon_redeemed(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.provision_store_welcome_coupon(uuid, uuid) to service_role;
grant execute on function public.redeem_store_customer_reward(uuid, uuid) to service_role;
grant execute on function public.mark_store_customer_coupon_redeemed(uuid, uuid, text, uuid) to service_role;

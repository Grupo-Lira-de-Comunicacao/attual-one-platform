-- Add a browser-held cryptographic proof for explicit public-store order claiming.
-- The raw proof never enters this table; only a SHA-256 verifier is stored.

create table if not exists private.store_order_claim_tokens (
  order_id uuid primary key references public.orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '90 days'),
  consumed_at timestamptz,
  consumed_customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on table private.store_order_claim_tokens from public, anon, authenticated, service_role;

create or replace function public.register_public_store_order_claim_token(
  p_order uuid,
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_order public.orders;
  v_existing private.store_order_claim_tokens;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'STORE_ACCOUNT_CLAIM_PROOF_INVALID';
  end if;

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

  if v_order.customer_id is not null then
    return false;
  end if;

  select *
    into v_existing
    from private.store_order_claim_tokens
   where order_id = v_order.id
   for update;

  if v_existing.order_id is not null then
    return v_existing.token_hash = p_token_hash
       and v_existing.consumed_at is null
       and v_existing.expires_at > now();
  end if;

  insert into private.store_order_claim_tokens(
    order_id, company_id, token_hash, expires_at
  ) values (
    v_order.id, v_order.company_id, p_token_hash, now() + interval '90 days'
  );

  return true;
end
$function$;

create or replace function public.claim_public_store_order_customer(
  p_order uuid,
  p_customer uuid,
  p_token_hash text
)
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'private'
as $function$
declare
  v_order public.orders;
  v_customer public.customers;
  v_proof private.store_order_claim_tokens;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'STORE_ACCOUNT_CLAIM_PROOF_INVALID';
  end if;

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

  select *
    into v_proof
    from private.store_order_claim_tokens
   where order_id = v_order.id
     and company_id = v_order.company_id
   for update;

  if v_proof.order_id is null
     or v_proof.token_hash <> p_token_hash
     or v_proof.expires_at <= now()
     or v_proof.consumed_at is not null
  then
    raise exception 'STORE_ACCOUNT_CLAIM_PROOF_INVALID';
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

  update private.store_order_claim_tokens
     set consumed_at = now(),
         consumed_customer_id = v_customer.id,
         updated_at = now()
   where order_id = v_order.id;

  return v_order;
end
$function$;

revoke all on function public.register_public_store_order_claim_token(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_public_store_order_customer(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.register_public_store_order_claim_token(uuid, text) to postgres, service_role;
grant execute on function public.claim_public_store_order_customer(uuid, uuid, text) to postgres, service_role;

-- Final production gate for Padaria Conquista.
-- The store is opened only if the production invariants validated during
-- homologation still hold at migration time. Any drift aborts the migration.

do $gate$
declare
  v_company uuid;
  v_product_count integer;
  v_zone_count integer;
  v_default_zone_count integer;
  v_age_restricted_count integer;
  v_insecure_age_rpc_count integer;
begin
  select id
    into v_company
  from public.companies
  where slug = 'padaria-conquista'
    and deleted_at is null
    and public_store_enabled = true;

  if v_company is null then
    raise exception 'PADARIA_CONQUISTA_NOT_READY: company missing or public store disabled';
  end if;

  select count(*)
    into v_product_count
  from public.products
  where company_id = v_company
    and deleted_at is null
    and status = 'available'
    and is_public = true;

  if v_product_count <> 89 then
    raise exception 'PADARIA_CONQUISTA_NOT_READY: expected 89 public available products, found %', v_product_count;
  end if;

  select count(*), count(*) filter (where is_default)
    into v_zone_count, v_default_zone_count
  from public.delivery_zones
  where company_id = v_company
    and active = true;

  if v_zone_count <> 21 then
    raise exception 'PADARIA_CONQUISTA_NOT_READY: expected 21 active delivery zones, found %', v_zone_count;
  end if;

  if v_default_zone_count <> 1 then
    raise exception 'PADARIA_CONQUISTA_NOT_READY: expected exactly one default delivery zone, found %', v_default_zone_count;
  end if;

  select count(*)
    into v_age_restricted_count
  from public.products
  where company_id = v_company
    and deleted_at is null
    and status = 'available'
    and is_public = true
    and coalesce(age_restricted_min, 0) >= 18;

  if v_age_restricted_count <> 3 then
    raise exception 'PADARIA_CONQUISTA_NOT_READY: expected 3 age-restricted products, found %', v_age_restricted_count;
  end if;

  select count(*)
    into v_insecure_age_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'verify_order_age_handoff'
    and p.prosecdef = true;

  if v_insecure_age_rpc_count <> 0 then
    raise exception 'PADARIA_CONQUISTA_NOT_READY: age handoff RPC still uses SECURITY DEFINER';
  end if;

  update public.companies
  set public_store_open = true
  where id = v_company
    and public_store_enabled = true;

  if not found then
    raise exception 'PADARIA_CONQUISTA_NOT_READY: failed to open public store';
  end if;
end;
$gate$;

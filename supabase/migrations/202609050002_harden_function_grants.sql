begin;
set local check_function_bodies = off;

-- Least-privilege hardening for functions exposed through PostgREST.
-- SECURITY DEFINER functions must never be executable by anonymous users
-- unless that access is explicitly designed and reviewed.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
  loop
    execute format('revoke execute on function %s from public, anon', f.signature);
  end loop;
end $$;

-- Trigger-only functions are not application RPCs. Keep them inaccessible
-- to normal signed-in clients while preserving trigger execution.
revoke execute on function public.capture_audit() from authenticated;
revoke execute on function public.handle_new_auth_user() from authenticated;

-- The timestamp trigger is not SECURITY DEFINER, but fixing search_path removes
-- the mutable-search-path warning and keeps name resolution deterministic.
alter function public.touch_updated_at() set search_path = public;

-- Secure defaults for future functions created by the migration owner.
-- Any public or authenticated RPC must receive an explicit GRANT in its migration.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke execute on functions from authenticated;

-- Fail closed if an anonymous caller can still execute any SECURITY DEFINER
-- function in the exposed public schema.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ) then
    raise exception 'SECURITY HARDENING FAILED: anon still has EXECUTE on a SECURITY DEFINER function';
  end if;
end $$;

commit;

-- Production gate hardening for age-restricted handoff verification.
--
-- The orders table already enforces operational writes through RLS for
-- owner/manager/attendant/operator roles. This RPC therefore does not need
-- elevated SECURITY DEFINER privileges: running as the caller lets RLS remain
-- the source of truth for authorization while preserving the existing
-- function-level company membership checks.

alter function public.verify_order_age_handoff(uuid)
  security invoker;

alter function public.verify_order_age_handoff(uuid)
  set search_path = public, pg_temp;

revoke all on function public.verify_order_age_handoff(uuid) from public, anon;
grant execute on function public.verify_order_age_handoff(uuid) to authenticated;

comment on function public.verify_order_age_handoff(uuid) is
  'Marks age-restricted handoff as verified. Runs as invoker so orders RLS enforces operational write authorization.';

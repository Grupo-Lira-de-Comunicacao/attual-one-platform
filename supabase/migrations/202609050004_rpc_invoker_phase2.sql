begin;
set local check_function_bodies = off;

-- Phase 2 hardening: functions below only touch rows already protected by
-- company-scoped RLS policies for authenticated members, so they do not need
-- owner-level SECURITY DEFINER privileges.
alter function public.update_order(
  uuid,uuid,text,text,public.fulfillment_type,jsonb,integer,integer,
  public.payment_method,public.payment_status,jsonb
) security invoker;

alter function public.register_payment_leg(
  uuid,public.payment_method,integer,integer,public.payment_status,text,text,text
) security invoker;

alter function public.refund_payment_leg(uuid,integer,text,text) security invoker;
alter function public.redeem_loyalty_reward(uuid,text,text) security invoker;
alter function public.complete_order(uuid,text) security invoker;

-- Legacy/internal RPCs are not called directly by the current application.
-- Keep them callable by postgres/service_role for maintenance and internal
-- SECURITY DEFINER composition, but remove direct PostgREST access for users.
revoke execute on function public.register_payment(
  uuid,public.payment_method,public.payment_status,text,text
) from authenticated;
revoke execute on function public.apply_coupon(uuid,text,text) from authenticated;
revoke execute on function public.reverse_loyalty(uuid,text) from authenticated;

-- Fail closed if any function intentionally downgraded above is still a definer.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'update_order','register_payment_leg','refund_payment_leg',
        'redeem_loyalty_reward','complete_order'
      )
      and p.prosecdef
  ) then
    raise exception 'RPC hardening failed: expected SECURITY INVOKER function still runs as SECURITY DEFINER';
  end if;
end $$;

commit;

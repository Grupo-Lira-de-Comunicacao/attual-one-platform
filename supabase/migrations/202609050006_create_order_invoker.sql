begin;
set local check_function_bodies = off;

-- create_order only reads products/customers and inserts orders/order_items.
-- Those tables already have company-scoped RLS for authenticated members, so
-- owner-level execution is unnecessary and would bypass a useful protection layer.
alter function public.create_order(
  uuid,uuid,text,text,public.fulfillment_type,jsonb,integer,integer,
  public.payment_method,public.payment_status,jsonb,text
) security invoker;

-- Preserve the app contract while keeping anonymous callers blocked.
revoke execute on function public.create_order(
  uuid,uuid,text,text,public.fulfillment_type,jsonb,integer,integer,
  public.payment_method,public.payment_status,jsonb,text
) from public, anon;
grant execute on function public.create_order(
  uuid,uuid,text,text,public.fulfillment_type,jsonb,integer,integer,
  public.payment_method,public.payment_status,jsonb,text
) to authenticated;

commit;

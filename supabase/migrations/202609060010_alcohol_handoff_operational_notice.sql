-- Operational safeguards for age-restricted handoff.
-- Staff sees the warning in the existing order item notes. For pickup/dine-in,
-- completing the order while authenticated is the handoff attestation. Delivery
-- keeps the explicit driver document check.

create or replace function public.label_age_restricted_order_item()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_min_age smallint;
  v_warning text := '⚠ 18+ — Entregar somente após conferir documento com foto de uma pessoa maior de 18 anos.';
begin
  select age_restricted_min into v_min_age
  from public.products
  where id = new.product_id;

  if coalesce(v_min_age, 0) >= 18 and coalesce(new.note, '') not like '⚠ 18+%' then
    new.note := case
      when nullif(trim(coalesce(new.note, '')), '') is null then v_warning
      else v_warning || ' ' || trim(new.note)
    end;
  end if;
  return new;
end;
$function$;

revoke all on function public.label_age_restricted_order_item() from public, anon, authenticated;

drop trigger if exists trg_label_age_restricted_order_item on public.order_items;
create trigger trg_label_age_restricted_order_item
before insert or update of product_id, note
on public.order_items
for each row execute function public.label_age_restricted_order_item();

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
    -- For counter pickup or dine-in, an authenticated active company user
    -- completing the order is the handoff attestation after checking the ID.
    if new.fulfillment <> 'delivery'
       and auth.uid() is not null
       and exists (
         select 1
         from public.company_users cu
         where cu.company_id = new.company_id
           and cu.user_id = auth.uid()
           and cu.status = 'active'
       )
    then
      new.age_handoff_status := 'verified';
      new.age_handoff_verified_at := now();
    else
      raise exception 'AGE_HANDOFF_VERIFICATION_REQUIRED';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_age_restricted_order_completion() from public, anon, authenticated;

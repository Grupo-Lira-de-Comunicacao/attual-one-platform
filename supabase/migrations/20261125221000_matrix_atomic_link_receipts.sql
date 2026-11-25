-- M4: acknowledge callbacks only after link, inbox and audit changes commit together.
-- Serialize the callback and a new inbox insert on the explicit person-link row.
create or replace function public.matrix_apply_link_callback(
  p_matrix_person_id uuid, p_link_status text, p_correlation_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link public.matrix_person_links%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_matrix_person_id is null or p_correlation_id is null
     or p_link_status is null or p_link_status not in ('linked', 'revoked') then
    raise exception 'Invalid Matrix callback' using errcode = '22023';
  end if;

  select * into v_link from public.matrix_person_links
   where matrix_person_id = p_matrix_person_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if exists (
    select 1 from public.matrix_person_link_audit
    where matrix_person_id = p_matrix_person_id
      and store_account_id = v_link.store_account_id
      and actor_type = 'matrix' and action = p_link_status
      and correlation_id = p_correlation_id
  ) then
    if v_link.status <> p_link_status then
      return jsonb_build_object('outcome', 'state_conflict');
    end if;
    return jsonb_build_object('outcome', 'applied',
      'customer_linked', p_link_status = 'linked' and v_link.customer_id is not null);
  end if;

  if p_link_status = 'linked' then
    if v_link.status not in ('pending', 'linked') then
      return jsonb_build_object('outcome', 'state_conflict');
    end if;
    update public.matrix_person_links
       set status = 'linked', linked_at = coalesce(linked_at, v_now), revoked_at = null,
           updated_at = v_now, last_correlation_id = p_correlation_id
     where id = v_link.id;
    if v_link.customer_id is not null then
      update public.matrix_signal_inbox
         set processing_status = 'linked', linked_customer_id = v_link.customer_id, updated_at = v_now
       where matrix_person_id = p_matrix_person_id
         and processing_status in ('received', 'unlinked');
    end if;
  else
    update public.matrix_person_links
       set status = 'revoked', revoked_at = coalesce(revoked_at, v_now),
           updated_at = v_now, last_correlation_id = p_correlation_id
     where id = v_link.id;
    update public.matrix_signal_inbox
       set processing_status = 'suppressed', linked_customer_id = null, updated_at = v_now
     where matrix_person_id = p_matrix_person_id
       and processing_status in ('received', 'unlinked', 'linked');
  end if;

  insert into public.matrix_person_link_audit
    (matrix_person_id, store_account_id, action, actor_type, correlation_id, metadata)
  values (p_matrix_person_id, v_link.store_account_id, p_link_status, 'matrix', p_correlation_id,
    jsonb_build_object('customer_linked', p_link_status = 'linked' and v_link.customer_id is not null,
                       'marketing_enabled', false, 'external_action_enabled', false));
  return jsonb_build_object('outcome', 'applied',
    'customer_linked', p_link_status = 'linked' and v_link.customer_id is not null);
end;
$$;

revoke all on function public.matrix_apply_link_callback(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.matrix_apply_link_callback(uuid, text, uuid) to service_role;

create or replace function public.matrix_guard_new_inbox_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_link public.matrix_person_links%rowtype;
begin
  select * into v_link from public.matrix_person_links
    where matrix_person_id = new.matrix_person_id for update;
  if found and v_link.status in ('revoked', 'suppressed') then
    new.processing_status := 'suppressed';
    new.linked_customer_id := null;
  elsif new.processing_status = 'linked' and
    (v_link.status is distinct from 'linked'
      or v_link.customer_id is null
      or new.linked_customer_id is distinct from v_link.customer_id) then
    new.processing_status := 'unlinked';
    new.linked_customer_id := null;
  end if;
  return new;
end;
$$;

revoke all on function public.matrix_guard_new_inbox_link() from public, anon, authenticated;
grant execute on function public.matrix_guard_new_inbox_link() to service_role;
drop trigger if exists matrix_guard_new_inbox_link on public.matrix_signal_inbox;
create trigger matrix_guard_new_inbox_link before insert on public.matrix_signal_inbox
  for each row execute function public.matrix_guard_new_inbox_link();

-- Run through run-m4-pglite.mjs against its in-memory fixture schema only.
begin;
do $$
declare
  v_person uuid := '10000000-0000-4000-8000-000000000001';
  v_company uuid := '20000000-0000-4000-8000-000000000001';
  v_account uuid := '30000000-0000-4000-8000-000000000001';
  v_customer uuid := '40000000-0000-4000-8000-000000000001';
  v_activate uuid := '50000000-0000-4000-8000-000000000001';
  v_revoke uuid := '50000000-0000-4000-8000-000000000002';
  v_failed uuid := '50000000-0000-4000-8000-000000000003';
  receipt jsonb;
begin
  insert into public.companies(id) values (v_company);
  insert into public.store_customer_accounts(id) values (v_account);
  insert into public.customers(id) values (v_customer);
  insert into public.matrix_person_links(matrix_person_id, company_id, store_account_id, customer_id)
    values (v_person, v_company, v_account, v_customer);
  receipt := public.matrix_apply_link_callback(v_person, 'linked', v_activate);
  if receipt is distinct from '{"outcome":"applied","customer_linked":true}'::jsonb then
    raise exception 'activation was not confirmed';
  end if;
  insert into public.matrix_signal_inbox
    (signal_key, matrix_person_id, topic_key, score, confidence, signal_count, policy_version, occurred_at, processing_status, linked_customer_id)
    values ('m4-fixture-before', v_person, 'radio', 2, 0.5, 2, 'test-policy', now(), 'linked', v_customer);
  if (select processing_status from public.matrix_signal_inbox where signal_key = 'm4-fixture-before') is distinct from 'linked' then
    raise exception 'valid signal did not remain linked';
  end if;

  -- Inject an audit storage failure. All changes from this request must roll back.
  alter table public.matrix_person_link_audit add constraint m4_fixture_audit_failure
    check (correlation_id <> '50000000-0000-4000-8000-000000000003'::uuid);
  begin
    perform public.matrix_apply_link_callback(v_person, 'revoked', v_failed);
    raise exception 'expected an audit storage error';
  exception when check_violation then
    null;
  end;
  if (select status from public.matrix_person_links where matrix_person_id = v_person) is distinct from 'linked'
    or (select processing_status from public.matrix_signal_inbox where signal_key = 'm4-fixture-before') is distinct from 'linked' then
    raise exception 'failed callback committed partial changes';
  end if;

  receipt := public.matrix_apply_link_callback(v_person, 'revoked', v_revoke);
  if receipt is distinct from '{"outcome":"applied","customer_linked":false}'::jsonb then
    raise exception 'revocation was not confirmed';
  end if;
  if not exists (
    select 1 from public.matrix_signal_inbox where signal_key = 'm4-fixture-before'
      and processing_status = 'suppressed' and linked_customer_id is null
  ) then raise exception 'existing signal was not suppressed'; end if;

  perform public.matrix_apply_link_callback(v_person, 'revoked', v_revoke);
  if (select count(*) from public.matrix_person_link_audit where correlation_id = v_revoke) <> 1 then
    raise exception 'same callback duplicated the audit entry';
  end if;
  receipt := public.matrix_apply_link_callback(v_person, 'linked', v_activate);
  if receipt->>'outcome' is distinct from 'state_conflict' then
    raise exception 'previous activation unexpectedly reactivated the link';
  end if;

  -- Model a stale decision at the route by keeping its pre-revocation status at insert.
  insert into public.matrix_signal_inbox
    (signal_key, matrix_person_id, topic_key, score, confidence, signal_count, policy_version, occurred_at, processing_status, linked_customer_id)
    values ('m4-fixture-delayed', v_person, 'radio', 2, 0.5, 2, 'test-policy', now(), 'linked', v_customer);
  if not exists (
    select 1 from public.matrix_signal_inbox where signal_key = 'm4-fixture-delayed'
      and processing_status = 'suppressed' and linked_customer_id is null
  ) then raise exception 'delayed signal was not suppressed'; end if;
  if has_function_privilege('anon', 'public.matrix_apply_link_callback(uuid,text,uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.matrix_apply_link_callback(uuid,text,uuid)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.matrix_apply_link_callback(uuid,text,uuid)', 'EXECUTE') then
    raise exception 'callback permissions are not restricted to the service role';
  end if;
end;
$$;
rollback;

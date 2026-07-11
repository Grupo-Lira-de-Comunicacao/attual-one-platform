-- Seed idempotente e OPCIONAL de cupons, regra de fidelidade e contas de
-- demonstração da Hamburgueria 07.
-- Não é uma migration: execute manualmente, sob demanda, após:
--   1) a empresa com slug 'hamburgueria-07' já existir;
--   2) supabase/seed/hamburgueria-07-customers-orders.sql já ter sido executado
--      (as contas de fidelidade referenciam clientes por telefone).
--
-- Reexecução é segura: cupons são casados por (company_id, code), a regra de
-- fidelidade por (company_id, name) e as contas por (company_id, customer_id) —
-- os mesmos índices únicos já existentes no schema — então rodar de novo não duplica.

do $$
declare
  v_company_id uuid;
  v_rule_id uuid;
  v_account_id uuid;
  v_customer_ana uuid;
  v_customer_rafael uuid;
begin
  select id into v_company_id from companies where slug = 'hamburgueria-07';
  if v_company_id is null then
    raise exception 'Empresa com slug "hamburgueria-07" não encontrada. Crie a empresa antes de rodar este seed.';
  end if;

  insert into coupons (company_id, code, description, type, value, minimum_order_cents, usage_limit, per_customer_limit, starts_at, expires_at, status)
  values
    (v_company_id, 'BEMVINDO10', '10% na primeira compra', 'percentage', 10, 3000, 100, 1, now() - interval '9 days', now() + interval '175 days', 'active'),
    (v_company_id, 'FRETEGRATIS', 'R$ 6 de desconto', 'fixed', 600, 5000, 50, null, now() - interval '9 days', now() + interval '52 days', 'active')
  on conflict (company_id, code) do update set
    description = excluded.description, type = excluded.type, value = excluded.value,
    minimum_order_cents = excluded.minimum_order_cents, usage_limit = excluded.usage_limit,
    per_customer_limit = excluded.per_customer_limit, starts_at = excluded.starts_at,
    expires_at = excluded.expires_at, status = excluded.status;

  insert into loyalty_rules (company_id, name, mode, points_per_real, reward_threshold, reward_description, status)
  values (v_company_id, 'Clube 07', 'points', 1, 500, 'R$ 25 de desconto', 'active')
  on conflict (company_id, name) do update set
    mode = excluded.mode, points_per_real = excluded.points_per_real,
    reward_threshold = excluded.reward_threshold, reward_description = excluded.reward_description,
    status = excluded.status
  returning id into v_rule_id;

  select id into v_customer_ana from customers where company_id = v_company_id and phone = '(12) 98821-4455';
  select id into v_customer_rafael from customers where company_id = v_company_id and phone = '(12) 99770-1122';

  if v_customer_ana is not null then
    insert into loyalty_accounts (company_id, customer_id, points, purchase_count, rewards_available)
    values (v_company_id, v_customer_ana, 340, 3, 0)
    on conflict (company_id, customer_id) do update set
      points = excluded.points, purchase_count = excluded.purchase_count, rewards_available = excluded.rewards_available
    returning id into v_account_id;
    if not exists (select 1 from loyalty_transactions where company_id = v_company_id and idempotency_key = 'seed-loyalty-ana-credit') then
      insert into loyalty_transactions (company_id, account_id, type, points, purchases, rewards, reason, idempotency_key)
      values (v_company_id, v_account_id, 'credit', 340, 3, 0, 'Saldo inicial de demonstração', 'seed-loyalty-ana-credit');
    end if;
  end if;

  if v_customer_rafael is not null then
    insert into loyalty_accounts (company_id, customer_id, points, purchase_count, rewards_available)
    values (v_company_id, v_customer_rafael, 520, 5, 1)
    on conflict (company_id, customer_id) do update set
      points = excluded.points, purchase_count = excluded.purchase_count, rewards_available = excluded.rewards_available
    returning id into v_account_id;
    if not exists (select 1 from loyalty_transactions where company_id = v_company_id and idempotency_key = 'seed-loyalty-rafael-credit') then
      insert into loyalty_transactions (company_id, account_id, type, points, purchases, rewards, reason, idempotency_key)
      values (v_company_id, v_account_id, 'credit', 520, 5, 1, 'Saldo inicial de demonstração', 'seed-loyalty-rafael-credit');
    end if;
  end if;
end $$;

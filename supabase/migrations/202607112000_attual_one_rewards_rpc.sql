-- Etapa 11 — Pagamentos, cupons e fidelidade reais.
-- 'partial' é um novo valor aditivo do enum payment_status (Postgres não permite
-- ADD VALUE dentro da mesma transação de uso; roda isolado, fora do begin/commit abaixo).
alter type public.payment_status add value if not exists 'partial';

begin;
set local check_function_bodies = off;

-- Colunas aditivas para divisão de pagamento e cálculo de troco.
alter table public.payments add column if not exists tendered_cents integer;
alter table public.payments add column if not exists change_cents integer not null default 0 check (change_cents >= 0);

-- Coluna aditiva para limite de uso de cupom por cliente.
alter table public.coupons add column if not exists per_customer_limit integer check (per_customer_limit is null or per_customer_limit > 0);

-- RPC de pagamento com divisão entre formas, troco e idempotência por pedido.
-- Substitui, em uso real, a RPC register_payment (Etapa 8, mantida sem alteração):
-- register_payment não aceitava observações nem valor parcial. Reaproveitada apenas
-- estruturalmente como referência de padrão; não é chamada pelo código desta etapa.
create function public.register_payment_leg(
  p_order uuid, p_method public.payment_method, p_amount_cents integer, p_tendered_cents integer,
  p_status public.payment_status, p_reference text, p_notes text, p_key text
) returns public.payments language plpgsql security definer set search_path=public as $$
declare o orders; result payments; change integer; paid_sum integer; new_status public.payment_status;
begin
  select * into o from orders where id=p_order for update;
  if o.id is null or not is_company_member(o.company_id) then raise exception 'pedido não encontrado'; end if;
  if p_amount_cents is null or p_amount_cents<0 then raise exception 'valor inválido'; end if;
  change:=greatest(0,coalesce(p_tendered_cents,p_amount_cents)-p_amount_cents);
  insert into payments(company_id,order_id,amount_cents,method,status,reference,notes,tendered_cents,change_cents,idempotency_key,created_by)
  values(o.company_id,o.id,p_amount_cents,p_method,p_status,p_reference,p_notes,p_tendered_cents,change,p_key,auth.uid())
  on conflict(company_id,idempotency_key) do update set amount_cents=excluded.amount_cents,method=excluded.method,status=excluded.status,reference=excluded.reference,notes=excluded.notes,tendered_cents=excluded.tendered_cents,change_cents=excluded.change_cents,updated_by=auth.uid()
  returning * into result;
  select coalesce(sum(amount_cents),0) into paid_sum from payments where order_id=o.id and status='paid';
  new_status:=case when paid_sum>=o.total_cents and paid_sum>0 then 'paid' when paid_sum>0 then 'partial' else 'pending' end;
  update orders set payment_status=new_status,payment_method=p_method,updated_by=auth.uid() where id=o.id;
  return result;
end $$;

-- Estorno de uma parcela de pagamento; recalcula o status agregado do pedido.
create function public.refund_payment_leg(p_payment uuid, p_reason text) returns public.payments language plpgsql security definer set search_path=public as $$
declare p payments; o orders; paid_sum integer; refunded_sum integer; new_status public.payment_status;
begin
  select * into p from payments where id=p_payment for update;
  if p.id is null or not is_company_member(p.company_id) then raise exception 'pagamento não encontrado'; end if;
  update payments set status='refunded',notes=coalesce(nullif(trim(p_reason),''),notes),updated_by=auth.uid() where id=p.id returning * into p;
  select * into o from orders where id=p.order_id for update;
  select coalesce(sum(amount_cents),0) into paid_sum from payments where order_id=o.id and status='paid';
  select coalesce(sum(amount_cents),0) into refunded_sum from payments where order_id=o.id and status='refunded';
  new_status:=case when paid_sum>=o.total_cents and paid_sum>0 then 'paid' when paid_sum>0 then 'partial' when refunded_sum>0 then 'refunded' else 'pending' end;
  update orders set payment_status=new_status,updated_by=auth.uid() where id=o.id;
  return p;
end $$;

-- Aplicação de cupom com limite global (já existente em apply_coupon, Etapa 8,
-- mantida sem alteração) e, adicionalmente, limite de uso por cliente.
create function public.apply_order_coupon(p_order uuid, p_code text, p_key text) returns public.coupon_usages language plpgsql security definer set search_path=public as $$
declare o orders; c coupons; discount integer; result coupon_usages; customer_uses integer;
begin
  select * into o from orders where id=p_order for update;
  if o.id is null or not is_company_member(o.company_id) then raise exception 'pedido não encontrado'; end if;
  select * into c from coupons where company_id=o.company_id and upper(code)=upper(p_code) and status='active' and now() between starts_at and expires_at for update;
  if c.id is null or o.subtotal_cents<c.minimum_order_cents or (c.usage_limit is not null and c.usage_count>=c.usage_limit) then raise exception 'cupom inválido'; end if;
  if c.per_customer_limit is not null and o.customer_id is not null then
    select count(*) into customer_uses from coupon_usages where coupon_id=c.id and customer_id=o.customer_id;
    if customer_uses>=c.per_customer_limit then raise exception 'limite de uso deste cupom por cliente atingido'; end if;
  end if;
  discount:=least(o.subtotal_cents,case when c.type='percentage' then round(o.subtotal_cents*c.value/100.0)::integer else c.value end);
  insert into coupon_usages(company_id,coupon_id,order_id,customer_id,discount_cents) values(o.company_id,c.id,o.id,o.customer_id,discount) on conflict(coupon_id,order_id) do update set discount_cents=excluded.discount_cents returning * into result;
  if not exists(select 1 from coupon_usages where coupon_id=c.id and order_id=o.id and id<>result.id) then update coupons set usage_count=usage_count+1 where id=c.id; end if;
  update orders set discount_cents=discount,total_cents=subtotal_cents-discount+delivery_fee_cents,updated_by=auth.uid() where id=o.id;
  return result;
end $$;

-- Resgate de recompensa acumulada (compre-e-ganhe ou pontos); saldo nunca negativo.
create function public.redeem_loyalty_reward(p_customer uuid, p_reason text, p_key text) returns public.loyalty_accounts language plpgsql security definer set search_path=public as $$
declare a loyalty_accounts; c customers;
begin
  select * into c from customers where id=p_customer;
  if c.id is null or not is_company_member(c.company_id) then raise exception 'cliente não encontrado'; end if;
  if exists(select 1 from loyalty_transactions where company_id=c.company_id and idempotency_key=p_key) then
    select * into a from loyalty_accounts where company_id=c.company_id and customer_id=p_customer; return a;
  end if;
  select * into a from loyalty_accounts where company_id=c.company_id and customer_id=p_customer for update;
  if a.id is null or a.rewards_available<=0 then raise exception 'nenhuma recompensa disponível para este cliente'; end if;
  update loyalty_accounts set rewards_available=rewards_available-1,updated_at=now() where id=a.id returning * into a;
  insert into loyalty_transactions(company_id,account_id,type,points,purchases,rewards,reason,idempotency_key,created_by) values(c.company_id,a.id,'reward',0,0,-1,coalesce(nullif(trim(p_reason),''),'Resgate de recompensa'),p_key,auth.uid());
  return a;
end $$;

-- Única alteração de RPC existente nesta etapa: complete_order (Etapa 8) creditava
-- fidelidade em qualquer pedido concluído, sem checar pagamento. create or replace
-- com a MESMA assinatura corrige a lacuna ("crédito somente em pedido pago e
-- concluído") sem exigir nenhuma mudança nos chamadores já existentes.
create or replace function public.complete_order(p_order uuid,p_key text) returns public.orders language plpgsql security definer set search_path=public as $$ declare o orders; r loyalty_rules; a loyalty_accounts; earned integer; begin select * into o from orders where id=p_order for update; if o.id is null or not is_company_member(o.company_id) then raise exception 'pedido não encontrado'; end if; update orders set status='completed',updated_by=auth.uid() where id=o.id returning * into o; if o.customer_id is null or o.payment_status<>'paid' then return o; end if; select * into r from loyalty_rules where company_id=o.company_id and status='active' order by created_at limit 1; if r.id is null then return o; end if; insert into loyalty_accounts(company_id,customer_id) values(o.company_id,o.customer_id) on conflict(company_id,customer_id) do nothing; select * into a from loyalty_accounts where company_id=o.company_id and customer_id=o.customer_id for update; if exists(select 1 from loyalty_transactions where company_id=o.company_id and idempotency_key=p_key) then return o; end if; earned=case when r.mode='points' then floor(o.total_cents/100.0*r.points_per_real)::integer else 0 end; update loyalty_accounts set points=points+earned,purchase_count=purchase_count+1,rewards_available=rewards_available+case when r.mode='buy_and_get' and (purchase_count+1)%r.reward_threshold=0 then 1 else 0 end where id=a.id; insert into loyalty_transactions(company_id,account_id,order_id,type,points,purchases,rewards,reason,idempotency_key,created_by) values(o.company_id,a.id,o.id,'credit',earned,1,case when r.mode='buy_and_get' and (a.purchase_count+1)%r.reward_threshold=0 then 1 else 0 end,'Conclusão pedido #'||o.number,p_key,auth.uid()); return o; end $$;

grant execute on function public.register_payment_leg(uuid,public.payment_method,integer,integer,public.payment_status,text,text,text) to authenticated;
grant execute on function public.refund_payment_leg(uuid,text) to authenticated;
grant execute on function public.apply_order_coupon(uuid,text,text) to authenticated;
grant execute on function public.redeem_loyalty_reward(uuid,text,text) to authenticated;
grant execute on function public.complete_order(uuid,text) to authenticated;

commit;

-- Etapa 11B — Estorno de pagamento (total ou parcial) com histórico auditável.
begin;
set local check_function_bodies = off;

-- Quanto de um pagamento já foi estornado (0 <= refunded_cents <= amount_cents).
alter table public.payments add column if not exists refunded_cents integer not null default 0;
alter table public.payments add constraint payments_refunded_within_amount check (refunded_cents >= 0 and refunded_cents <= amount_cents);

-- Histórico de estornos, um registro por ação — mesmo padrão de auditoria de stock_movements.
create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  payment_id uuid not null references public.payments(id),
  order_id uuid not null references public.orders(id),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (length(trim(reason)) > 0),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (company_id, idempotency_key)
);
create index payment_refunds_payment_idx on public.payment_refunds(payment_id, created_at desc);
alter table public.payment_refunds enable row level security;
create policy payment_refunds_member_read on public.payment_refunds for select to authenticated using (is_company_member(company_id));
create policy payment_refunds_operations_write on public.payment_refunds for all to authenticated using (has_company_role(company_id, array['owner','manager','attendant','operator']::public.company_role[])) with check (has_company_role(company_id, array['owner','manager','attendant','operator']::public.company_role[]));
create trigger payment_refunds_audit after insert or update or delete on public.payment_refunds for each row execute function public.capture_audit();

-- Assinatura mudou (ganhou p_amount_cents e p_key para estorno parcial + idempotência);
-- a versão anterior (uuid,text) é removida para não deixar uma RPC-fantasma sem uso.
drop function if exists public.refund_payment_leg(uuid, text);

create function public.refund_payment_leg(p_payment uuid, p_amount_cents integer, p_reason text, p_key text) returns public.payments language plpgsql security definer set search_path=public as $$
declare p payments; o orders; refundable integer; net_paid integer; new_status public.payment_status; existing payment_refunds;
begin
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'motivo obrigatório'; end if;
  select * into p from payments where id=p_payment for update;
  if p.id is null or not is_company_member(p.company_id) then raise exception 'pagamento não encontrado'; end if;
  if p.status<>'paid' then raise exception 'somente pagamentos pagos podem ser estornados'; end if;
  select * into existing from payment_refunds where company_id=p.company_id and idempotency_key=p_key;
  if existing.id is not null then return p; end if;
  refundable:=p.amount_cents-p.refunded_cents;
  if refundable<=0 then raise exception 'este pagamento já foi totalmente estornado'; end if;
  if p_amount_cents is null then p_amount_cents:=refundable; end if;
  if p_amount_cents<=0 or p_amount_cents>refundable then raise exception 'valor de estorno inválido: não pode exceder % centavos recebidos e ainda não estornados', refundable; end if;
  insert into payment_refunds(company_id,payment_id,order_id,amount_cents,reason,idempotency_key,created_by) values(p.company_id,p.id,p.order_id,p_amount_cents,trim(p_reason),p_key,auth.uid());
  update payments set refunded_cents=refunded_cents+p_amount_cents,status=case when refunded_cents+p_amount_cents>=amount_cents then 'refunded' else status end,updated_by=auth.uid() where id=p.id returning * into p;
  select * into o from orders where id=p.order_id for update;
  select coalesce(sum(amount_cents-refunded_cents),0) into net_paid from payments where order_id=o.id;
  new_status:=case when net_paid>=o.total_cents and net_paid>0 then 'paid' when net_paid>0 then 'partial' when exists(select 1 from payments where order_id=o.id and refunded_cents>0) then 'refunded' else 'pending' end;
  update orders set payment_status=new_status,updated_by=auth.uid() where id=o.id;
  return p;
end $$;

-- Mesma assinatura de antes; corrige o cálculo do agregado do pedido para ser líquido
-- de estornos (amount_cents - refunded_cents), evitando contar como "pago" um valor
-- que já foi parcialmente estornado quando um novo pagamento é registrado depois.
create or replace function public.register_payment_leg(
  p_order uuid, p_method public.payment_method, p_amount_cents integer, p_tendered_cents integer,
  p_status public.payment_status, p_reference text, p_notes text, p_key text
) returns public.payments language plpgsql security definer set search_path=public as $$
declare o orders; result payments; change integer; net_paid integer; new_status public.payment_status;
begin
  select * into o from orders where id=p_order for update;
  if o.id is null or not is_company_member(o.company_id) then raise exception 'pedido não encontrado'; end if;
  if p_amount_cents is null or p_amount_cents<0 then raise exception 'valor inválido'; end if;
  change:=greatest(0,coalesce(p_tendered_cents,p_amount_cents)-p_amount_cents);
  insert into payments(company_id,order_id,amount_cents,method,status,reference,notes,tendered_cents,change_cents,idempotency_key,created_by)
  values(o.company_id,o.id,p_amount_cents,p_method,p_status,p_reference,p_notes,p_tendered_cents,change,p_key,auth.uid())
  on conflict(company_id,idempotency_key) do update set amount_cents=excluded.amount_cents,method=excluded.method,status=excluded.status,reference=excluded.reference,notes=excluded.notes,tendered_cents=excluded.tendered_cents,change_cents=excluded.change_cents,updated_by=auth.uid()
  returning * into result;
  select coalesce(sum(amount_cents-refunded_cents),0) into net_paid from payments where order_id=o.id;
  new_status:=case when net_paid>=o.total_cents and net_paid>0 then 'paid' when net_paid>0 then 'partial' else 'pending' end;
  update orders set payment_status=new_status,payment_method=p_method,updated_by=auth.uid() where id=o.id;
  return result;
end $$;

grant execute on function public.refund_payment_leg(uuid,integer,text,text) to authenticated;
grant execute on function public.register_payment_leg(uuid,public.payment_method,integer,integer,public.payment_status,text,text,text) to authenticated;

commit;

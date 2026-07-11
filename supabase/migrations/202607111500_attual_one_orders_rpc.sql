begin;
set local check_function_bodies = off;

-- RPCs aditivas para criação e edição de pedido no painel administrativo.
-- Não substitui nem altera confirm_order, cancel_order, register_payment,
-- apply_coupon, complete_order ou reverse_loyalty — todas continuam
-- responsáveis pelas transições de status e permanecem inalteradas.

create function public.create_order(
  p_company uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment public.fulfillment_type,
  p_delivery_address jsonb,
  p_discount_cents integer,
  p_delivery_fee_cents integer,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_items jsonb,
  p_key text
) returns public.orders language plpgsql security definer set search_path=public as $$
declare
  v_existing orders; v_order orders; v_number bigint; v_order_id uuid;
  v_subtotal integer := 0; v_total integer; v_item jsonb; v_product products; v_qty integer; v_unit integer;
begin
  if not is_company_member(p_company) then raise exception 'empresa inválida'; end if;

  select * into v_existing from orders where company_id=p_company and idempotency_key=p_key;
  if v_existing.id is not null then return v_existing; end if;

  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'adicione pelo menos um item'; end if;
  if p_fulfillment='delivery' and (p_delivery_address is null or coalesce(p_delivery_address->>'street','')='' or coalesce(p_delivery_address->>'number','')='') then raise exception 'informe o endereço de entrega'; end if;
  if p_customer_id is not null and not exists(select 1 from customers where id=p_customer_id and company_id=p_company) then raise exception 'cliente não encontrado'; end if;

  perform 1 from companies where id=p_company for update;
  select coalesce(max(number),0)+1 into v_number from orders where company_id=p_company;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id=(v_item->>'product_id')::uuid and company_id=p_company for update;
    if v_product.id is null or v_product.status in ('inactive','out_of_stock') then raise exception '% está indisponível', coalesce(v_product.name,'produto'); end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty<=0 then raise exception 'quantidade inválida'; end if;
    if v_product.track_stock and v_qty>v_product.current_stock then raise exception 'estoque insuficiente para %', v_product.name; end if;
    v_unit := (v_item->>'unit_price_cents')::integer;
    if v_unit is null or v_unit<0 then raise exception 'preço inválido'; end if;
    v_subtotal := v_subtotal + v_unit*v_qty;
  end loop;

  v_total := v_subtotal - coalesce(p_discount_cents,0) + coalesce(p_delivery_fee_cents,0);
  if v_total<0 then raise exception 'o total do pedido não pode ser negativo'; end if;

  insert into orders(company_id,number,customer_id,customer_name,customer_phone,fulfillment,delivery_address,subtotal_cents,discount_cents,delivery_fee_cents,total_cents,payment_method,payment_status,status,source,idempotency_key,created_by)
  values(p_company,v_number,p_customer_id,coalesce(nullif(trim(p_customer_name),''),'Consumidor não identificado'),nullif(p_customer_phone,''),p_fulfillment,case when p_fulfillment='delivery' then p_delivery_address else null end,v_subtotal,coalesce(p_discount_cents,0),coalesce(p_delivery_fee_cents,0),v_total,p_payment_method,coalesce(p_payment_status,'pending'),'new','admin',p_key,auth.uid())
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id=(v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_unit := (v_item->>'unit_price_cents')::integer;
    insert into order_items(company_id,order_id,product_id,product_name,unit_price_cents,quantity,additions,note,total_cents)
    values(p_company,v_order_id,v_product.id,v_product.name,v_unit,v_qty,coalesce(v_item->'additions','[]'::jsonb),nullif(v_item->>'note',''),v_unit*v_qty);
  end loop;

  select * into v_order from orders where id=v_order_id;
  return v_order;
end $$;

create function public.update_order(
  p_order uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfillment public.fulfillment_type,
  p_delivery_address jsonb,
  p_discount_cents integer,
  p_delivery_fee_cents integer,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_items jsonb
) returns public.orders language plpgsql security definer set search_path=public as $$
declare
  v_order orders; v_subtotal integer := 0; v_total integer; v_item jsonb; v_product products; v_qty integer; v_unit integer;
begin
  select * into v_order from orders where id=p_order for update;
  if v_order.id is null or not is_company_member(v_order.company_id) then raise exception 'pedido não encontrado'; end if;
  if v_order.status<>'new' then raise exception 'somente pedidos novos podem ser editados'; end if;

  if p_items is null or jsonb_array_length(p_items)=0 then raise exception 'adicione pelo menos um item'; end if;
  if p_fulfillment='delivery' and (p_delivery_address is null or coalesce(p_delivery_address->>'street','')='' or coalesce(p_delivery_address->>'number','')='') then raise exception 'informe o endereço de entrega'; end if;
  if p_customer_id is not null and not exists(select 1 from customers where id=p_customer_id and company_id=v_order.company_id) then raise exception 'cliente não encontrado'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id=(v_item->>'product_id')::uuid and company_id=v_order.company_id for update;
    if v_product.id is null or v_product.status in ('inactive','out_of_stock') then raise exception '% está indisponível', coalesce(v_product.name,'produto'); end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty<=0 then raise exception 'quantidade inválida'; end if;
    if v_product.track_stock and v_qty>v_product.current_stock then raise exception 'estoque insuficiente para %', v_product.name; end if;
    v_unit := (v_item->>'unit_price_cents')::integer;
    if v_unit is null or v_unit<0 then raise exception 'preço inválido'; end if;
    v_subtotal := v_subtotal + v_unit*v_qty;
  end loop;

  v_total := v_subtotal - coalesce(p_discount_cents,0) + coalesce(p_delivery_fee_cents,0);
  if v_total<0 then raise exception 'o total do pedido não pode ser negativo'; end if;

  delete from order_items where order_id=v_order.id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id=(v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::integer;
    v_unit := (v_item->>'unit_price_cents')::integer;
    insert into order_items(company_id,order_id,product_id,product_name,unit_price_cents,quantity,additions,note,total_cents)
    values(v_order.company_id,v_order.id,v_product.id,v_product.name,v_unit,v_qty,coalesce(v_item->'additions','[]'::jsonb),nullif(v_item->>'note',''),v_unit*v_qty);
  end loop;

  update orders set customer_id=p_customer_id,customer_name=coalesce(nullif(trim(p_customer_name),''),'Consumidor não identificado'),customer_phone=nullif(p_customer_phone,''),fulfillment=p_fulfillment,delivery_address=case when p_fulfillment='delivery' then p_delivery_address else null end,subtotal_cents=v_subtotal,discount_cents=coalesce(p_discount_cents,0),delivery_fee_cents=coalesce(p_delivery_fee_cents,0),total_cents=v_total,payment_method=p_payment_method,payment_status=coalesce(p_payment_status,payment_status),updated_by=auth.uid() where id=v_order.id returning * into v_order;
  return v_order;
end $$;

grant execute on function public.create_order(uuid,uuid,text,text,public.fulfillment_type,jsonb,integer,integer,public.payment_method,public.payment_status,jsonb,text) to authenticated;
grant execute on function public.update_order(uuid,uuid,text,text,public.fulfillment_type,jsonb,integer,integer,public.payment_method,public.payment_status,jsonb) to authenticated;

commit;

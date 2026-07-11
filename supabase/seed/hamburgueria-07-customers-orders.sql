-- Seed idempotente e OPCIONAL de clientes e pedidos de demonstração da Hamburgueria 07.
-- Não é uma migration: execute manualmente, sob demanda, após:
--   1) a empresa com slug 'hamburgueria-07' já existir;
--   2) supabase/seed/hamburgueria-07-catalog.sql já ter sido executado (produtos por SKU).
--
-- Reexecução é segura: clientes são casados por (company_id, phone) e pedidos por
-- (company_id, idempotency_key) — os mesmos tipos de chave natural usados no restante
-- do projeto — então rodar de novo não duplica nada.
--
-- Este seed NÃO ajusta current_stock dos produtos: os pedidos aqui servem para
-- popular o quadro de status do painel (novo, confirmado, em preparação, etc.),
-- não para simular uma baixa de estoque real. Para isso, use a RPC adjust_stock
-- ou confirme/cancele pedidos reais pelo próprio painel após o seed.

do $$
declare
  v_company_id uuid;
  v_order_id uuid;
  v_number bigint;
  v_customer_id uuid;
  v_product products;
begin
  select id into v_company_id from companies where slug = 'hamburgueria-07';
  if v_company_id is null then
    raise exception 'Empresa com slug "hamburgueria-07" não encontrada. Crie a empresa antes de rodar este seed.';
  end if;
  if not exists (select 1 from products where company_id = v_company_id) then
    raise exception 'Nenhum produto encontrado para esta empresa. Rode hamburgueria-07-catalog.sql antes deste seed.';
  end if;

  insert into customers (company_id, name, phone, email, address, notes, status)
  select v_company_id, x.name, x.phone, x.email, x.address, x.notes, 'active'
  from (values
    ('Ana Clara',      '(12) 98821-4455', 'ana@email.com',    jsonb_build_object('street','Rua Exemplo 1','number','100','district','Centro','city','Caçapava','postalCode','12280-000'), 'Prefere contato por WhatsApp'),
    ('Rafael Martins', '(12) 99770-1122', 'rafael@email.com', jsonb_build_object('street','Rua Exemplo 2','number','101','district','Vila Menino Jesus','city','Caçapava','postalCode','12281-000'), null),
    ('Beatriz Souza',  '(12) 99115-8030', null,                jsonb_build_object('street','Rua Exemplo 3','number','102','district','Jardim Rafael','city','Caçapava','postalCode','12282-000'), null),
    ('Carlos Eduardo', '(12) 98844-2099', 'carlos@email.com', jsonb_build_object('street','Rua Exemplo 4','number','103','district','Centro','city','Caçapava','postalCode','12283-000'), null)
  ) as x(name, phone, email, address, notes)
  where not exists (select 1 from customers c where c.company_id = v_company_id and c.phone = x.phone);

  select coalesce(max(number), 0) into v_number from orders where company_id = v_company_id;

  -- Pedido novo · Ana Clara · Smash Bacon x2 · retirada
  if not exists (select 1 from orders where company_id = v_company_id and idempotency_key = 'seed-demo-order-new') then
    v_number := v_number + 1;
    select id into v_customer_id from customers where company_id = v_company_id and phone = '(12) 98821-4455';
    select * into v_product from products where company_id = v_company_id and sku = 'H07-SB';
    insert into orders (company_id, number, customer_id, customer_name, customer_phone, fulfillment, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method, payment_status, status, stock_applied, source, idempotency_key)
    values (v_company_id, v_number, v_customer_id, 'Ana Clara', '(12) 98821-4455', 'pickup', v_product.price_cents * 2, 0, 0, v_product.price_cents * 2, 'pix', 'pending', 'new', false, 'import', 'seed-demo-order-new')
    returning id into v_order_id;
    insert into order_items (company_id, order_id, product_id, product_name, unit_price_cents, quantity, additions, total_cents)
    values (v_company_id, v_order_id, v_product.id, v_product.name, v_product.price_cents, 2, '[]'::jsonb, v_product.price_cents * 2);
  end if;

  -- Pedido confirmado · Rafael Martins · Combo Duplo 07 · retirada
  if not exists (select 1 from orders where company_id = v_company_id and idempotency_key = 'seed-demo-order-confirmed') then
    v_number := v_number + 1;
    select id into v_customer_id from customers where company_id = v_company_id and phone = '(12) 99770-1122';
    select * into v_product from products where company_id = v_company_id and sku = 'H07-CD';
    insert into orders (company_id, number, customer_id, customer_name, customer_phone, fulfillment, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method, payment_status, status, stock_applied, source, idempotency_key)
    values (v_company_id, v_number, v_customer_id, 'Rafael Martins', '(12) 99770-1122', 'pickup', v_product.price_cents, 0, 0, v_product.price_cents, 'credit_card', 'pending', 'confirmed', true, 'import', 'seed-demo-order-confirmed')
    returning id into v_order_id;
    insert into order_items (company_id, order_id, product_id, product_name, unit_price_cents, quantity, additions, total_cents)
    values (v_company_id, v_order_id, v_product.id, v_product.name, v_product.price_cents, 1, '[]'::jsonb, v_product.price_cents);
  end if;

  -- Pedido em preparação · Beatriz Souza · Clássico 07 x2 · consumo local
  if not exists (select 1 from orders where company_id = v_company_id and idempotency_key = 'seed-demo-order-preparing') then
    v_number := v_number + 1;
    select id into v_customer_id from customers where company_id = v_company_id and phone = '(12) 99115-8030';
    select * into v_product from products where company_id = v_company_id and sku = 'H07-CL';
    insert into orders (company_id, number, customer_id, customer_name, customer_phone, fulfillment, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method, payment_status, status, stock_applied, source, idempotency_key)
    values (v_company_id, v_number, v_customer_id, 'Beatriz Souza', '(12) 99115-8030', 'dine_in', v_product.price_cents * 2, 0, 0, v_product.price_cents * 2, 'cash', 'pending', 'preparing', true, 'import', 'seed-demo-order-preparing')
    returning id into v_order_id;
    insert into order_items (company_id, order_id, product_id, product_name, unit_price_cents, quantity, additions, total_cents)
    values (v_company_id, v_order_id, v_product.id, v_product.name, v_product.price_cents, 2, '[]'::jsonb, v_product.price_cents * 2);
  end if;

  -- Pedido concluído · Carlos Eduardo · Fritas Crocantes · entrega
  if not exists (select 1 from orders where company_id = v_company_id and idempotency_key = 'seed-demo-order-completed') then
    v_number := v_number + 1;
    select id into v_customer_id from customers where company_id = v_company_id and phone = '(12) 98844-2099';
    select * into v_product from products where company_id = v_company_id and sku = 'H07-FR';
    insert into orders (company_id, number, customer_id, customer_name, customer_phone, fulfillment, delivery_address, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method, payment_status, status, stock_applied, source, idempotency_key)
    values (v_company_id, v_number, v_customer_id, 'Carlos Eduardo', '(12) 98844-2099', 'delivery', jsonb_build_object('street','Rua Exemplo 4','number','103','district','Centro','city','Caçapava','postalCode','12283-000'), v_product.price_cents, 0, 600, v_product.price_cents + 600, 'pix', 'paid', 'completed', true, 'import', 'seed-demo-order-completed')
    returning id into v_order_id;
    insert into order_items (company_id, order_id, product_id, product_name, unit_price_cents, quantity, additions, total_cents)
    values (v_company_id, v_order_id, v_product.id, v_product.name, v_product.price_cents, 1, '[]'::jsonb, v_product.price_cents);
  end if;

  -- Pedido cancelado · consumidor não identificado · Clássico 07
  if not exists (select 1 from orders where company_id = v_company_id and idempotency_key = 'seed-demo-order-cancelled') then
    v_number := v_number + 1;
    select * into v_product from products where company_id = v_company_id and sku = 'H07-CL';
    insert into orders (company_id, number, customer_id, customer_name, fulfillment, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method, payment_status, status, stock_applied, cancellation_reason, source, idempotency_key)
    values (v_company_id, v_number, null, 'Consumidor não identificado', 'pickup', v_product.price_cents, 0, 0, v_product.price_cents, 'pix', 'pending', 'cancelled', false, 'Cliente desistiu', 'import', 'seed-demo-order-cancelled')
    returning id into v_order_id;
    insert into order_items (company_id, order_id, product_id, product_name, unit_price_cents, quantity, additions, total_cents)
    values (v_company_id, v_order_id, v_product.id, v_product.name, v_product.price_cents, 1, '[]'::jsonb, v_product.price_cents);
  end if;
end $$;

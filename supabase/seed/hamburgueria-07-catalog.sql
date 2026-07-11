-- Seed idempotente do catálogo da Hamburgueria 07 (categorias e produtos).
-- Não é uma migration: execute manualmente, sob demanda, após a empresa já existir.
--
-- Pré-requisito: uma linha em `companies` com slug = 'hamburgueria-07'
-- (criada manualmente no painel Supabase, conforme ETAPA-8-SUPABASE-AUTH-MULTIEMPRESA.md).
-- Se o slug real da sua empresa for diferente, ajuste a variável abaixo antes de rodar.
--
-- Reexecução é segura: usa `on conflict` sobre os mesmos índices únicos do schema
-- (company_id+name para categorias, company_id+sku para produtos), sem duplicar linhas.

do $$
declare v_company_id uuid;
begin
  select id into v_company_id from companies where slug = 'hamburgueria-07';
  if v_company_id is null then
    raise exception 'Empresa com slug "hamburgueria-07" não encontrada em companies. Crie a empresa antes de rodar este seed.';
  end if;

  insert into categories (company_id, name, description, status, display_order)
  values
    (v_company_id, 'Hambúrgueres', 'Artesanais e smash', 'active', 1),
    (v_company_id, 'Combos', 'Lanche, acompanhamento e bebida', 'active', 2),
    (v_company_id, 'Porções', 'Acompanhamentos para compartilhar', 'active', 3),
    (v_company_id, 'Bebidas', 'Refrigerantes, sucos e água', 'active', 4)
  on conflict (company_id, name) do update set
    description = excluded.description, status = excluded.status, display_order = excluded.display_order;

  insert into products (company_id, category_id, name, description, price_cents, sku, track_stock, current_stock, minimum_stock, status)
  select v_company_id, c.id, x.name, x.description, x.price_cents, x.sku, true, x.current_stock, x.minimum_stock,
    case when x.current_stock = 0 then 'out_of_stock' else 'available' end
  from (values
    ('Hambúrgueres', 'Smash Bacon',      'Pão brioche, carne 120g, bacon e cheddar',        4490, 'H07-SB', 18, 8),
    ('Hambúrgueres', 'Clássico 07',      'Carne 150g, queijo, salada e molho da casa',      3990, 'H07-CL', 12, 6),
    ('Hambúrgueres', 'Veggie Garden',    'Burger vegetal, queijo e salada fresca',          3790, 'H07-VG',  4, 5),
    ('Combos',       'Combo Duplo 07',   'Duplo smash, fritas e refrigerante',              5200, 'H07-CD',  9, 5),
    ('Combos',       'Combo Família',    '4 clássicos, 2 fritas e refrigerante 2L',        14990, 'H07-CF',  3, 3),
    ('Porções',      'Fritas Crocantes', 'Batatas sequinhas com tempero especial',          2290, 'H07-FR', 25, 10),
    ('Porções',      'Onion Rings',      'Anéis de cebola empanados',                       2490, 'H07-OR',  0, 5),
    ('Bebidas',      'Coca-Cola Lata',   'Lata 350ml gelada',                                700, 'H07-CC', 36, 12),
    ('Bebidas',      'Suco de Laranja',  'Natural, copo 400ml',                             1290, 'H07-SL',  7, 6)
  ) as x(category_name, name, description, price_cents, sku, current_stock, minimum_stock)
  join categories c on c.company_id = v_company_id and c.name = x.category_name
  on conflict (company_id, sku) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    description = excluded.description,
    price_cents = excluded.price_cents,
    current_stock = excluded.current_stock,
    minimum_stock = excluded.minimum_stock,
    status = excluded.status;
end $$;

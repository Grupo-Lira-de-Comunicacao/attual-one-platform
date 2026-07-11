# Etapa 10 — Conexão real de Clientes e Pedidos ao Supabase

## Resultado

Clientes e Pedidos agora têm repositório Supabase real e funcional, acessado pelo painel (`/clientes`, `/pedidos`) através da mesma camada de repositório usada desde a Etapa 8/9. O modo `local` continua sendo o padrão ativo e seu comportamento não mudou — o `CommerceService` local já tinha todos os métodos necessários desde a fundação do módulo; esta etapa apenas os expôs pelo contrato de repositório e implementou o equivalente real no lado Supabase.

Nenhum projeto Supabase remoto foi criado ou alterado nesta etapa; migrations e seed são SQL versionado, prontos para aplicar quando o projeto existir.

## Arquivos criados

- `supabase/migrations/202607111500_attual_one_orders_rpc.sql` — migration **aditiva**: cria `create_order` e `update_order`. Não altera nenhuma tabela, política ou função existente.
- `supabase/seed/hamburgueria-07-customers-orders.sql` — seed manual **opcional** com 4 clientes e 5 pedidos de demonstração (um por status representativo: novo, confirmado, em preparação, concluído, cancelado), idempotente.
- `ETAPA-10-SUPABASE-CLIENTES-PEDIDOS.md` — este documento.

## Arquivos alterados

- `lib/repositories/contracts.ts` — `CommerceRepository` ganhou `updateCustomer`, `deleteCustomer` e `updateOrder` (todos já existiam no `CommerceService` local, só não estavam no contrato).
- `lib/repositories/local.ts` — expõe os três métodos novos delegando para o `CommerceService` já existente. **`commerce-service.ts` não foi alterado** — nenhuma regra de negócio local mudou, e por isso a loja pública (`storefront.tsx`, que usa `CommerceService` diretamente) continua exatamente como estava.
- `lib/repositories/supabase.ts` — seção `commerce` reescrita: `updateCustomer`, `deleteCustomer` (soft delete + desvincula pedidos, preservando nome/telefone já denormalizados no pedido — mesmo comportamento do modo local), `createOrder` (deixou de lançar erro; agora chama a RPC `create_order`) e `updateOrder` (nova RPC `update_order`). `changeStatus` não mudou (já usava `confirm_order`/`cancel_order`/`complete_order` desde a Etapa 8). As seções `catalog` e `rewards` **não foram tocadas** — conferido por diff linha a linha.
- `components/commerce-manager.tsx` — deixou de instanciar `CommerceService`/`CatalogService` diretamente; passou a usar `createRepositories()` (fábrica local/Supabase) e operar de forma assíncrona. Nenhuma tela, texto ou fluxo visível mudou.
- `app/[section]/page.tsx` — `/clientes` e `/pedidos` agora resolvem a empresa selecionada no servidor e repassam como prop, no mesmo padrão já usado por `/produtos` e `/estoque` desde a Etapa 9.
- `tests/supabase-foundation.test.mjs` — 3 novos testes.

## Tabelas usadas

`customers`, `orders`, `order_items` — já existiam no schema da Etapa 8; passaram a ser lidas e gravadas de fato. `product_options` fica disponível para o pedido pelo mesmo `productOptions` já carregado do catálogo (Etapa 9) e o campo `additions` de cada item aceita qualquer JSON, mas **nenhuma tela ainda seleciona opções por pedido** — o mesmo padrão de honestidade já usado na Etapa 9 para `product_options`: a capacidade existe na camada de dados, sem UI ainda.

## Migrations e RPCs criadas

- **`create_order`** — cria pedido + itens de forma atômica: valida itens (disponibilidade, estoque, quantidade, preço), endereço obrigatório em entrega, cliente pertencente à empresa; trava a linha da empresa (`for update`) para atribuir o próximo `number` sequencial sem colisão entre pedidos concorrentes; é idempotente por `(company_id, idempotency_key)` — reenvio com a mesma chave retorna o pedido já criado em vez de duplicar. **Não deduz estoque** — isso continua acontecendo em `confirm_order` (RPC já existente, reaproveitada sem alteração), exatamente como no modo local.
- **`update_order`** — edita cliente, atendimento, endereço, itens e valores de um pedido que ainda está `status='new'`; recusa edição fora desse status, mesma regra do `CommerceService` local. Recalcula itens e totais dentro da mesma transação da função.
- **Reaproveitadas sem alteração**: `confirm_order`, `cancel_order`, `complete_order` (transições de status, já usadas desde a Etapa 8 por `changeStatus`), `register_payment`, `apply_coupon`, `reverse_loyalty` (não usadas por este módulo — pagamentos/cupons/fidelidade continuam fora de escopo desta etapa).

Clientes (criar/editar/excluir) não usam RPC: operações de tabela única, atômicas por linha, protegidas por RLS via `.eq("company_id", companyId)`.

## Como executar o seed (opcional)

Pré-requisitos: empresa com `slug='hamburgueria-07'` já criada e `supabase/seed/hamburgueria-07-catalog.sql` (Etapa 9) já executado — o seed de pedidos busca produtos por SKU.

1. Abra o SQL Editor do Supabase (ou `supabase db execute -f supabase/seed/hamburgueria-07-customers-orders.sql`).
2. Execute o conteúdo de `supabase/seed/hamburgueria-07-customers-orders.sql`.
3. Reexecutar é seguro: clientes são casados por `(company_id, phone)` e pedidos por `(company_id, idempotency_key)` — nada é duplicado.
4. Este seed **não ajusta `current_stock`** dos produtos — os pedidos servem para popular o quadro de status do painel, não para simular baixa real de estoque. Para isso, confirme/cancele pedidos reais pelo próprio painel após semear.

## Garantias implementadas (requisito 2)

| Requisito | Como foi atendido |
|---|---|
| Filtro obrigatório por `company_id` | Toda query/RPC recebe ou deriva `company_id`; RLS confere por trás |
| Políticas RLS respeitadas | Nenhuma policy foi alterada; cliente browser autenticado sempre passa pela RLS existente |
| Valores monetários em centavos | `unit_price_cents`, `subtotal_cents`, `discount_cents`, `delivery_fee_cents`, `total_cents` — conversão via `cents()`/`/100` na borda TS↔SQL |
| Número sequencial por empresa | `create_order` trava a linha de `companies` (`for update`) antes de calcular `max(number)+1`, serializando concorrência |
| Criação atômica | `create_order` insere pedido + itens dentro de uma única função `plpgsql` |
| Baixa de estoque única e idempotente | Não acontece em `create_order` — continua em `confirm_order`, já idempotente desde a Etapa 8 |
| Devolução em cancelamento justificado | `cancel_order` (Etapa 8, inalterada) já exige motivo e devolve estoque |
| Prevenção de pedido duplicado | `unique(company_id, idempotency_key)` + early-return em `create_order`; o repositório gera uma chave nova por chamada |
| Histórico consistente de status | `changeStatus` usa as RPCs corretas para `confirmed`/`cancelled`/`completed`; demais status são atualização simples de coluna, sem efeito colateral (mesma regra do modo local) |
| Consumidor identificado ou anônimo | `customer_id` nulo + `customer_name` com fallback "Consumidor não identificado", igual ao local |
| Retirada, entrega e consumo local | `fulfillment_type` enum já existente; entrega exige endereço, validado na RPC |
| Adicionais e observações por item | `additions` (jsonb) e `note` persistidos por item, como no modo local |

## O que continua local (não mudou nesta etapa)

- Autenticação, sessão e seleção de empresa.
- Loja pública (`/loja`, `components/storefront.tsx`, `lib/storefront-service.ts`) — continua usando `CommerceService`/`CatalogService` locais diretamente.
- Pagamentos, cupons e fidelidade (`components/rewards-manager.tsx`, `lib/repositories/supabase.ts` seção `rewards`) — inalterados desde a Etapa 8/9; `rewards.load()` em modo Supabase continua vazio.
- `.env.local` — não foi tocado.

## O que foi realmente testado contra o Supabase

**Nada foi testado contra um projeto Supabase real** — nenhum projeto remoto existe (mesma situação registrada desde a Etapa 8/9). A validação desta etapa é:

- **Estrutural/SQL**: testes automatizados leem os arquivos de migration e seed e verificam a presença de funções, palavras-chave de idempotência (`idempotency_key`, `on conflict`, `where not exists`) e a ausência de qualquer alteração textual às RPCs de pedido/pagamento/cupom/fidelidade já existentes.
- **Comportamento real de ponta a ponta**: apenas em modo local, via `CommerceService` (já coberto desde a Etapa 3) e agora também via a interface `CommerceRepository` local (`updateCustomer`, `deleteCustomer`, `updateOrder`, cobertos por teste novo nesta etapa).
- **Revisão de código**: `create_order`/`update_order` foram desenhadas seguindo exatamente o mesmo padrão (locks `for update`, `idempotency_key`, `security definer`, `is_company_member`) das RPCs já em produção lógica desde a Etapa 8 (`confirm_order`, `cancel_order`), mas não foram executadas contra um banco Postgres real.

## Validação executada

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 54/54 (51 anteriores + 3 novos) |
| `npm run build` | ✅ build concluído, 13 rotas |

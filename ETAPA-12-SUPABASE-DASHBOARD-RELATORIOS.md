# Etapa 12 — Conexão real do Dashboard e Relatórios ao Supabase

## Resultado

Dashboard e Relatórios agora leem indicadores reais do Supabase através de uma camada analítica própria (funções SQL somente leitura), em vez de calcular tudo no navegador a partir de tabelas completas. O modo `local` continua sendo o padrão ativo — `AnalyticsService` local recebeu apenas os ajustes necessários para ficar consistente com estornos parciais/totais (Etapa 11B) e ganhou os três relatórios paginados novos, sem mudar nenhum comportamento já homologado.

Nenhum projeto Supabase remoto foi criado ou alterado; migration e código são versionados.

**Correções (mesmo dia):**
- [Correção 12B — Ambiguidade de customer_id no relatório de clientes](#correção-12b--ambiguidade-de-customer_id-no-relatório-de-clientes) — corrige `column reference "customer_id" is ambiguous` em `report_customers` (`getCustomersReport`).
- [Correção 12C — Otimização do snapshot analítico](#correção-12c--otimização-do-snapshot-analítico) — corrige `canceling statement due to statement timeout` em `analytics_dashboard_snapshot` (`getSnapshot`), eliminando varreduras repetidas de `orders`/`payments`.
- [Correção 12D — Timeout causado por RLS no snapshot autenticado](#correção-12d--timeout-causado-por-rls-no-snapshot-autenticado) — o timeout da 12C persistia especificamente para usuários autenticados (não para `postgres` no SQL Editor); causa era o custo de RLS linha a linha, não mais I/O repetido.

## Por que não replicar o `AnalyticsService` local em Supabase

O `AnalyticsService` local carrega catálogo, comércio e recompensas inteiros na memória e calcula tudo em JavaScript — well aceitável localmente (é só `localStorage`), mas exatamente o que o requisito 3 pediu para evitar em produção ("evite carregar todas as tabelas no navegador para calcular tudo no cliente"). Por isso a camada Supabase é uma peça de SQL própria: uma função (`analytics_dashboard_snapshot`) que devolve o resumo inteiro do dashboard em uma única viagem ao banco, e três funções paginadas (`report_products`, `report_customers`, `report_stock`) para as listas que podem crescer. Nenhuma delas transfere linha bruta de `order_items`/`payments`/etc. para o navegador — a agregação acontece inteiramente no Postgres.

## Decisão de design: funções sem `security definer`

Diferente de toda RPC de escrita já existente no projeto (que usa `security definer` porque precisa validar e escrever em múltiplas tabelas de forma controlada), as cinco funções desta etapa são **somente leitura** e **não usam `security definer`** — rodam com o privilégio de quem chama (o padrão do Postgres). Isso significa que as políticas RLS já existentes em `companies`, `products`, `orders`, `order_items`, `payments`, `customers` continuam se aplicando linha a linha, automaticamente. Isolamento por empresa não depende de eu lembrar de checar `is_company_member` em cada função nova — vem de graça da RLS, e é mais robusto (não existe forma de esquecer o check).

## Arquivos criados

- `supabase/migrations/202607114000_attual_one_analytics.sql` — coluna `companies.timezone` (aditiva) + 5 funções somente leitura, sem alterar nenhuma tabela, política ou RPC de escrita existente.
- `lib/csv.ts` — `csvCell`/`csvRow`/`buildCsv`, extraídos para serem testáveis fora de um componente React (arquivos `.tsx` com JSX não passam pelo `node --test --experimental-strip-types`, que só remove tipos, não transforma JSX).
- `tests/csv.test.mjs` — testes do `lib/csv.ts`.
- `ETAPA-12-SUPABASE-DASHBOARD-RELATORIOS.md` — este documento.

## Arquivos alterados

- `lib/analytics-types.ts` — novos tipos `PaginatedResult<T>`, `ProductReportRow`, `CustomerReportRow`, `StockReportRow`.
- `lib/analytics-service.ts` — `paidRevenue`/`paymentsByMethod.total` passaram a descontar `refundedAmount` (antes somavam o valor bruto de pagamentos `paid`, ignorando estornos parciais introduzidos na Etapa 11B); três métodos novos: `getProductsReport`, `getCustomersReport`, `getStockReport` (paginação e busca em memória, já que localmente os dados já estão carregados).
- `lib/rewards-service.ts` — **correção de bug real, encontrada pelo teste novo desta etapa**: `refundPayment` mudava o `status` do pagamento para `"refunded"` mas nunca gravava `refundedAmount`, então o cálculo de recebido líquido continuava contando o valor estornado como recebido. Corrigido para gravar `refundedAmount` e atualizar `order.paymentStatus` diretamente, sem depender mais de `registerPayment`.
- `lib/repositories/contracts.ts` — nova interface `AnalyticsRepository` (`getSnapshot`, `getProductsReport`, `getCustomersReport`, `getStockReport`), adicionada ao `RepositorySet`.
- `lib/repositories/local.ts` — expõe `AnalyticsService` como `repositories.analytics`. Nenhuma mudança nas seções `catalog`/`commerce`/`rewards`.
- `lib/repositories/supabase.ts` — nova seção `analytics` chamando as 5 funções da migration. Seções `catalog`, `commerce` e `rewards` **não foram tocadas** — conferido por diff (nenhuma linha de `createCategory`/`createOrder`/`registerPayment`/etc. mudou).
- `components/real-dashboard.tsx` — deixou de instanciar `AnalyticsService`/`CommerceService` diretamente; passou a usar `createRepositories()`. Layout, textos e classes CSS preservados integralmente; únicas adições são mensagens de estado vazio ("Nenhum pedido no período.", "Nenhuma venda no período.") onde antes a lista simplesmente ficava em branco.
- `components/reports-manager.tsx` — reescrito para usar o repositório: busca (`busca quando aplicável`), paginação real nas listas de produtos/clientes/estoque, nova tabela **Estoque** (gap que já existia desde a Etapa 5 — a especificação original pedia 5 relatórios, só 4 existiam), exportação CSV agora com dados reais e paginados (antes exportava só 5 números agregados fixos).
- `app/page.tsx`, `app/[section]/page.tsx` — resolvem a empresa selecionada e repassam como prop para `RealDashboard`/`ReportsManager`, mesmo padrão das Etapas 9–11.
- `app/globals.css` — CSS aditivo para `.report-pagination` (controles de paginação, inexistentes antes) e um ajuste responsivo em telas muito pequenas.
- `tests/analytics-service.test.mjs`, `tests/supabase-foundation.test.mjs` — cobertura nova (detalhe abaixo).

## Migration e RPCs/funções utilizadas

| Função | Tipo | O que faz |
|---|---|---|
| `analytics_period_bounds` | Helper (plpgsql) | Calcula início/fim do período (hoje/7d/30d/tudo) no fuso horário da empresa (`companies.timezone`, novo, padrão `America/Sao_Paulo`). Reaproveitada pelas 4 funções abaixo. |
| `analytics_dashboard_snapshot(p_company, p_period)` | RPC leitura | Snapshot completo do dashboard em uma chamada: vendas, pedidos, ticket médio, clientes, estoque baixo/esgotado, série temporal, ranking de produtos/clientes, pedidos por status, pagamentos por forma, pedidos recentes. |
| `report_products(p_company, p_period, p_search, p_limit, p_offset)` | RPC leitura, paginada | Produtos com quantidade/receita vendida no período + saldo de estoque; busca por nome/SKU; `total_count` via `count(*) over()` para a UI montar a paginação. |
| `report_customers(...)` | RPC leitura, paginada | Clientes com pedidos válidos e receita no período; busca por nome/telefone. |
| `report_stock(p_company, p_search, p_limit, p_offset)` | RPC leitura, paginada | Saldo de estoque atual (não filtrado por período — é saldo real, igual ao dashboard); itens com saldo baixo/esgotado aparecem primeiro; busca por nome/SKU. |

Nenhuma RPC de escrita (`confirm_order`, `cancel_order`, `create_order`, `update_order`, `adjust_stock`, `register_payment_leg`, `refund_payment_leg`, `apply_order_coupon`, `redeem_loyalty_reward`, `complete_order`) foi recriada ou alterada nesta migration — testado estruturalmente (ver abaixo).

## Garantias implementadas (requisito 2)

| Requisito | Como foi atendido |
|---|---|
| `company_id` obrigatório | Toda função recebe `p_company` e filtra explicitamente por ele; RLS reforça por trás (sem `security definer`) |
| RLS respeitada | Funções sem `security definer` — rodam com o privilégio de quem chama, RLS de `products`/`orders`/`payments`/etc. se aplica normalmente |
| Centavos | Todo cálculo interno usa `*_cents`; conversão para reais só na borda TS (`/100`), mesmo padrão de todas as etapas anteriores |
| Filtros hoje/7d/30d | `analytics_period_bounds`, reaproveitada por todas as funções que precisam de período |
| Fuso horário da empresa | `companies.timezone` (nova coluna, padrão `America/Sao_Paulo`); todo `date_trunc`/`extract(hour ...)` usa `at time zone v_tz` |
| Sem duplicação de dados | Agregações usam `group by` nas chaves naturais (produto, cliente, status, forma); nenhum `join` produz produto cartesiano não intencional |
| Pagamentos parciais/estornados | `paidRevenueCents`/`paymentsByMethod.total` somam `amount_cents - refunded_cents` apenas de pagamentos `paid`/`refunded` — nunca o bruto |
| Pedidos cancelados fora do faturamento | `revenueCents`, `averageTicketCents`, ranking de produtos/clientes e `report_products`/`report_customers` sempre filtram `status<>'cancelled'` |
| Estoque a partir do saldo real | `lowStock`/`outOfStock`/`stockValueCents`/`report_stock` leem `products.current_stock` diretamente, sem filtro de período |
| Ranking só de pedidos válidos | Mesmo filtro `status<>'cancelled'` nos agregados de `topProducts`/`topCustomers`/`report_products`/`report_customers` |

## Painel (requisito 4)

- Indicadores reais do Supabase: dashboard e relatórios chamam `repo().analytics.*`, que em modo Supabase bate nas funções acima.
- Atualiza após ação: como cada navegação/troca de período/página recarrega via `useEffect`, qualquer pedido/pagamento/estorno/movimentação criados em outra tela já aparecem ao voltar ou trocar o filtro — mesmo padrão de recarregar-no-mount usado desde a Etapa 9, sem necessidade de realtime.
- Estados vazios: dashboard mostra "Nenhum pedido no período."/"Nenhuma venda no período." em vez de listas em branco; relatórios mostram "Nenhum registro encontrado." em cada tabela paginada vazia.
- Layout do dashboard preservado integralmente (mesma estrutura, classes CSS e textos); relatórios ganharam busca, paginação e a tabela de Estoque, mas reaproveitam os mesmos componentes/estilos (`report-card`, `report-table`, `report-row` — grid fixo de 3 colunas, respeitado em todas as tabelas novas).
- Responsivo: nenhuma media query existente foi removida; a única CSS nova (`.report-pagination`) já nasce com uma regra para telas ≤420px.

## Como aplicar no Supabase

1. Executar `supabase/migrations/202607114000_attual_one_analytics.sql` (SQL Editor ou CLI), depois das migrations anteriores (Etapas 8 a 11B).
2. Opcional: ajustar `companies.timezone` para cada empresa se o fuso não for `America/Sao_Paulo` (`update companies set timezone='...' where id=...`).
3. Nenhum seed novo é necessário — os relatórios leem os dados já semeados nas Etapas 9–11.

## O que foi testado estruturalmente

- `npm run test`: 70/70 (59 anteriores + 11 novos).
- **Local, ponta a ponta, contra o `AnalyticsService` real (não mock)**: período sem vendas (estado vazio sem erro), pedidos cancelados fora do faturamento, pagamento parcial somado pelo valor efetivo, pagamento estornado descontado do recebido (este teste **encontrou e corrigiu** o bug do `refundPayment` acima), ranking de produtos paginado e ordenado, estoque baixo/esgotado priorizado no relatório.
- **CSV**: `lib/csv.ts` testado isoladamente (`csvCell` escapa aspas, `csvRow`/`buildCsv` montam seções corretamente) — extraído do componente justamente para permitir este teste.
- **Estrutural/SQL**: migration contém as 5 funções esperadas, nenhuma usa `security definer`, nenhuma RPC de escrita é recriada no arquivo.
- **Isolamento por empresa**: teste estrutural confirma que toda chamada Supabase das 4 funções de leitura em `lib/repositories/supabase.ts` inclui `p_company:companyId`.

## O que precisa ser testado no Supabase real

Nada foi executado contra um projeto Supabase real (nenhum projeto remoto existe, mesma situação desde a Etapa 8). Antes de usar em produção, validar manualmente:

- `analytics_dashboard_snapshot` e as 3 funções de relatório retornando dados corretos com RLS de um usuário real autenticado (não superusuário/service role).
- Cálculo de fuso horário (`companies.timezone`) com o período "hoje" próximo à virada da meia-noite.
- Paginação (`total_count`) com um volume de produtos/clientes maior que uma página.
- Isolamento real: dois usuários de empresas diferentes não veem dados um do outro ao chamar as mesmas funções.

## O que ainda permanece local

- Autenticação, sessão, seleção de empresa.
- Catálogo, estoque, clientes, pedidos, pagamentos, cupons, fidelidade (código, RPCs e componentes — nenhum tocado nesta etapa).
- Loja pública (`/loja`).
- `.env.local` — não foi tocado.

## Validação executada

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 70/70 (59 anteriores + 11 novos) |
| `npm run build` | ✅ build concluído, 13 rotas |

---

## Correção 12B — Ambiguidade de customer_id no relatório de clientes

### O erro

```
Error: column reference "customer_id" is ambiguous
```

Reportado em produção ao chamar `getCustomersReport` (`lib/repositories/supabase.ts`), que executa a RPC `report_customers`, definida em `supabase/migrations/202607114000_attual_one_analytics.sql`.

### Causa raiz

`report_customers` é `language plpgsql` e sua assinatura declara `returns table(customer_id uuid, name text, phone text, orders_count bigint, revenue_cents bigint, total_count bigint)`. Em PL/pgSQL, cada coluna de um `returns table(...)` fica acessível como um identificador dentro do corpo da função — como se fosse uma variável declarada. A CTE `sales` fazia:

```sql
select customer_id as id, count(*) as cnt, sum(total_cents) as rev
from orders where company_id=p_company and deleted_at is null and status<>'cancelled' and customer_id is not null and created_at>=v_start and created_at<=v_end
group by customer_id
```

sem nenhum alias para a tabela `orders`. Toda referência a `customer_id` ali ficou ambígua entre a coluna `orders.customer_id` e o parâmetro de saída `customer_id`. As demais partes da mesma função (CTE `base`, select final) e as funções `report_products`/`report_stock` já qualificavam todas as colunas com alias (`c.`, `p.`, `oi.`, `base.`) e nunca tiveram esse problema — só a CTE `sales` de `report_customers` estava sem alias.

### Correção aplicada

Migration aditiva `supabase/migrations/202607114100_fix_analytics_customer_id.sql`, com `create or replace function public.report_customers(...)`:

- **Mesma assinatura**: `(p_company uuid, p_period text, p_search text, p_limit int, p_offset int)`.
- **Mesmo tipo de retorno**: `table(customer_id uuid, name text, phone text, orders_count bigint, revenue_cents bigint, total_count bigint)`.
- **Mesma paginação, filtro de período, busca e RLS** (função continua sem `security definer`, isolamento por empresa continua vindo das políticas RLS de `orders`/`customers`, como documentado na Etapa 12 original).
- Única mudança: a CTE `sales` passou a usar o alias `o` para `orders`, qualificando explicitamente `o.customer_id`, `o.company_id`, `o.deleted_at`, `o.status`, `o.created_at` — a mesma disciplina que `report_products` já seguia.
- A migration `202607114000_attual_one_analytics.sql` **não foi editada** — confirmado por `git status` (sem alterações) e por teste automatizado que verifica que o arquivo original ainda contém o padrão sem alias (prova de que a correção é aditiva, não uma edição retroativa).

### Arquivos

- **Criado**: `supabase/migrations/202607114100_fix_analytics_customer_id.sql`.
- **Alterados**: `tests/analytics-service.test.mjs`, `tests/csv.test.mjs`, `tests/supabase-foundation.test.mjs`, `ETAPA-12-SUPABASE-DASHBOARD-RELATORIOS.md`. **Nenhum arquivo `.ts`/`.tsx` de produção mudou** — `lib/repositories/supabase.ts` já chamava `report_customers` corretamente (nome, parâmetros e mapeamento de colunas de retorno inalterados); o bug era inteiramente dentro do corpo da função SQL.

### Testes adicionados

- `tests/analytics-service.test.mjs`: relatório de clientes reflete pedidos válidos de um cliente com histórico **e** lista corretamente um cliente recém-criado sem nenhum pedido (`ordersCount: 0`, `revenue: 0`) — cobertura de negócio via `AnalyticsService` local (a implementação local nunca teve o bug de ambiguidade, mas a regra de negócio é a mesma que a função SQL precisa respeitar).
- `tests/csv.test.mjs`: exportação CSV da seção "Clientes" com um cliente com pedidos e um sem pedidos, validando formatação e valores.
- `tests/supabase-foundation.test.mjs`: teste estrutural que (1) confirma a migration original ainda contém o padrão `group by customer_id` sem alias — prova de que não foi tocada; (2) confirma a migration de correção usa `group by o.customer_id` (qualificado); (3) confirma ausência de `security definer`; (4) confirma que nenhuma outra função/RPC foi recriada no arquivo de correção.

### Validação executada (Correção 12B)

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 73/73 (70 anteriores + 3 novos) |
| `npm run build` | ✅ build concluído, 13 rotas |

### Commit

Não commitado — aguardando aprovação, conforme solicitado.

---

## Correção 12C — Otimização do snapshot analítico

### O erro

```
Error: canceling statement due to statement timeout
```

Reportado em produção ao chamar `getSnapshot` (`lib/repositories/supabase.ts`), que executa a RPC `analytics_dashboard_snapshot`, definida em `supabase/migrations/202607114000_attual_one_analytics.sql`.

### Causa raiz

A versão original computava cada indicador com um `select ... into` independente, e cada um desses `select` reaplicava do zero o mesmo filtro `company_id + período` diretamente sobre a tabela base. Resultado: a função varria `orders` **7 vezes** e `payments` **2 vezes** dentro de uma única chamada — contagens, receita/ticket, pedidos por status, série temporal, ranking de produtos, ranking de clientes e pedidos recentes cada um lia `orders` de novo; recebido e pagamentos por forma cada um lia `payments` de novo. Sob volume real de dados (sem os índices certos cobrindo cada combinação de filtro), essas leituras repetidas somam I/O suficiente para estourar o timeout do Supabase.

### Correção aplicada

Migration aditiva `supabase/migrations/202607114200_fix_analytics_snapshot_timeout.sql`, com `create or replace function public.analytics_dashboard_snapshot(p_company uuid, p_period text) returns jsonb`:

- **Mesma assinatura e mesmo formato de retorno** — todas as chaves do jsonb (`orders`, `openOrders`, `revenueCents`, `paidRevenueCents`, `averageTicketCents`, `customers`, `newCustomers`, `lowStock`, `outOfStock`, `stockValueCents`, `salesSeries`, `topProducts`, `topCustomers`, `ordersByStatus`, `paymentsByMethod`, `recentOrderIds`) permanecem idênticas — `lib/repositories/supabase.ts` não precisou de nenhuma alteração.
- **Uma única varredura de `orders`**: CTE `period_orders`, marcada `MATERIALIZED` (Postgres 12+) para garantir que o planejador não a reexecute a cada CTE derivada — sem esse marcador, o Postgres pode "inlinear" uma CTE simples e voltar a escanear a tabela base em cada referência. Todas as contagens, o ranking, a série temporal e os pedidos recentes passaram a derivar dessa CTE já filtrada e materializada, em vez de reconsultar `orders`.
- **Uma única varredura de `payments`**: mesma técnica, CTE `period_payments as materialized`.
- **`jsonb_build_object` só no final**, montado a partir de CTEs de agregação já prontas (`order_counts`, `valid_agg`, `paid_agg`, `status_breakdown`, `item_sales`, `customer_sales`, `hourly_series`/`daily_series`, `method_breakdown`, `new_customers`, `stock_agg`), sem nenhuma agregação redundante antes dos filtros.
- **Filtros Hoje/7d/30d preservados**: a série temporal calcula as duas variantes possíveis (`hourly_series` para hoje, `daily_series` para 7d/30d/tudo) a partir da mesma CTE `valid_orders` já materializada — nenhuma consulta adicional a `orders`, e o `case when p_period='today'` escolhe qual delas entra no resultado.
- **Regras de negócio inalteradas**: pedidos cancelados continuam fora de `revenueCents`/`averageTicketCents`/ranking/série (via `valid_orders`, que filtra `status<>'cancelled'`); pagamentos estornados continuam descontados de `paidRevenueCents`/`paymentsByMethod` (`amount_cents-refunded_cents` para `status in ('paid','refunded')`); ranking de produtos e clientes continua limitado a 5; `lowStock`/`outOfStock`/`stockValueCents` continuam sem filtro de período (saldo real); isolamento por `company_id` e ausência de `security definer` preservados — RLS continua sendo o único mecanismo de isolamento.
- A migration `202607114000_attual_one_analytics.sql` **não foi editada** — confirmado por `git status` e por teste automatizado que verifica que o arquivo original ainda contém o padrão de leitura repetida (prova de que a otimização é aditiva).

### Índices adicionados

Verifiquei os 7 índices sugeridos contra os já existentes desde a Etapa 8 (`supabase/migrations/202607110001_attual_one_foundation.sql`) e a Etapa 11B, e só criei os que realmente faltavam:

| Índice sugerido | Situação |
|---|---|
| `orders(company_id, created_at)` | **Já existia** como `orders_company_date_idx(company_id, created_at desc)` — não recriado (evita índice redundante) |
| `orders(company_id, status, created_at)` | **Novo** — `orders_company_status_created_idx` |
| `orders(company_id, payment_status, created_at)` | **Novo** — `orders_company_payment_status_created_idx` |
| `order_items(order_id)` | **Novo** — `order_items_order_idx` (a tabela não tinha nenhum índice; toda foreign key sem índice explícito não ganha um automaticamente no Postgres) |
| `payments(company_id, order_id, status)` | **Novo** — `payments_company_order_status_idx` |
| `stock_movements(company_id, product_id, created_at)` | **Novo** — `stock_movements_company_product_date_idx` |
| `products(company_id, deleted_at)` | **Novo** — `products_company_deleted_idx` |

Todos criados com `create index if not exists`, sem `concurrently` — mesmo padrão (transação única) de todas as migrations anteriores deste projeto.

### Arquivos

- **Criado**: `supabase/migrations/202607114200_fix_analytics_snapshot_timeout.sql`.
- **Alterados**: `tests/analytics-service.test.mjs`, `tests/supabase-foundation.test.mjs`, `ETAPA-12-SUPABASE-DASHBOARD-RELATORIOS.md`. **Nenhum arquivo `.ts`/`.tsx` de produção mudou** — assinatura e formato de retorno da RPC são idênticos aos da Etapa 12 original.

### Testes adicionados

- `tests/analytics-service.test.mjs`: snapshot nos períodos hoje/7 dias/30 dias sem erro, com `salesSeries` no tamanho esperado (12/7/30); ranking de produtos e clientes nunca ultrapassa 5 itens no snapshot. As demais cenários pedidos (snapshot sem dados, pedidos pagos, pedidos cancelados fora do faturamento, estornos descontados) já tinham cobertura local da Etapa 12/12B, reaproveitada — o bug era específico do SQL em produção, não da lógica de negócio.
- `tests/supabase-foundation.test.mjs`: confirma que a migration original ainda tem o padrão de leitura repetida (prova de que não foi tocada); confirma que a correção usa `create or replace function` com a mesma assinatura, `period_orders`/`period_payments` como `materialized`, exclusão de cancelados, desconto de estornos, exatamente 3 ocorrências de `limit 5` (ranking de produtos, clientes e pedidos recentes), ausência de `security definer`, presença dos 6 índices novos, ausência do índice redundante de `orders(company_id, created_at)`, e que nenhuma outra função/RPC foi recriada no arquivo.

### Validação executada (Correção 12C)

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 76/76 (73 anteriores + 3 novos) |
| `npm run build` | ✅ build concluído, 13 rotas |

### Commit

Não commitado — aguardando aprovação, conforme solicitado.

---

## Correção 12D — Timeout causado por RLS no snapshot autenticado

### O erro (persistindo após a Correção 12C)

```
Error: canceling statement due to statement timeout
```

Diagnóstico confirmado pelo usuário: `public.analytics_dashboard_snapshot(uuid,text)` roda rápido no SQL Editor como `postgres`, mas a **mesma RPC** estoura o timeout quando chamada pelo aplicativo com um usuário autenticado comum.

### Causa raiz

`postgres` (ou qualquer role usada no SQL Editor) tipicamente não é dono das tabelas/sujeito às políticas RLS da mesma forma que o papel `authenticated` do PostgREST — então a diferença de comportamento entre "SQL Editor" e "app autenticado" é a própria RLS. A função da Correção 12C é `SECURITY INVOKER` (padrão, sem `security definer` — decisão deliberada da Etapa 12 original, documentada na seção "Decisão de design" no início deste arquivo). Isso significa que **cada linha** lida dentro das CTEs materializadas (`period_orders`, `period_payments`, `products`, `customers`) passa pela avaliação da política RLS da respectiva tabela — que por sua vez chama `is_company_member(company_id)`, uma subconsulta contra `company_users`. A Correção 12C já eliminou as varreduras redundantes (I/O), mas o **custo de avaliar RLS linha a linha**, multiplicado pelas CTEs e junções da função, ainda é caro o suficiente para estourar o timeout sob um usuário autenticado real — um problema diferente do resolvido na 12C, e só visível nesse modo de execução.

### Correção aplicada

Migration aditiva `supabase/migrations/202607114300_fix_analytics_snapshot_rls.sql`, com `create or replace function public.analytics_dashboard_snapshot(p_company uuid, p_period text)`:

- **Mesma assinatura, mesmo retorno jsonb, mesma lógica otimizada da Correção 12C** (CTEs `period_orders`/`period_payments` `materialized`, mesmos filtros, mesmas agregações) — nenhuma regra de negócio mudou.
- **`SECURITY DEFINER`** — a função passa a rodar com o privilégio do seu dono (o papel que aplica as migrations, não sujeito às políticas RLS de aplicação), eliminando a avaliação de RLS linha a linha nas tabelas internas.
- **`SET search_path = public`** mantido explicitamente na própria declaração da função (blindagem padrão para funções `security definer`, evita sequestro de search_path).
- **Proprietário controlado do banco**: a função é criada pela migration (executada pelo papel de administração do Supabase/CLI), nunca por um usuário de aplicação — mesmo padrão de propriedade de todas as outras funções `security definer` já existentes no projeto desde a Etapa 8.
- **Nenhuma entrada SQL dinâmica**: a função não usa `execute format(...)` nem concatenação de SQL — todos os filtros são parâmetros tipados (`p_company uuid`, `p_period text`) usados em comparações diretas, sem risco de injeção.

### Mecanismo de autorização explícita

Como a função agora ignora a RLS internamente, ela **não pode mais confiar apenas no `p_company` recebido como parâmetro** — a autorização passa a ser verificada explicitamente, antes de qualquer leitura:

```sql
if auth.uid() is null then
  raise exception 'Acesso negado à empresa solicitada' using errcode = '42501';
end if;

if not exists (
  select 1 from company_users
  where company_id = p_company and user_id = auth.uid() and status = 'active'
) then
  raise exception 'Acesso negado à empresa solicitada' using errcode = '42501';
end if;
```

- Rejeita chamadas sem sessão autenticada (`auth.uid() is null`).
- Exige vínculo **ativo** (`status = 'active'`) do usuário autenticado especificamente com a empresa `p_company` recebida, verificado contra `company_users` — a mesma tabela e a mesma condição (`user_id = auth.uid()`, `status = 'active'`) que as políticas RLS já usavam via `is_company_member`, só que avaliada **uma única vez** no início da função, não linha a linha.
- Em qualquer uma das duas falhas, lança exceção com `errcode = '42501'` (código Postgres padrão de `insufficient_privilege`), a mesma classe de erro que a RLS teria produzido.

### Confirmação de isolamento entre empresas

Como a função ignora RLS internamente (`security definer`), o único mecanismo que impede um usuário de ler dados de outra empresa é essa checagem explícita — não é mais defesa em profundidade, é a fronteira de segurança real. Ela cobre o caso relevante: um usuário autenticado só passa pela checagem se tiver uma linha `active` em `company_users` para exatamente o `p_company` que ele mesmo informou; um usuário da empresa A que tente chamar a RPC com o `p_company` da empresa B não tem esse vínculo e recebe `42501` antes de qualquer tabela de dados ser tocada. Isso é coerente com o restante do sistema: `p_company` sempre chega do lado do app a partir de `getSelectedCompanyId()` (Etapa 8, validado pelo middleware contra `company_users`), mas a RPC agora valida de novo por conta própria, sem depender dessa garantia externa.

### Permissões aplicadas

```sql
revoke all on function public.analytics_dashboard_snapshot(uuid,text) from public;
revoke all on function public.analytics_dashboard_snapshot(uuid,text) from anon;
grant execute on function public.analytics_dashboard_snapshot(uuid,text) to authenticated;
```

Execução pública e anônima revogada explicitamente; só o papel `authenticated` do PostgREST pode chamar a função — coerente com a checagem interna, que já rejeitaria uma chamada anônima (`auth.uid() is null`), mas revogar a permissão de antemão evita até a tentativa.

### Escopo da correção

Apenas `analytics_dashboard_snapshot` foi recriada. `report_products`, `report_customers`, `report_stock` e `analytics_period_bounds` continuam `SECURITY INVOKER`, sem alteração — o diagnóstico e a reclamação de timeout foram especificamente sobre o snapshot do dashboard, a função mais complexa (mais CTEs, mais joins) e a mais exercitada (chamada em toda troca de período). Se o mesmo sintoma aparecer nas funções de relatório sob volume real, a mesma técnica (security definer + checagem explícita de `company_users`) pode ser replicada nelas em uma migration futura — não antecipado aqui para não alterar funções que não têm o problema confirmado.

### Arquivos

- **Criado**: `supabase/migrations/202607114300_fix_analytics_snapshot_rls.sql`.
- **Alterados**: `tests/supabase-foundation.test.mjs`, `ETAPA-12-SUPABASE-DASHBOARD-RELATORIOS.md`. **Nenhum arquivo `.ts`/`.tsx` de produção mudou** — assinatura e formato de retorno da RPC são idênticos; `lib/repositories/supabase.ts` chama a função exatamente como antes.
- As migrations `202607114000`, `202607114100` e `202607114200` **não foram tocadas** — confirmado por `git status`.

### Testes adicionados

- `tests/supabase-foundation.test.mjs`: confirma que as três migrations anteriores da camada analítica permanecem intactas; confirma que a correção usa `security definer` com `search_path = public` fixo, mantém as CTEs `materialized` da Correção 12C; confirma a presença da checagem `auth.uid() is null`, da consulta a `company_users` comparando `company_id = p_company`/`user_id = auth.uid()`/`status = 'active'`, e das duas ocorrências de `errcode = '42501'`; confirma `revoke ... from public`, `revoke ... from anon` e `grant ... to authenticated`; confirma ausência de SQL dinâmico (`execute format`/`execute '...'`); confirma que nenhuma outra função/RPC foi recriada no arquivo.

### Validação executada (Correção 12D)

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 77/77 (76 anteriores + 1 novo) |
| `npm run build` | ✅ build concluído, 13 rotas |

### Commit

Não commitado — aguardando aprovação, conforme solicitado.

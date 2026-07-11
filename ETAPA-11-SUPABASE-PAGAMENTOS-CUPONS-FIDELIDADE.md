# Etapa 11 — Conexão real de Pagamentos, Cupons e Fidelidade ao Supabase

## Resultado

Pagamentos, cupons e fidelidade agora têm repositório Supabase real, com o painel (`/pagamentos`, `/cupons-e-fidelidade`) migrado para a camada de repositório, no mesmo padrão das Etapas 9 e 10. O modo `local` continua sendo o padrão ativo. `apply_coupon` e `reverse_loyalty` (Etapa 8) passam a ser efetivamente utilizadas/equivalentes pela primeira vez nesta etapa — antes existiam apenas na migration, sem nenhum chamador em TypeScript.

Nenhum projeto Supabase remoto foi criado ou alterado; migrations e seed são SQL versionado.

**Adendo (mesmo dia):** a seção [Correção 11B — Estorno total e parcial de pagamentos](#correção-11b--estorno-total-e-parcial-de-pagamentos) no fim deste documento cobre uma entrega seguinte, que deu UI real de estorno (total ou parcial) ao pagamento — ampliando o que `refundPayment` fazia aqui só a nível de repositório.

## Duas exceções deliberadas a "nunca redefinir RPC/tipo existente"

Diferente das Etapas 9 e 10 (só migrations aditivas), esta etapa tem **duas alterações pontuais e documentadas**, ambas exigidas por requisitos explícitos e ambas com risco zero de regressão:

1. **`complete_order` (RPC, Etapa 8) — `create or replace function`, mesma assinatura.** A versão original creditava fidelidade em qualquer pedido concluído, sem checar pagamento. O requisito "crédito de fidelidade somente em pedido pago e concluído" não é satisfazível sem corrigir essa RPC — ela é o único lugar que credita fidelidade automaticamente. A correção é uma linha: `if o.customer_id is null then` virou `if o.customer_id is null or o.payment_status<>'paid' then`. Mesmo nome, mesmos parâmetros, mesmo retorno — nenhum chamador (`commerce-manager.tsx`, `lib/repositories/supabase.ts`) precisou mudar.
2. **`payment_status` (enum, orders + payments) — `alter type ... add value 'partial'`.** Aditivo por natureza (novo valor permitido, nenhuma linha existente muda). Necessário porque "pagamento pendente, pago, parcial e estornado" é um requisito explícito, e `partial` é conceitualmente um estado do **pedido** (quanto foi pago vs. total), não de uma parcela isolada. Como consequência, `lib/commerce-types.ts` (módulo de Pedidos) precisou de uma alteração de **um tipo, uma linha**: `PaymentStatus` passou a aceitar `"partial"`. Nenhuma lógica de pedidos mudou — só a assinatura de tipo passou a refletir um valor que a coluna já aceita no banco.

Nenhuma outra RPC, tabela, política RLS ou arquivo do módulo de Pedidos/Catálogo/Loja foi tocado — conferido por diff completo ao final desta etapa.

## Arquivos criados

- `supabase/migrations/202607112000_attual_one_rewards_rpc.sql` — as duas exceções acima + 4 RPCs novas.
- `supabase/seed/hamburgueria-07-rewards.sql` — seed opcional: 2 cupons, 1 regra de fidelidade, 2 contas de demonstração.
- `ETAPA-11-SUPABASE-PAGAMENTOS-CUPONS-FIDELIDADE.md` — este documento.

## Arquivos alterados

- `lib/commerce-types.ts` — `PaymentStatus` ganhou `"partial"` (exceção 2, acima).
- `lib/rewards-types.ts` — `Coupon`/`CouponInput` ganharam `perCustomerLimit?`; `Payment` ganhou `tenderedAmount?`/`changeAmount?`; novo tipo `LoyaltyTransaction`; `RewardsState` ganhou `loyaltyTransactions?` (opcional — só o modo Supabase preenche; local permanece `undefined`, sem mudança de comportamento).
- `lib/repositories/contracts.ts` — `RewardsRepository` ganhou `updateCoupon`, `deleteCoupon`, `updateProgram` (obrigatórios — já existiam no `RewardsService` local) e `syncLoyalty`, `registerPaymentSplit`, `refundPayment`, `applyCouponToOrder`, `redeemReward` (opcionais — só Supabase implementa, mesmo padrão de `productOptions` da Etapa 9).
- `lib/repositories/local.ts` — expõe os métodos novos delegando para `RewardsService` já existente. **`rewards-service.ts` não foi alterado** — a assinatura de `registerPayment(orderId, method, status, reference?, notes?)` usada pela loja pública (`storefront-service.ts`) permanece idêntica; só o wrapper passou a repassar `reference`/`notes`, que antes eram descartados.
- `lib/repositories/supabase.ts` — seção `rewards` reescrita por completo (antes era um stub que retornava sempre vazio). Seções `catalog` e `commerce` **não foram tocadas** — conferido por diff.
- `components/rewards-manager.tsx` — deixou de instanciar `RewardsService`/`CommerceService` diretamente; passou a usar `createRepositories()`. Adições visíveis: rótulo "Parcial" no status de pagamento, campo "Limite por cliente" no formulário de cupom, e uma seção de histórico de fidelidade (só aparece quando `loyaltyTransactions` vem preenchido, ou seja, modo Supabase).
- `app/[section]/page.tsx` — `/pagamentos` e `/cupons-e-fidelidade` resolvem a empresa selecionada e repassam como prop, mesmo padrão das Etapas 9/10.
- `tests/supabase-foundation.test.mjs` — 3 novos testes.

## Tabelas usadas

`payments`, `coupons`, `coupon_usages`, `loyalty_rules`, `loyalty_accounts`, `loyalty_transactions` — todas já existiam desde a Etapa 8; esta etapa passou a lê-las e gravá-las de fato. Colunas novas (aditivas): `payments.tendered_cents`, `payments.change_cents`, `coupons.per_customer_limit`.

## RPCs criadas ou alteradas

| RPC | Situação | O que faz |
|---|---|---|
| `register_payment_leg` | **Nova** | Registra pagamento (uma parcela): valida pedido, calcula troco (`tendered - amount`), grava com `idempotency_key` estável por pedido (upsert — reenviar atualiza em vez de duplicar), recalcula `orders.payment_status` (pendente/parcial/pago) somando as parcelas pagas. |
| `refund_payment_leg` | **Nova** | Estorna uma parcela específica; recalcula o agregado do pedido (pode voltar a pendente, parcial ou virar estornado se nada mais restar pago). |
| `apply_order_coupon` | **Nova** | Como `apply_coupon` (Etapa 8), mas também aplica limite de uso **por cliente** (`coupons.per_customer_limit`), contando `coupon_usages` do mesmo cupom+cliente. |
| `redeem_loyalty_reward` | **Nova** | Resgata uma recompensa disponível (`rewards_available -= 1`), idempotente, nunca deixa saldo negativo (`if rewards_available<=0 then raise exception`). |
| `complete_order` | **Alterada** (mesma assinatura) | Ver exceção 1, acima. |
| `confirm_order`, `cancel_order`, `register_payment`, `apply_coupon`, `reverse_loyalty` | **Reaproveitadas, inalteradas** | `confirm_order`/`cancel_order` continuam fora deste módulo (Pedidos). `reverse_loyalty` já é chamada automaticamente por `cancel_order` desde a Etapa 8 — satisfaz "estornar fidelidade" sem nenhuma mudança. `register_payment`/`apply_coupon` ficam presentes e testadas estruturalmente, mas o código desta etapa usa as versões novas (mais completas: aceitam observações, valor parcial, troco, limite por cliente). |

## Garantias implementadas (requisito 2)

| Requisito | Como foi atendido |
|---|---|
| `company_id` obrigatório | Toda query/RPC recebe ou deriva `company_id`; RLS confere por trás |
| RLS respeitada | Nenhuma política alterada; cliente autenticado sempre passa pela RLS existente |
| Centavos | `amount_cents`, `tendered_cents`, `change_cents`, `minimum_order_cents`, `value` (cupom fixo) — conversão via `cents()`/`/100` na borda |
| Pendente/pago/parcial/estornado | `payment_status` com `partial` aditivo; `register_payment_leg` calcula o agregado por soma das parcelas pagas |
| Divisão entre formas | `payments` já suportava múltiplas linhas por pedido (Etapa 8); `registerPaymentSplit` (repositório) chama `register_payment_leg` uma vez por parcela |
| Troco | `change_cents = greatest(0, tendered_cents - amount_cents)`, calculado dentro da RPC |
| Cupom percentual/fixo, pedido mínimo, validade | Já existia em `apply_coupon` (Etapa 8); reaproveitado em `apply_order_coupon` |
| Limite global e por cliente | Global: `usage_limit`/`usage_count` (Etapa 8). Por cliente: `per_customer_limit` (novo) + contagem em `coupon_usages` |
| Prevenção de uso duplicado | `unique(coupon_id, order_id)` em `coupon_usages` (Etapa 8), inalterado |
| Crédito só em pedido pago e concluído | Exceção 1 (`complete_order`) |
| Estorno em cancelamento | `reverse_loyalty`, chamada por `cancel_order` (Etapa 8), inalterada |
| Idempotência de crédito/estorno | `idempotency_key` em `loyalty_transactions` (Etapa 8) + `redeem_loyalty_reward` segue o mesmo padrão |
| Saldo nunca negativo | `reverse_loyalty` usa `greatest(0, ...)` (Etapa 8); `redeem_loyalty_reward` recusa resgate sem saldo (`rewards_available<=0`) |

## Escopo do painel (requisito 4) — o que tem UI e o que é só capacidade de dados

Seguindo o mesmo critério de honestidade de escopo da Etapa 9 (`product_options`): implementei **todas** as capacidades do requisito 2/3 no repositório e nas RPCs, mas só construí UI nova para o que o requisito 4 pede explicitamente.

**Com UI nesta etapa:** listar pagamentos reais; registrar/atualizar pagamento simples (modal existente, agora gravando de verdade); criar, editar, desativar (editar status) e excluir cupom, com o novo campo de limite por cliente; saldo e ranking de fidelidade reais; histórico de fidelidade (nova seção, só quando há dados); tudo reflete após recarregar (efeito do padrão `load()` já usado desde a Etapa 9).

**Só no repositório/RPC, sem tela nova (capacidade real, testável, sem consumidor de UI ainda):** `registerPaymentSplit` (divisão entre formas), `applyCouponToOrder` (aplicar cupom a um pedido pelo painel — hoje só a loja pública aplica cupom, e localmente), `redeemReward` (resgatar recompensa). Nenhum desses tinha uma tela correspondente antes desta etapa, e o requisito 4 não pede uma nova.

> **Atualização (adendo):** `refundPayment` ganhou UI real depois desta etapa original — ver [Correção 11B — Estorno total e parcial de pagamentos](#correção-11b--estorno-total-e-parcial-de-pagamentos). Deixou de estar nesta lista de "sem tela".

## Como executar o seed (opcional)

Pré-requisitos: empresa `hamburgueria-07` já criada; `hamburgueria-07-catalog.sql` (Etapa 9) e `hamburgueria-07-customers-orders.sql` (Etapa 10) já executados (o seed de fidelidade referencia clientes por telefone).

1. Abra o SQL Editor do Supabase (ou `supabase db execute -f supabase/seed/hamburgueria-07-rewards.sql`).
2. Execute `supabase/seed/hamburgueria-07-rewards.sql`.
3. Reexecutar é seguro: cupons por `(company_id, code)`, regra por `(company_id, name)`, contas por `(company_id, customer_id)` — mesmos índices únicos já existentes desde a Etapa 8.

## O que continua local (não mudou nesta etapa)

- Autenticação, sessão, seleção de empresa.
- Catálogo, estoque, clientes, pedidos (código, RPCs de pedido, componentes — exceto o tipo `PaymentStatus`, exceção 2 documentada acima).
- Loja pública (`/loja`) — `storefront-service.ts` continua chamando `RewardsService.registerPayment`/`calculateDiscount`/`useCoupon` locais diretamente; não foi conectada ao Supabase.
- `.env.local` — não foi tocado.

## O que foi realmente testado contra o Supabase

**Nada foi testado contra um projeto Supabase real** — nenhum projeto remoto existe. Validação desta etapa:

- **Estrutural/SQL**: testes leem as migrations e o seed, verificam presença das 4 RPCs novas, confirmam que `complete_order` foi alterada via `create or replace` (não recriada do zero) e que nenhuma outra RPC de pedido/estoque foi redeclarada no arquivo desta etapa.
- **Ponta a ponta, modo local**: `RewardsRepository` local (`updateCoupon`, `deleteCoupon`, `updateProgram`) coberto por teste novo, rodando contra o `RewardsService` real (não mock).
- **Revisão de código**: `register_payment_leg`/`refund_payment_leg`/`apply_order_coupon`/`redeem_loyalty_reward` seguem exatamente o padrão de locks `for update`, `idempotency_key` e `security definer` já em uso desde a Etapa 8, mas não foram executadas contra um Postgres real.

## Validação executada

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 57/57 (54 anteriores + 3 novos) |
| `npm run build` | ✅ build concluído, 13 rotas |

---

## Correção 11B — Estorno total e parcial de pagamentos

Entrega seguinte no mesmo dia, a pedido explícito: dar UI real de estorno ao módulo `/pagamentos`, algo que a Etapa 11 original só tinha deixado como capacidade de repositório sem tela (`refundPayment?`, opcional, sem consumidor).

### Botão Estornar no painel e modal de confirmação

- Em cada pagamento com `status="paid"`, a tabela de Pagamentos agora mostra um botão **Estornar**.
- Clicar abre um modal de confirmação: valor recebido, já estornado (se houver) e disponível; um toggle **Estorno total** (marcado por padrão); campo de valor parcial que só aparece quando o toggle é desmarcado, travado no máximo disponível; motivo obrigatório; botão de confirmação desabilitado enquanto o formulário for inválido **ou enquanto o estorno estiver em andamento** (ver exceção 3, abaixo).
- Uma nova seção **"Histórico de estornos"** aparece na aba Pagamentos quando há dados (mesmo padrão visual do histórico de fidelidade já existente).
- `refundPayment` deixou de ser opcional no contrato do repositório — agora é implementado nos dois modos (local e Supabase), porque passou a ter um consumidor de UI real.

### Nova tabela `payment_refunds`

Histórico auditável de estornos, um registro por ação — mesmo padrão de `stock_movements`: `id`, `company_id`, `payment_id`, `order_id`, `amount_cents`, `reason` (obrigatório, `check(length(trim(reason))>0)`), `idempotency_key`, `created_at`, `created_by`. RLS habilitada (`payment_refunds_member_read`, `payment_refunds_operations_write`) e trigger de auditoria (`capture_audit`), mesmos padrões já usados em toda tabela operacional desde a Etapa 8.

### Alteração da RPC `refund_payment_leg`

Diferente de `complete_order` (Etapa 11 original, `create or replace` com a mesma assinatura), `refund_payment_leg` **mudou de assinatura**: de `(uuid, text)` — só estorno total, sem valor, sem chave de idempotência própria — para `(uuid, integer, text, text)` — `p_payment, p_amount_cents, p_reason, p_key` —, aceitando valor parcial e uma `idempotency_key` dedicada. Como Postgres trataria isso como uma sobrecarga (duas funções coexistindo) em vez de substituição, a migration faz `drop function if exists public.refund_payment_leg(uuid, text)` antes de recriar, evitando deixar uma versão-fantasma sem uso. Nenhum outro chamador dependia da assinatura antiga (ela nunca teve consumidor de UI). A RPC recusa estornar mais do que `amount_cents - refunded_cents` (o disponível), recusa pagamentos que não estejam `status='paid'`, e exige motivo não vazio.

### Correção da RPC `register_payment_leg`

Como consequência direta de suportar estorno parcial, `register_payment_leg` (mesma assinatura, `create or replace` — nenhum chamador precisou mudar) também precisou de correção: sua fórmula de agregação do pedido somava pagamentos por `status='paid'` sem descontar o que já havia sido estornado. Sem a correção, registrar um novo pagamento depois de um estorno parcial recalcularia `orders.payment_status` como se o valor estornado ainda estivesse "pago". A fórmula passou a ser líquida: `sum(amount_cents - refunded_cents)`.

### Atualização automática do pedido

Ambas as RPCs recalculam, na mesma transação da função, `orders.payment_status` a partir do valor líquido pago (`amount_cents - refunded_cents` somado entre todos os pagamentos do pedido): `paid` se cobre o total, `partial` se cobre parte, `refunded` se nada mais restar pago mas houve estorno, `pending` caso contrário. Como o painel recarrega `state`/`commerce` via `act()` logo após a chamada (mesmo padrão desde a Etapa 9), o valor recebido/pendente exibido e o status do pedido já saem atualizados sem navegação.

### Idempotência e prevenção de duplo clique

- **No banco**: `payment_refunds` tem `unique(company_id, idempotency_key)`; a RPC verifica essa chave antes de qualquer escrita e retorna o pagamento inalterado se a chave já foi usada — protege contra reenvio de rede da mesma chamada.
- **Na UI**: cada clique em "Confirmar estorno" gera uma `crypto.randomUUID()` nova, então duas chamadas distintas (ex.: duplo clique) teriam chaves diferentes e **não** seriam deduplicadas pelo banco. Por isso o `RefundModal` ganhou um estado `submitting` que desabilita os dois botões do modal e troca o texto para "Estornando..." assim que a primeira chamada começa — impedindo fisicamente o segundo clique de sair do navegador. Ver "Achado da própria revisão", abaixo.

### Histórico de estornos

Nova seção **"Histórico de estornos"** na aba Pagamentos do painel, visível quando `state.paymentRefunds` vem preenchido (modo Supabase — `loadRewards` passou a buscar os 20 estornos mais recentes da empresa, com número do pedido, cliente, valor e motivo). Segue o mesmo padrão visual do "Histórico de fidelidade" já existente desde a Etapa 11 original. Além disso, cada linha da tabela de pagamentos mostra o valor já estornado (`Estornado: R$ X`) quando `refundedAmount > 0`, e o card "Recebido" do resumo da aba passou a descontar valores estornados do total exibido.

### Arquivos criados

- `supabase/migrations/202607113000_attual_one_payment_refund.sql` — coluna `payments.refunded_cents`, tabela `payment_refunds` (histórico auditável, RLS, trigger de auditoria — mesmo padrão de `stock_movements`), `refund_payment_leg` recriada, `register_payment_leg` corrigida.

### Arquivos alterados

- `lib/rewards-service.ts` — novo método `refundPayment(paymentId, amount, reason)`. Único arquivo de lógica local tocado nesta etapa/adendo inteiros — legítimo porque é o próprio módulo de recompensas, não pedidos/catálogo. Local **só suporta estorno total**: uma tentativa de valor menor que o total lança `"O modo local só suporta estorno total deste pagamento."` — limitação honesta, documentada na própria mensagem de erro, em vez de fingir suportar parcial sem de fato controlar o saldo restante.
- `lib/rewards-types.ts` — `Payment` ganhou `refundedAmount?`; novo tipo `PaymentRefund`; `RewardsState` ganhou `paymentRefunds?` (opcional, só Supabase preenche).
- `lib/repositories/contracts.ts` — `refundPayment` passou de opcional (`refundPayment?(paymentId, reason?)`) para obrigatório, com assinatura `refundPayment(paymentId, amount, reason, fullRefund?)`.
- `lib/repositories/local.ts` — expõe `refundPayment` delegando para `RewardsService`.
- `lib/repositories/supabase.ts` — `loadRewards` passou a buscar `payment_refunds` e a incluir `refunded_cents` por pagamento; `refundPayment` chama a `refund_payment_leg` recriada, com `p_amount_cents: null` quando `fullRefund` é verdadeiro.
- `components/rewards-manager.tsx` — botão Estornar, `RefundModal`, seção de histórico de estornos, resumo "Recebido" da aba Pagamentos corrigido para descontar valores já estornados.
- `tests/supabase-foundation.test.mjs` — 2 novos testes (estorno local com recusa de parcial e de duplicado; estrutura da nova migration).

### Achado da própria revisão: guard contra duplo-clique

Ao reler o código antes de reportar como concluído, percebi que o botão "Confirmar estorno" não se desabilitava durante o envio — um duplo-clique real dispararia duas chamadas com `crypto.randomUUID()` diferentes cada vez (chave de idempotência nova por chamada), driblando a proteção de idempotência no banco. Adicionei um estado `submitting` no modal que desabilita os dois botões e troca o texto para "Estornando..." enquanto a chamada está em curso. Corrigido antes do primeiro report, mas registrado aqui porque é exatamente o tipo de lacuna que "garantir idempotência" deveria cobrir.

### Limitação do teste no navegador

**Não foi possível testar clicando de verdade no navegador.** Durante a verificação, veio à tona que `.env.local` já está configurado com um projeto Supabase real (`NEXT_PUBLIC_DATA_MODE=supabase`, URL real) — configurado em algum momento fora das minhas ações, já que esse arquivo nunca foi tocado em nenhuma etapa. Não há credenciais de login para esse projeto disponíveis para mim, e havia um `next dev` de outra sessão já rodando na porta 3000; o Next.js recusa uma segunda instância no mesmo diretório de projeto, e a decisão foi não encerrar o servidor existente. A validação ficou restrita a:

- **Automatizada**: `npm run test` (59/59, incluindo os 2 novos testes do estorno), `npm run type-check`, `npm run lint`, `npm run build`.
- **Revisão de código**: releitura completa do componente e da migration antes do report, que encontrou e corrigiu o problema de duplo-clique acima.

Isso é uma lacuna real em relação ao processo normal ("start the dev server and use the feature in a browser"), registrada aqui em vez de omitida.

### Validação executada (adendo)

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 59/59 (57 anteriores + 2 novos) |
| `npm run build` | ✅ build concluído, 13 rotas |

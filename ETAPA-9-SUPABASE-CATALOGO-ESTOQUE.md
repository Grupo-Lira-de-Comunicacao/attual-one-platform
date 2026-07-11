# Etapa 9 — Conexão real do Catálogo e Estoque ao Supabase

## Resultado

Categorias, produtos, opções de produto e movimentações de estoque agora têm um repositório Supabase real e funcional, acessado pelo painel administrativo (`/produtos`, `/estoque`) através da mesma camada de repositório já prevista desde a Etapa 8 (`lib/repositories`). O modo `local` continua sendo o padrão ativo e não foi alterado em seu comportamento — apenas ganhou os métodos que já existiam no `CatalogService` mas ainda não estavam expostos pelo contrato de repositório.

Nenhum projeto Supabase remoto foi criado ou modificado nesta etapa (nenhuma migration foi executada externamente); todo o trabalho é código e SQL versionado, pronto para ser aplicado quando o projeto existir.

## O que mudou — arquivos criados

- `supabase/migrations/202607111000_attual_one_catalog_stock_rpc.sql` — nova migration **aditiva**, não modifica nenhuma tabela, política ou função existente. Cria apenas a RPC `adjust_stock`.
- `supabase/seed/hamburgueria-07-catalog.sql` — script SQL manual (não é migration) com os dados iniciais da Hamburgueria 07, usando `on conflict` para ser seguro de reexecutar.
- `ETAPA-9-SUPABASE-CATALOGO-ESTOQUE.md` — este documento.

## O que mudou — arquivos alterados

- `lib/catalog-types.ts` — novo tipo `ProductOption` e `ProductOptionInput`; `CatalogState` ganhou o campo `productOptions: ProductOption[]`.
- `lib/catalog-seed.ts` — `initialCatalogState` inclui `productOptions: []` (dado novo, não afeta categorias/produtos/estoque existentes).
- `lib/catalog-service.ts` — `load()` normaliza dados locais já persistidos que não tinham `productOptions`, preenchendo `[]` (migração silenciosa e retrocompatível do formato salvo no `localStorage`).
- `lib/repositories/contracts.ts` — `CatalogRepository` ganhou `updateCategory`, `deleteCategory`, `updateProduct`, `deleteProduct` (obrigatórios) e `createProductOption`/`updateProductOption`/`deleteProductOption` (opcionais, hoje só implementados no modo Supabase).
- `lib/repositories/local.ts` — expõe os métodos novos delegando para o `CatalogService` já existente (nenhuma regra de negócio local mudou).
- `lib/repositories/supabase.ts` — reescrita da seção `catalog`: leitura real de `product_options`, `updateCategory`/`deleteCategory` (exclusão lógica, bloqueando categoria com produtos ativos vinculados), `updateProduct`/`deleteProduct` (exclusão lógica), `moveStock` agora chama a RPC `adjust_stock`, e CRUD de `product_options`. As seções `commerce` e `rewards` foram tocadas apenas para renomear o helper interno de erro (`fail`→`check`, mesmo comportamento, com mensagem amigável em violação de unicidade) — **nenhuma regra de pedidos, pagamentos, cupons ou fidelidade mudou**.
- `lib/supabase/session.ts` — nova função `getSelectedCompanyId()`, leitura do cookie `attual_company_id` já validado pelo middleware; não altera `getSessionContext` nem a lógica de autenticação/seleção de empresa.
- `app/[section]/page.tsx` — para `/produtos` e `/estoque`, passa a resolver a empresa selecionada no servidor e repassar como prop ao painel.
- `components/catalog-manager.tsx` — deixou de instanciar `CatalogService` diretamente; agora usa `createRepositories()` (a mesma fábrica local/Supabase da Etapa 8) e passou a operar de forma assíncrona. Nenhuma tela, texto ou fluxo visível mudou.
- `tests/supabase-foundation.test.mjs` — 3 novos testes cobrindo o repositório local estendido e a estrutura das duas novas peças de SQL.

## Tabelas usadas

`categories`, `products`, `product_options`, `stock_movements` — todas já existiam no schema da Etapa 8 (`202607110001_attual_one_foundation.sql`); esta etapa passou a lê-las e gravá-las de fato.

## RPCs usadas

- **Nova**: `adjust_stock(p_product, p_type, p_quantity, p_reason, p_key)` — movimentação de estoque atômica (entrada/saída/ajuste manual do painel). Bloqueia a linha do produto (`for update`), valida controle de estoque, motivo e saldo não-negativo, atualiza `products` e insere em `stock_movements` numa única transação de função, com `idempotency_key` para tornar reenvios seguros.
- **Reaproveitadas sem alteração**: nenhuma das RPCs de pedido (`confirm_order`, `cancel_order`, `register_payment`, `apply_coupon`, `complete_order`, `reverse_loyalty`) foi tocada ou é usada por este módulo — o catálogo não movimenta estoque através delas; a movimentação manual usa exclusivamente `adjust_stock`, mantendo os dois fluxos independentes.

Categorias e produtos (criar/editar/excluir) não usam RPC: são operações de tabela única, já atômicas por linha no Postgres, protegidas por RLS via `.eq("company_id", companyId)` e pelas políticas existentes (`categories_management_write`, `products_management_write` etc.).

## Como executar o seed

Pré-requisito: já existir uma empresa com `slug = 'hamburgueria-07'` em `companies` (criada manualmente, conforme `ETAPA-8-SUPABASE-AUTH-MULTIEMPRESA.md`).

1. Abra o SQL Editor do projeto Supabase (ou use a CLI: `supabase db execute -f supabase/seed/hamburgueria-07-catalog.sql`).
2. Execute o conteúdo de `supabase/seed/hamburgueria-07-catalog.sql`.
3. Reexecutar é seguro: categorias são casadas por `(company_id, name)` e produtos por `(company_id, sku)` — os mesmos índices únicos já existentes no schema — então o script atualiza em vez de duplicar.
4. Se o slug da empresa real for diferente de `hamburgueria-07`, ajuste a cláusula `where slug = 'hamburgueria-07'` no início do script antes de rodar.

## Exclusão lógica

`categories`, `products` e `product_options` já tinham coluna `deleted_at` no schema da Etapa 8. O repositório Supabase agora usa isso: excluir marca `deleted_at = now()` em vez de apagar a linha, e toda leitura (`load`) filtra `is("deleted_at", null)`. Categoria com produto ativo vinculado não pode ser excluída (mesma regra do modo local, replicada no repositório antes do soft-delete). Movimentações de estoque (`stock_movements`) nunca são removidas — são histórico de auditoria.

## O que ainda permanece local (não mudou nesta etapa)

- Autenticação, sessão e seleção de empresa (`lib/supabase/session.ts` só ganhou uma leitura adicional, nada foi alterado no fluxo existente).
- Loja pública (`/loja`, `components/storefront.tsx`) — continua usando `CatalogService`/`CommerceService` locais diretamente; não foi conectada ao Supabase nesta etapa.
- Pedidos, pagamentos, cupons e fidelidade (`components/commerce-manager.tsx`, `components/rewards-manager.tsx`) — continuam instanciando os serviços locais diretamente, sem passar pela camada de repositório. `commerce.createOrder` no modo Supabase continua lançando erro proposital (sem RPC de criação de pedido) e `rewards.load()` no modo Supabase continua retornando estado vazio — inalterado desde a Etapa 8.
- Dashboard e relatórios (`lib/analytics-service.ts`) — leem os serviços locais diretamente, não a camada de repositório.
- Interface de gestão de opções de produto (`product_options`) — o repositório já suporta create/update/delete, mas não existe tela no painel para isso ainda; não fazia parte do escopo desta etapa.
- `.env.local` — não foi tocado; `NEXT_PUBLIC_DATA_MODE` continua o que já estava configurado antes desta etapa.

## Validação executada

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ sem erros/avisos |
| `npm run type-check` | ✅ sem erros |
| `npm run test` | ✅ 51/51 (48 anteriores + 3 novos) |
| `npm run build` | ✅ build concluído, 13 rotas |

Não foi possível testar contra um projeto Supabase real (nenhum projeto remoto existe, conforme registrado desde a Etapa 8) — a validação do repositório Supabase é estrutural (tipos, contrato, SQL) e por revisão de código, não integração ao vivo. O modo local segue coberto por testes de execução real de principio a fim.

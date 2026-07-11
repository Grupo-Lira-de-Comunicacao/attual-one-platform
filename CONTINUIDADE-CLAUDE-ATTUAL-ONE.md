# Continuidade — ATTUAL ONE Platform MVP (auditoria Claude)

Auditoria de continuidade realizada antes de qualquer alteração de código, cruzando `ATTUAL_ONE_Especificacao_MVP_v1.docx`, todos os `ETAPA-*.md`, `DECISOES_TECNICAS.md`, `README.md` e o código-fonte atual. Nenhum código funcional foi alterado nesta sessão; apenas os comandos de validação abaixo foram executados.

## 0. Resultado dos comandos executados

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ Sem erros/avisos (ESLint 9 + eslint-config-next) |
| `npm run type-check` | ✅ Sem erros (`tsc --noEmit`) |
| `npm run build` | ✅ Build de produção concluído (Next.js 16, Turbopack), 13 rotas geradas |
| `npm run test` | ✅ 48/48 testes passando (`node --test`), 0 falhas |

Repositório está com árvore de trabalho limpa quanto aos artefatos de build; nada foi commitado ou revertido nesta auditoria.

## 1. Framework e versões

- **Next.js** 16.2.6 (App Router, Turbopack) — `react` 19.2.6 / `react-dom` 19.2.6
- **TypeScript** 5.9.3, `strict` via `tsc --noEmit`
- **Tailwind CSS** 4.2.1 (`@tailwindcss/postcss`)
- **ESLint** 9.39.4 + `eslint-config-next` 16.2.6
- **Supabase**: `@supabase/supabase-js` 2.110.2, `@supabase/ssr` 0.12.0
- **lucide-react** 0.468.0 (ícones)
- **Testes**: runner nativo do Node (`node --test --experimental-strip-types`), sem framework externo (sem Jest/Vitest)
- **PWA**: `app/manifest.ts` + service worker básico (`components/pwa-register.tsx`)
- Módulo do projeto é `"type": "module"`; middleware do Next vive em `proxy.ts` (não `middleware.ts`)

## 2. Módulos já implementados (Etapas 1–8)

| Módulo (spec) | Estado | Onde |
|---|---|---|
| Design system / navegação / dashboard fictício | ✅ Fundação (Etapa 1) | `components/app-shell.tsx`, `app/layout.tsx`, `app/globals.css` |
| Produtos, categorias, estoque | ✅ Completo (Etapa 2) | `lib/catalog-service.ts`, `components/catalog-manager.tsx` |
| Clientes e pedidos | ✅ Completo (Etapa 3) | `lib/commerce-service.ts`, `components/commerce-manager.tsx` |
| Pagamentos, cupons, fidelidade | ✅ Completo (Etapa 4) | `lib/rewards-service.ts`, `components/rewards-manager.tsx` |
| Dashboard real e relatórios | ✅ Completo (Etapa 5) | `lib/analytics-service.ts`, `components/real-dashboard.tsx`, `components/reports-manager.tsx` |
| Loja pública e checkout | ✅ Completo (Etapa 6) | `lib/storefront-service.ts`, `components/storefront.tsx`, `app/loja/page.tsx` |
| Homologação funcional do MVP local | ✅ Concluída (Etapa 7), 2 correções aplicadas (estorno de fidelidade e acessibilidade de modais) | `tests/homologation-mvp.test.mjs` |
| Fundação Supabase, auth e multiempresa | ✅ Infraestrutura criada, **não ativada** (Etapa 8) | ver seções 4–6 |

**Ainda não implementado / placeholder**, apesar de estar no escopo do MVP da especificação:
- **Configurações** (`/configuracoes`): tela genérica "Fundação pronta" (`app/[section]/page.tsx:40-43`) — sem onboarding de empresa, horários, formas de pagamento ou identidade visual configurável, conforme item 2 do escopo.
- **Importação de dados (item 10 do escopo)**: o que existe é só a prévia/migração das 4 chaves do `localStorage` para o Supabase (`lib/migration/local-to-supabase.ts`, `components/local-migration-panel.tsx`). Não há upload de CSV/XLSX externo, mapeamento de colunas ou relatório de importação de terceiros — isso ainda precisa ser construído.
- **ATTUAL ONE Insight**: não mencionado/alterado em nenhuma etapa (fora do escopo atual, preservado conforme Etapa 7).

## 3. Estado dos testes

- 48 testes automatizados em `tests/*.test.mjs`, cobrindo catálogo/estoque, clientes/pedidos, pagamentos/cupons/fidelidade, dashboard/relatórios, loja/checkout, homologação e a fundação Supabase (`tests/supabase-foundation.test.mjs` valida seleção de modo local/supabase, contratos de repositório, migration SQL e ausência de segredos inventados no `.env.example`).
- Todos os testes rodam contra os **serviços locais** (`localStorage`/adapter em memória); não há testes de integração reais contra um projeto Supabase (nenhum projeto remoto existe ainda, por decisão documentada).
- Não há testes E2E de navegador nem CI configurada — pendência já registrada na Etapa 7 e ainda aberta.

## 4. Modo local e modo Supabase

- Seleção via `NEXT_PUBLIC_DATA_MODE` (`local` por padrão, `supabase` opcional) em `lib/supabase/config.ts`.
- **Estado atual do ambiente**: `.env.local` está com `NEXT_PUBLIC_DATA_MODE=local`, URL e chave pública do Supabase **vazias**. O projeto está rodando 100% em modo local.
- `lib/repositories/factory.ts` decide o adaptador: modo `supabase` sem `url`+`publishableKey` configurados lança erro explícito; nunca cai silenciosamente para local.
- `proxy.ts` (middleware) só aplica proteção de rotas/sessão quando `mode !== "local"` — em modo local todas as rotas passam livre (exceto que a loja `/loja` já é pública em ambos os modos).
- **Gap relevante para a Etapa 9**: o adaptador Supabase (`lib/repositories/supabase.ts`) está parcialmente implementado:
  - `commerce.createOrder` **lança erro proposital** (`"Use a RPC transacional de checkout/criação de pedido no modo Supabase."`) — não existe ainda uma RPC de criação de pedido; só existem RPCs para confirmar/cancelar/pagar/concluir um pedido já criado.
  - `rewards.load()` no modo Supabase retorna um estado **vazio hardcoded** (sem cupons, pagamentos ou fidelidade reais) — a leitura real dessas entidades ainda não foi conectada.
  - Ou seja: hoje é possível ligar `NEXT_PUBLIC_DATA_MODE=supabase` para autenticação/multiempresa e leitura de catálogo/clientes/pedidos, mas **não é possível operar o fluxo completo de pedidos/pagamentos/cupons/fidelidade em modo Supabase** ainda.

## 5. Migrations, RLS e RPCs

- Migration única: `supabase/migrations/202607110001_attual_one_foundation.sql` (131 linhas), ainda **não executada em nenhum projeto Supabase remoto** (nenhum projeto foi criado, conforme Etapa 8).
- 18 entidades da especificação, todas com UUID, `company_id`, timestamps, soft delete (`deleted_at`) onde aplicável, valores monetários em **centavos inteiros** (`*_cents`), `created_by`/`updated_by` para auditoria.
- Triggers: `touch_updated_at` (todas as tabelas mutáveis) e `capture_audit` (grava em `audit_logs` para customers, categories, products, stock_movements, orders, payments, coupons, loyalty_rules, loyalty_accounts, import_jobs, company_users).
- RLS habilitado em todas as 18 tabelas. Padrão: leitura por membro ativo da empresa (`is_company_member`), escrita por papel (`has_company_role`) diferenciando "gestão" (owner/manager) de "operação" (owner/manager/attendant/operator). Leitura pública anônima limitada a `companies`, `categories`, `products`, `product_options` quando `public_store_enabled=true`.
- RPCs atômicas/idempotentes existentes: `confirm_order`, `cancel_order`, `register_payment`, `apply_coupon`, `complete_order`, `reverse_loyalty`. Todas usam `idempotency_key` e locks (`for update`) para evitar duplicidade/condição de corrida.
- **RPC ausente**: criação de pedido (admin e loja pública) — item explicitamente citado como limitação em `ETAPA-8-SUPABASE-AUTH-MULTIEMPRESA.md`: *"a loja pública em modo Supabase ainda precisa de uma RPC pública estreita para checkout anônimo"*.
- Cenários de teste manual de RLS documentados em `supabase/RLS-CENARIOS.md`, mas **ainda não executados** contra um projeto real (dependem de projeto Supabase existir).

## 6. Autenticação e multiempresa

- Clientes Supabase separados: `lib/supabase/browser.ts` e `lib/supabase/server.ts` (cookies SSR via `@supabase/ssr`).
- Fluxos implementados: login, recuperação de senha, atualização de senha, logout, sessão persistente (`app/login`, `app/recuperar-senha`, `app/nova-senha`, `app/auth/callback`).
- **Sem cadastro público**: `ALLOW_PUBLIC_SIGNUP=false` no `.env.local`; usuários entram por convite manual no painel Supabase (documentado, não há função administrativa protegida por `service_role` ainda).
- Multiempresa: tela `/sem-empresa` para usuário sem vínculo, `/selecionar-empresa` com validação server-side, cookie `httpOnly` `attual_company_id` validado contra `company_users` a cada requisição pelo `proxy.ts`.
- Papéis: `owner`, `manager`, `attendant`, `operator` — aplicados tanto no RLS do banco quanto nas rotas administrativas.
- Arquivos de UI de auth são propositalmente enxutos (`components/auth-screen.tsx` = 11 linhas, `app/login/page.tsx` = 2 linhas) seguindo o padrão de código denso do projeto — funcionais, não estão incompletos por tamanho pequeno.
- `service_role`, senha do banco, JWT secret e credenciais de pagamento **não existem em nenhum arquivo do projeto** (confirmado por leitura de `.env.example`/`.env.local` e testado em `tests/supabase-foundation.test.mjs`).

## 7. Pendências para a Etapa 9

Ordenadas por bloqueio ao uso real do Supabase em produção:

1. **RPC de criação de pedido** (admin e loja pública) — sem isso, `NEXT_PUBLIC_DATA_MODE=supabase` não sustenta o fluxo de vendas.
2. **Leitura real de cupons/pagamentos/fidelidade no adaptador Supabase** (`rewards.load()` hoje é stub vazio).
3. **RPC pública estreita para checkout anônimo da loja** (`/loja` em modo Supabase), com idempotência e sem expor `company_id` arbitrário.
4. Nenhum projeto Supabase remoto existe ainda — os 10 passos de configuração manual da Etapa 8 (`ETAPA-8-SUPABASE-AUTH-MULTIEMPRESA.md`) não foram executados; migration e cenários de RLS não foram validados contra banco real.
5. **Importação de dados real (CSV/XLSX de terceiros)** — item 10 do escopo do MVP ainda não construído; só existe a migração interna `localStorage → Supabase`.
6. **Tela de Configurações** (empresa, horários, entrega, pagamento, identidade visual) — ainda placeholder.
7. Armazenamento de imagens em Supabase Storage (hoje só aceita URL) e validação de arquivo no servidor.
8. Auditoria via `audit_logs` existe no schema mas não foi validada em uso real (depende do projeto Supabase existir).
9. Testes E2E de navegador e integração contínua — ainda não criados.
10. Auditoria WCAG completa (foco em modais, navegação por teclado, contraste, rótulos de ícones) — parcialmente feita na Etapa 7, não concluída.
11. Validação de CPF/CNPJ, telefone, CEP e e-mail conforme regras de produção.
12. Recuperação para corrupção/versão/limite do `localStorage` no modo local.
13. Conciliação de pagamentos e integração real com provedor (Pix/cartão).
14. **Achado fora do escopo dos ETAPA-*.md**: o diretório `.git` do projeto está presente mas **vazio/não inicializado** (`git status` retorna "not a git repository"), apesar de 8 etapas de trabalho documentado. Recomenda-se `git init` + commit inicial antes de iniciar a Etapa 9, para permitir histórico, revisão e rollback seguro — nenhuma ação foi tomada aqui por não ser código funcional e por exigir decisão do usuário.

## Restrições confirmadas como preservadas

- Modo `local` continua sendo o padrão ativo e não foi removido.
- Nenhuma chave `service_role`, senha de banco ou segredo foi adicionada ao frontend.
- Nenhuma migration foi executada contra um projeto Supabase remoto.
- Nenhum módulo fora do escopo do MVP (spec seção 3, "Fora do MVP") foi adicionado.

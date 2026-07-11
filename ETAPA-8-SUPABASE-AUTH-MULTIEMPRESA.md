# Etapa 8 — Fundação Supabase, autenticação e multiempresa

## Resultado

A infraestrutura Supabase foi adicionada sem remover ou alterar o comportamento padrão do MVP local homologado. O modo `local` continua ativo até que as variáveis sejam preenchidas e `NEXT_PUBLIC_DATA_MODE` seja alterado explicitamente para `supabase`.

## Implementado

- Clientes Supabase separados para browser e servidor usando cookies SSR.
- Validação explícita de modo, URL e chave pública.
- Login, recuperação e atualização de senha, logout e sessão persistente.
- Cadastro público não exposto; entrada de usuários ocorre por convite controlado.
- Proteção das rotas administrativas; `/loja` permanece pública.
- Tela para usuário sem empresa e seleção validada no servidor para múltiplas empresas.
- Cookie `httpOnly` de empresa selecionada, validado contra `company_users`.
- Migration SQL com 18 entidades, UUIDs, centavos inteiros, timestamps, soft delete, constraints e índices.
- RLS por participação e papel; leitura pública limitada ao catálogo autorizado.
- RPCs atômicas e idempotentes para confirmação, cancelamento, pagamento, cupom, conclusão e estorno de fidelidade.
- Auditoria automática sem senhas, tokens ou credenciais.
- Contratos e adaptadores de repositório local/Supabase sem acesso direto da interface ao banco.
- Prévia manual das quatro chaves locais, IDs determinísticos, fingerprint, prevenção de duplicidade e relatório em `import_jobs`.
- Backup lógico da Etapa 7 em `work/backups/attual-one-etapa7-logical-20260711.zip`.

## Chaves locais preservadas

- `attual-one:catalog:v1`
- `attual-one:commerce:v1`
- `attual-one:rewards:v1`
- `attual-one:storefront:v1`

## Cadastro controlado

Não existe formulário público de cadastro. Na primeira implantação, usuários devem ser convidados no painel do Supabase ou por uma futura função administrativa protegida por `service_role`. A chave `service_role` não foi adicionada ao projeto nem ao frontend.

## Configuração manual obrigatória no Supabase

1. Criar um projeto Supabase e copiar somente:
   - Project URL para `NEXT_PUBLIC_SUPABASE_URL`.
   - Publishable/anon key para `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
2. Executar `supabase/migrations/202607110001_attual_one_foundation.sql` pelo fluxo de migrations/CLI ou SQL Editor.
3. Em Authentication > URL Configuration, cadastrar a URL do ambiente e `/auth/callback` como redirect autorizado.
4. Em Authentication > Providers, habilitar Email e definir a política de confirmação desejada.
5. Manter cadastro público desabilitado e criar usuários por convite enquanto não houver painel administrativo.
6. Criar a primeira linha em `companies` e vincular o primeiro usuário em `company_users` com papel `owner`.
7. Preencher `public_profile`, `public_store_enabled` e `public_store_open` para liberar o catálogo público.
8. Revisar os cenários de `supabase/RLS-CENARIOS.md` usando dois usuários e duas empresas antes de dados reais.
9. Executar as RPCs em ambiente de teste com pedidos reais de homologação.
10. Alterar `NEXT_PUBLIC_DATA_MODE=supabase` apenas após os passos anteriores.

## O que não deve ser configurado no frontend

- `service_role` key.
- Senha do banco.
- JWT secret.
- Tokens de provedores externos.
- Credenciais de pagamento.

## Limites desta fundação

- O MVP local permanece o fallback e não é removido.
- A importação não inicia automaticamente.
- A loja pública em modo Supabase ainda precisa de uma RPC pública estreita para checkout anônimo; as políticas atuais concedem somente leitura pública segura.
- O envio de e-mail depende do provedor/configuração de SMTP do Supabase.
- Nenhum projeto remoto foi criado, nenhuma migration foi executada externamente e nenhuma chave foi inventada.

## Arquitetura de transição

- `lib/repositories/factory.ts` decide entre adaptadores.
- Adaptadores locais mantêm os serviços homologados.
- Adaptadores Supabase convertem valores entre reais da UI e centavos do banco.
- Operações críticas usam RPC, não múltiplas chamadas independentes do cliente.
- Componentes continuam sem importar Supabase diretamente; autenticação e migração usam módulos dedicados.

# Etapa 8 — Plano curto de migração Supabase

## Backup e inventário

- Backup lógico anterior às alterações: `work/backups/attual-one-etapa7-logical-20260711.zip`.
- Chaves locais preservadas: `attual-one:catalog:v1`, `attual-one:commerce:v1`, `attual-one:rewards:v1` e `attual-one:storefront:v1`.
- Serviços existentes: catálogo/estoque, comércio/clientes/pedidos, recompensas/pagamentos, loja/checkout e analytics somente leitura.
- Contratos existentes permanecem válidos; novos repositórios serão adaptadores paralelos.

## Plano

1. Adicionar configuração validada e clientes Supabase separados para browser e servidor.
2. Criar schema SQL completo, RLS multiempresa, auditoria e RPCs atômicas/idempotentes.
3. Adicionar autenticação e proteção administrativa com fallback local explícito durante desenvolvimento.
4. Criar contratos de repositório e seleção `local | supabase`, sem acoplar componentes.
5. Criar utilitário manual de prévia/importação das quatro chaves locais, sem execução automática.
6. Cobrir configuração, seleção de modo e migração com testes; validar regressão completa.

## Estratégia progressiva

- `NEXT_PUBLIC_DATA_MODE=local` mantém o MVP homologado como padrão.
- `NEXT_PUBLIC_DATA_MODE=supabase` só é aceito com URL e chave pública configuradas.
- A chave `service_role` nunca é usada no browser e não faz parte das variáveis públicas.
- A migração é iniciada manualmente, com prévia, mapeamento determinístico, prevenção de duplicidade e relatório.

# AGENTS — ATTUAL ONE PLATFORM

Use as referência de governança o repositório `Grupo-Lira-de-Comunicacao/atlas-core`, especialmente `ATLAS_CORE_RULES.md` e `AGENTS.md`.

## Projeto
Este repositório contém a plataforma ATTUAL ONE.

## Diretrizes locais
- Antes de editar, inspecione a arquitetura, dependências, variáveis de ambiente e integrações existentes.
- Preserve compatibilidade com produção e com integrações do ecossistema.
- Faça alterações incrementais, testáveis e reversíveis.
- Preserve contratos de integração com Casting 360 e serviços relacionados.
- Para banco de dados, prefira migrations seguras e mantenha políticas de acesso consistentes.
- Nunca exponha segredos, tokens ou credenciais em código, commits ou logs.
- Execute os testes e validações disponíveis antes de concluir uma alteração.

# ATTUAL ONE Platform MVP

Plataforma SaaS do ecossistema Grupo Lira, construída em Next.js e preparada para evolução incremental entre modo local e backend Supabase.

## Executar localmente

```bash
npm install
npm run dev
```

## Validação

```bash
npm run lint
npm run type-check
npm run build
```

## Estado atual

- Design system e layout responsivo
- Navegação lateral e cabeçalho
- Módulos de catálogo, clientes, pedidos, pagamentos, fidelidade e relatórios
- Fundação Supabase, autenticação e multiempresa
- PWA básica
- Receptor de integração do Casting Attual 360 em `POST /api/integrations/casting/events`
- Persistência idempotente dos eventos de integração preparada por migration

## Deployment canônico

O deployment canônico deve usar exclusivamente o repositório `Grupo-Lira-de-Comunicacao/attual-one-platform`.

## Integração Casting Attual 360

O receptor exige autenticação por bearer token em `ATTUAL_ONE_INTEGRATION_SECRET`, cabeçalho `idempotency-key` e persistência na tabela `casting_integration_events`.

A ativação completa em produção depende das variáveis de ambiente do backend e da aplicação das migrations no projeto Supabase correspondente ao ATTUAL ONE.
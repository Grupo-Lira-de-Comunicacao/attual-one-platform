# Etapa 13 — Loja pública em modo Supabase

Status: preparação técnica.

## Achado de continuidade

As antigas pendências de criação de pedido e de pagamentos/cupons/fidelidade no adaptador Supabase já foram resolvidas nas Etapas 10 e 11. A pendência restante para vendas públicas em modo Supabase é a loja pública, que ainda usa `StorefrontService` local (`localStorage`).

## Objetivo

Conectar a loja pública ao Supabase sem abrir escrita genérica para `anon`.

## Requisitos de segurança

- Checkout anônimo por RPC estreita `security definer`.
- Identificar a empresa por `slug` público e validar `public_store_enabled=true`.
- Nunca aceitar `company_id` arbitrário vindo do navegador.
- Recalcular preços, disponibilidade e estoque no banco; nunca confiar em valores enviados pelo cliente.
- Idempotência obrigatória por chave de submissão.
- Pedido criado com `source='store'`, `status='new'` e `payment_status='pending'`.
- Entrega exige endereço.
- Cupom, quando informado, deve ser validado no banco.
- Sem baixa de estoque no checkout; a baixa continua em `confirm_order`, preservando a regra atual do ONE.

## Próxima implementação

1. Migration aditiva com RPC de checkout público.
2. Adaptador TypeScript para leitura pública de empresa/catálogo e chamada da RPC.
3. Loja seleciona adaptador conforme `NEXT_PUBLIC_DATA_MODE`.
4. Testes estruturais e regressão do modo local.
5. Homologação em um projeto Supabase exclusivo do ATTUAL ONE antes de ativar produção.

## Infraestrutura

O projeto Supabase atualmente conectado foi inspecionado em 04/08/2026 e contém tabelas do ATLAS (`atlas_*` e `requests`), não o schema do ATTUAL ONE. Ele não deve receber as migrations do ONE sem decisão arquitetural explícita.

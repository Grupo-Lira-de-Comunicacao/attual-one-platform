# Etapa 4 — Pagamentos, Cupons e Fidelidade

## Entregas

- Registro e atualização de pagamentos vinculados a pedidos, com Pix, dinheiro, crédito e débito.
- Status pendente, pago e estornado sincronizado com o pedido.
- Cupons percentuais ou de valor fixo, pedido mínimo, validade, limite de uso e status.
- Validação e cálculo reutilizável de desconto.
- Programa de fidelidade configurável por pontos ou compre-e-ganhe.
- Crédito idempotente de pedidos concluídos para clientes identificados.
- Painéis responsivos de pagamentos, cupons e ranking de fidelidade.

## Decisões técnicas

- Dados persistem na chave versionada `attual-one:rewards:v1`.
- `RewardsService` integra pedidos por meio de `CommerceService`, mantendo a interface fora do armazenamento.
- Pagamentos alteram o status correspondente no pedido.
- Pedidos concluídos são creditados uma única vez pela lista `creditedOrderIds`.
- Cupons nunca produzem desconto maior que o subtotal.
- Supabase e autenticação permanecem desconectados.

## Testes

- CRUD e cálculo de cupons.
- Regras de validade e pedido mínimo.
- Registro e sincronização de pagamento.
- Crédito idempotente de fidelidade.
- Configuração de programa.

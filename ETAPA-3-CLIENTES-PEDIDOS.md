# Etapa 3 — Clientes e Pedidos

## Entregas

- Cadastro, edição, busca, filtros e exclusão de clientes, preservando o histórico dos pedidos.
- Pedidos sequenciais com cliente opcional, itens reais do catálogo, adicionais, observações, atendimento, entrega, pagamento e valores.
- Quadro por status e visualização alternativa em tabela.
- Detalhes completos, edição antes da confirmação e mudanças de status.
- Baixa automática do estoque na confirmação e devolução no cancelamento com motivo.
- Dados iniciais com seis clientes e oito pedidos.

## Decisões técnicas

- `CommerceService` concentra regras e armazenamento na chave versionada `attual-one:commerce:v1`.
- O serviço usa `CatalogService` como integração única com catálogo e estoque; a interface não grava diretamente no `localStorage`.
- A disponibilidade e o saldo de todos os itens são validados antes de qualquer baixa.
- O campo `stockApplied` impede baixas duplicadas e controla a devolução no cancelamento.
- Movimentações automáticas usam o histórico já existente do estoque, com referência ao número do pedido.
- A exclusão de um cliente remove apenas o vínculo; nome, telefone e histórico permanecem no pedido.
- O consumidor não identificado é representado sem `customerId`.
- Entregas exigem rua e número; desconto jamais pode produzir total negativo.
- Todas as entidades mantêm `companyId`, preparando a futura migração multiempresa para Supabase.
- Supabase e autenticação continuam sem conexão.

## Testes automatizados

- Cadastro e edição de cliente.
- Criação, sequência e cálculo de pedido.
- Baixa única de estoque na confirmação.
- Cancelamento com motivo e devolução.
- Bloqueio de produto esgotado.
- Persistência após reconstrução do serviço.
- Mudança de status.
- Endereço obrigatório e total não negativo.

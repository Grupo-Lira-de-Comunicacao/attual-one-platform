# Etapa 5 — Dashboard real e relatórios

## Entregas

- Dashboard substituído por indicadores calculados dos serviços locais.
- Filtros de hoje, 7 dias e 30 dias.
- Vendas, pedidos, ticket médio, clientes, recebimentos, operação e alertas de estoque.
- Séries temporais, pedidos recentes e ranking real de produtos.
- Relatórios de produtos, clientes, pedidos, pagamentos e estoque.
- Exportação de resumo em CSV.

## Decisões técnicas

- `AnalyticsService` é somente leitura e não duplica dados no `localStorage`.
- Pedidos cancelados não compõem vendas nem ticket médio.
- Recebimentos usam exclusivamente pagamentos registrados como pagos.
- Rankings são agregados a partir dos itens e clientes dos pedidos armazenados.
- Alertas e valor de estoque são calculados do catálogo atual.
- O período usa a data operacional mais recente armazenada como referência, mantendo dados de demonstração coerentes sem fabricar valores.
- A interface apresenta zero ou listas vazias quando não há dados.
- Supabase e autenticação permanecem desconectados.

## Testes

- Cálculo de indicadores e ticket médio.
- Consolidação de produtos e clientes.
- Atualização após mudanças nos serviços reais.
- Estoque, alertas e valor armazenado.
- Séries temporais e distribuição de status.

# Etapa 2 — Produtos, Categorias e Estoque

## Escopo implementado

- CRUD de categorias com nome, descrição, status e ordem.
- CRUD de produtos com preços, promoção, imagem por URL, SKU, categoria, status e configuração de estoque.
- Entrada, saída e ajuste manual com motivo obrigatório e histórico.
- Alertas de estoque baixo e mudança automática para esgotado ao atingir zero.
- Busca, filtros, confirmações, mensagens de retorno e interface responsiva.
- Dados iniciais da Hamburgueria 07 com quatro categorias e nove produtos.

## Decisões técnicas

- `CatalogService` concentra persistência, validações e regras locais. A interface não acessa `localStorage` diretamente.
- O armazenamento usa uma chave versionada (`attual-one:catalog:v1`) e um contrato mínimo `StorageAdapter`, permitindo substituir o adaptador pelo Supabase sem reescrever a interface.
- Todas as entidades carregam `companyId`, antecipando o modelo multiempresa da especificação.
- Imagens de demonstração aceitam URL. Arquivos binários não são persistidos no `localStorage` para evitar limites e problemas de desempenho.
- Movimentações registram saldo anterior, saldo resultante, tipo, quantidade, motivo e data.
- Categorias com produtos vinculados não podem ser excluídas; o usuário deve mover os produtos primeiro.
- O status `inativo` é preservado nas movimentações. Para produtos ativos com controle de estoque, saldo zero define `esgotado` e saldo positivo define `disponível`.
- O Supabase e a autenticação permanecem sem conexão nesta etapa.

## Cobertura automatizada

- Cadastro, edição e exclusão de categorias e produtos.
- Entrada, saída e ajuste de estoque.
- Rejeição de saldo negativo e movimentação sem motivo.
- Alerta de estoque baixo e esgotamento automático.
- Persistência após reconstrução do serviço, simulando recarga da página.
- Validações de nome, categoria e preço.

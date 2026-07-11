# Etapa 6 — Loja do Cliente e Checkout

## Entregas

- Rota pública `/loja`, sem menu administrativo.
- Identidade configurável da Hamburgueria 07, horário e estado aberto/fechado.
- Categorias, busca e produtos reais do catálogo, incluindo promoções e indisponibilidade.
- Carrinho persistente com quantidade, adicionais e observações.
- Checkout identificado ou anônimo, retirada, entrega ou consumo local.
- Cupom validado pelo `RewardsService`, pedido criado pelo `CommerceService` e pagamento pendente registrado.
- Confirmação com número, resumo, status e linha do tempo.
- Persistência do último pedido e limpeza do carrinho.

## Decisões técnicas

- `StorefrontService` orquestra os serviços existentes; não replica catálogo, pedidos ou pagamentos.
- O carrinho usa a chave versionada `attual-one:storefront:v1`.
- O identificador `submissionId` registra o pedido criado e torna o checkout idempotente contra duplo clique.
- Catálogo e estoque são revalidados no momento do checkout.
- O cupom é recalculado antes de criar o pedido e seu uso é incrementado somente após sucesso.
- Pagamentos da loja começam como pendentes, respeitando o fluxo operacional atual.
- Configuração fictícia de abertura fica isolada no estado da loja para futura migração ao painel e Supabase.
- Supabase e autenticação permanecem desconectados.

## Testes

- Inclusão, alteração, remoção e persistência do carrinho.
- Limites de estoque e produto esgotado.
- Aplicação de cupom.
- Checkout de retirada e entrega.
- Criação real de pedido e pagamento.
- Idempotência contra envio duplicado.
- Limpeza e persistência do último pedido.
- Bloqueio da loja fechada.

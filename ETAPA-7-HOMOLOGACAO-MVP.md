# Etapa 7 — Homologação funcional do MVP

## Resultado

Homologação funcional concluída sobre catálogo, estoque, clientes, pedidos, pagamentos, cupons, fidelidade, loja pública, dashboard e relatórios. Nenhum módulo novo foi criado.

## Cobertura validada

- Catálogo: categoria, produto, edição, entradas, saídas, mínimo, esgotamento e recarga.
- Clientes: cadastro, edição, busca e vínculo com histórico de pedidos.
- Pedidos: criação, edição anterior à confirmação, confirmação idempotente, status, cancelamento e devolução.
- Pagamentos: Pix, dinheiro, crédito e débito nos estados pendente, pago e estornado.
- Cupons: percentual, fixo, pedido mínimo, validade, limite e inatividade.
- Fidelidade: pontos, prevenção de duplicidade, compre-e-ganhe, ranking e estorno após cancelamento.
- Loja: busca, categorias, esgotamento, carrinho, adicionais, observação, cupom, modalidades, anonimato, identificação, idempotência e último pedido.
- Indicadores: hoje, 7 dias, 30 dias, vendas, ticket, produtos, clientes, pagamentos, estoque e estado vazio.
- Interface: desktop, tablet e celular; menu lateral; loja pública; ausência de rolagem horizontal indevida.
- Qualidade: serviços integrados, mensagens de domínio, console e acessibilidade básica.

## Correções realizadas

1. **Estorno de fidelidade:** a sincronização acumulava créditos de um pedido concluído mesmo quando ele era cancelado posteriormente. A conta agora é reconstruída deterministicamente a partir dos pedidos que permanecem concluídos. Isso preserva idempotência e remove pontos, selos e recompensas do pedido cancelado.
2. **Acessibilidade de janelas administrativas:** modais de catálogo, pedidos, clientes, pagamentos, cupons e fidelidade receberam nome acessível e botão de fechamento identificado.

## Validação no navegador

- Dashboard carregou indicadores reais, quatro métricas e menu operacional sem erros de console.
- Em tablet, o menu lateral recolhe corretamente e não há estouro horizontal.
- Em celular, o menu abre corretamente e ocupa o viewport sem estouro.
- Loja pública carregou nove produtos, busca, filtros e produto esgotado bloqueado.
- Busca reduziu a grade, categoria filtrou produtos e o carrinho móvel refletiu item e total.
- Carrinho apresentou adicionais, observação, quantidade e resumo.
- Relatórios exibiram quatro consolidações e o acionamento da exportação CSV não gerou erro de console.

## Pendências reais antes do Supabase

- Migrar as quatro chaves versionadas do `localStorage` para banco multiempresa com `company_id`, transações e políticas RLS.
- Implementar autenticação, papéis e seleção segura de empresa.
- Tornar confirmação de pedido, baixa de estoque, pagamento, cupom e fidelidade uma transação atômica no backend.
- Substituir a configuração fictícia de abertura da loja por horários e exceções configuráveis no painel.
- Armazenar imagens em Storage e validar URLs/arquivos no servidor.
- Criar auditoria persistente com usuário responsável pelas alterações.
- Adicionar testes E2E permanentes em navegador para os fluxos críticos e integração contínua.
- Concluir auditoria WCAG: foco preso em modais, retorno de foco, navegação completa por teclado, contraste e rótulos de todos os botões somente com ícone.
- Definir arredondamento monetário em centavos inteiros no backend para evitar ponto flutuante.
- Validar CPF/CNPJ, telefone, CEP e e-mail conforme regras de produção.
- Implementar recuperação segura para corrupção, migração de versão ou limite do armazenamento local.
- Definir conciliação, comprovantes e integração real com provedor de pagamentos.

## Restrições preservadas

- Supabase desconectado.
- Autenticação não implementada.
- ATTUAL ONE Insight não alterado.

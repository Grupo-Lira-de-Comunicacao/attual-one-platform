# Cenários RLS

## Permitidos
- Membro ativo lê dados da própria empresa.
- Owner gerencia vínculos e configuração da empresa.
- Owner, manager, attendant e operator executam operações autorizadas; funções RPC validam associação e integridade.
- Visitante anônimo lê apenas empresa com loja pública, categorias ativas, produtos públicos e opções ativas.

## Bloqueados
- Usuário sem vínculo não lê registros operacionais.
- Membro da empresa A não lê nem altera `company_id` da empresa B.
- Não-owner não cria, altera ou remove vínculos de usuários.
- Visitante anônimo não lê clientes, pedidos, estoque, pagamentos, cupons privados, fidelidade, importações ou auditoria.
- Cliente público não escolhe `company_id` arbitrário em gravações; checkout futuro deve usar uma função pública estreita com slug e idempotência.

## Testes manuais no SQL Editor
1. Criar dois usuários e duas empresas.
2. Vincular cada usuário somente à própria empresa.
3. Executar consultas com JWT de cada usuário e confirmar isolamento cruzado.
4. Testar cada papel contra `company_users` e configuração da empresa.
5. Usar chave anônima para confirmar somente leitura pública do catálogo autorizado.

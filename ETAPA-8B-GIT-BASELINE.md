# Etapa 8B — Baseline Git do ATTUAL ONE MVP

## Resultado

Repositório Git inicializado na raiz do projeto e commit único de baseline criado com o estado homologado até a Etapa 8. Nenhum código funcional foi alterado nesta etapa.

## O que foi feito

1. **Inicialização**: `git init -b main` na raiz atual. O diretório `.git` existia previamente, porém vazio/não inicializado; foi criado do zero.
2. **Identidade local do repositório** (não altera configuração global): `user.name = splira`, `user.email = splira@gmail.com`.
3. **Revisão do `.gitignore`** antes do primeiro commit. Conteúdo final:
   ```
   /node_modules
   /.npm-cache
   /.next
   /out
   /.env*
   !.env.example
   *.tsbuildinfo
   /test-results
   /work/*.log
   ```
   A linha `/work/*.log` foi adicionada nesta etapa para excluir logs de execução do `npm run dev` (`work/dev-err.log`, `work/dev-out.log`, ambos vazios).
4. **Verificação de segredos** antes de commitar: `.env.local`, chaves `service_role`, senhas de banco, JWT secret ou credenciais de pagamento — nenhum presente em qualquer arquivo rastreado. Apenas `.env.example` (sem valores reais) foi versionado.
5. **Branch principal**: `main`.
6. **Commit único de baseline** (root commit, sem histórico anterior): 86 arquivos, 8886 inserções.
   - Mensagem: `chore: baseline homologada do ATTUAL ONE MVP até etapa 8`
7. **Nenhum remoto configurado** — repositório permanece local.

## Confirmação — não versionados

| Item | Status |
|---|---|
| `node_modules` | ✅ Ignorado (`/node_modules`), não rastreado |
| `.next` | ✅ Ignorado (`/.next`), não rastreado |
| `.env.local` | ✅ Ignorado (`/.env*` com exceção só de `.env.example`), não rastreado |
| Arquivos com chaves/segredos | ✅ Nenhum encontrado nos arquivos rastreados; `.env.local` (onde ficariam credenciais Supabase) está fora do versionamento |
| Logs | ✅ `work/*.log` ignorado; `.npm-cache` também ignorado |
| Arquivos temporários | ✅ `*.tsbuildinfo`, `/.npm-cache`, `/out`, `/test-results` ignorados |

## Conteúdo do commit de baseline

Inclui: código-fonte de `app/`, `components/`, `lib/`; migration SQL (`supabase/migrations/202607110001_attual_one_foundation.sql`) e `supabase/RLS-CENARIOS.md`; suíte de testes (`tests/*.test.mjs`); toda a documentação de etapas (`README.md`, `DECISOES_TECNICAS.md`, `ETAPA-2` a `ETAPA-8`, `CONTINUIDADE-CLAUDE-ATTUAL-ONE.md`); especificação oficial (`ATTUAL_ONE_Especificacao_MVP_v1.docx`); configuração de build (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`); `.env.example` (sem valores); e o backup lógico da Etapa 7 (`work/backups/attual-one-etapa7-logical-20260711.zip`).

## Saída de `git status` ao final

```
On branch main
nothing to commit, working tree clean
```

## Observação sobre o histórico anterior

Um commit inicial havia sido criado em interação anterior desta sessão com uma mensagem diferente, antes de a mensagem exata desta etapa ser especificada. Como o repositório é local, sem remoto configurado e sem histórico anterior a preservar, esse commit único foi reescrito (`git commit --amend`) para conter exatamente a mensagem solicitada nesta etapa, evitando duplicar o baseline com dois commits redundantes.

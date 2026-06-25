# VF-STAGING-GATE-002 Evidence

Data: 2026-06-25  
Status: BLOCKED para UAT  
Escopo: corrigir bloqueios reais de staging sem declarar UAT liberado.

## Repositorio

- Repositorio local: `vistoria-facil-ia-staging`
- Branch local: `main`
- Remote configurado: `origin https://github.com/vistoriafacilia-bot/vistoria-facil-ia-e2e.git`
- Commit local do gate: gerado no branch `main`; consultar `git log --oneline -2` para o hash atual.
- Push remoto: nao executado. A tentativa de `git push origin main` foi bloqueada pelo revisor de seguranca por exportar codigo/documentos para GitHub sem aprovacao explicita adicional no momento da execucao.

## Implementado neste gate

- CI remoto em `.github/workflows/e2e.yml` com job manual `deploy-staging-and-real-e2e`.
- Autenticacao Google Cloud em CI via `google-github-actions/auth@v2`, aceitando `GCP_SERVICE_ACCOUNT_STAGING` ou alias legado `FIREBASE_SERVICE_ACCOUNT_STAGING`.
- Deploy do backend `server.ts` em Cloud Run com `Dockerfile`, `PORT` dinamico e variaveis de ambiente de staging.
- Rewrites do Firebase Hosting para `/api/**` apontando para Cloud Run `vistoria-facil-api-staging` em `southamerica-east1`.
- Firebase Auth real automatizavel por Email/Password com usuario tecnico E2E, habilitado somente em build controlado por `VITE_STAGING_E2E_AUTH=true`.
- Nenhum uso de `VITE_E2E_MODE=true` ou aliases mock no fluxo staging real.
- Seed/cleanup real em `scripts/staging-e2e-data.mjs` com `STAGING_TEST_RUN_ID`, IDs deterministicos e credenciais Email/Password.
- Firestore real com namespace por `testRunId` nos documentos de propriedade/vistoria/comodo/foto.
- Storage real para fotos em `inspection-photos/{uid}/{inspectionId}/{photoId}.jpg`, com upload, leitura por URL e cleanup.
- Storage real para PDFs com delete permitido para cleanup do proprio usuario.
- Suite `VF-E2E-001` a `VF-E2E-010` atualizada para usuario tecnico, dados seeded e validacao real de `/api/health`, Storage e PDF.

## Secrets e variaveis esperados no GitHub Environment `staging`

- `FIREBASE_PROJECT_ID_STAGING`
- `FIRESTORE_DATABASE_ID`
- `FIREBASE_API_KEY`
- `FIREBASE_STORAGE_BUCKET`
- `GEMINI_API_KEY_STAGING`
- `MERCADOPAGO_ACCESS_TOKEN_STAGING`
- `STAGING_BASE_URL`
- `STAGING_E2E_EMAIL`
- `STAGING_E2E_PASSWORD`
- `GCP_SERVICE_ACCOUNT_STAGING` ou `FIREBASE_SERVICE_ACCOUNT_STAGING`
- Variaveis opcionais alinhadas ao `firebase.json`: `CLOUD_RUN_REGION=southamerica-east1`, `CLOUD_RUN_SERVICE=vistoria-facil-api-staging`

## Validacoes executadas localmente

- `npm run lint`: PASS
- `npm run build`: PASS, com warning nao bloqueante de chunks acima de 500 kB.
- `npm run qa:staging`: PASS
- `node --check scripts/staging-e2e-data.mjs`: PASS
- `npm run e2e:staging`: BLOCKED
- `VF-PUSH-SAFETY-CHECK FINAL`: PASS, 84 arquivos versionados, 0 blockers, 1 warning de Firebase Web API key publica em `firebase-applet-config.json`.

## Push operacional

Primeira tentativa contra remote incorreto:

```text
remote: Repository not found.
fatal: repository 'https://github.com/gustavorother/vistoria-facil-ia-e2e.git/' not found
```

Interpretacao: o remoto informado nao esta acessivel neste ambiente. Causas provaveis: repositorio ainda nao existe nessa URL, usuario/token GitHub sem acesso ao repositorio privado, ou credencial GitHub nao configurada para HTTPS.

Correcao aplicada em 2026-06-25:

```text
git remote set-url origin https://github.com/vistoriafacilia-bot/vistoria-facil-ia-e2e.git
git ls-remote origin
git push origin main
```

Resultado: PASS para push.

```text
To https://github.com/vistoriafacilia-bot/vistoria-facil-ia-e2e.git
 * [new branch]      main -> main
```

Branch remota confirmada:

```text
cdeb550de8cfae6d4a6c7ee38ebe03ee55f51098 refs/heads/main
```

GitHub Actions run gerado pelo push:

- URL: `https://github.com/vistoriafacilia-bot/vistoria-facil-ia-e2e/actions/runs/28195631904`
- Status: `completed`
- Conclusion: `failure`
- Job `gates-and-e2e`: `failure`
- Passo falho: `Playwright E2E`
- Job `deploy-staging-and-real-e2e`: `skipped`
- Logs detalhados do job: bloqueados sem autenticacao API (`403`).

## Resultado Playwright local sem mocks

Comando: `npm run e2e:staging`  
Modo: sem `VITE_E2E_MODE=true`; `VITE_STAGING_E2E_AUTH=true` apenas para expor login tecnico real.  
Resultado: 1 failed, 9 skipped.

Bloqueio:

```text
STAGING_AUTH_BLOCKED: formulario Email/Password real de staging esta disponivel,
mas STAGING_E2E_EMAIL/STAGING_E2E_PASSWORD nao foram definidos no CI.
```

Artefatos gerados:

- `playwright-report-staging/index.html`
- `test-results/staging-e2e-results.json`
- `test-results/vf-real-staging-VF-E2E-001-60cf9-ito-e-tela-inicial-carregam-chromium-real-staging/test-failed-1.png`
- `test-results/vf-real-staging-VF-E2E-001-60cf9-ito-e-tela-inicial-carregam-chromium-real-staging/video.webm`
- `test-results/vf-real-staging-VF-E2E-001-60cf9-ito-e-tela-inicial-carregam-chromium-real-staging/trace.zip`

## Deploy remoto

Nao executado com sucesso nesta maquina porque ainda faltam credenciais operacionais:

- GitHub Environment `staging` e secrets nao foram configurados nesta sessao: `gh` nao esta instalado e nao ha `GH_TOKEN`, `GITHUB_TOKEN` ou `GITHUB_PAT` no ambiente local.
- Secrets locais tambem ausentes: `GCP_SERVICE_ACCOUNT_STAGING`, `FIREBASE_SERVICE_ACCOUNT_STAGING`, `GOOGLE_APPLICATION_CREDENTIALS`, `STAGING_E2E_EMAIL`, `STAGING_E2E_PASSWORD`.
- O workflow remoto de deploy staging e E2E real exige `workflow_dispatch`; nao foi possivel disparar por API sem token GitHub.
- Firebase/GCP deploy requer service account valida com permissoes para Firebase Hosting, Firestore Rules, Storage Rules, Cloud Run, Artifact Registry e Cloud Build.
- Firebase Auth staging requer provider Email/Password habilitado e usuario tecnico criado.

## Divergencias mocks vs real

- Auth mock/local nao exige provider nem usuario real; staging real exige Email/Password habilitado, usuario tecnico e secrets `STAGING_E2E_EMAIL/STAGING_E2E_PASSWORD`.
- E2E local mockava `/api/analyze-image`; staging real exige Cloud Run e `GEMINI_API_KEY_STAGING`. O teste `VF-E2E-009` bloqueia se `/api/health` nao responder ou `geminiConfigured=false`.
- Mocks de Firestore nao aplicam regras nem indices; seed/cleanup real agora escreve sob `testRunId` e deve passar pelas regras publicadas.
- Fluxo antigo de foto mantinha base64 apenas em Firestore; staging real agora faz upload/leitura em Firebase Storage e preserva base64 somente como fallback de PDF/IA.
- Hosting estatico sozinho nao atende `/api`; staging real agora depende de rewrite para Cloud Run.
- Cleanup real precisa de regras de delete em Storage; regras foram ajustadas para fotos e PDFs do proprio usuario.

## Bloqueios remanescentes

- Push para GitHub remoto correto: PASS.
- Workflow remoto de push executou, mas falhou no passo local `Playwright E2E`.
- Workflow remoto manual `deploy-staging-and-real-e2e` ainda nao executado.
- GitHub Environment `staging` e secrets reais ainda nao comprovados/configurados nesta sessao.
- Deploy Firebase Hosting/Rules/Storage ainda nao comprovado em staging real.
- Deploy Cloud Run ainda nao comprovado em staging real.
- Seed/cleanup real ainda nao comprovados contra projeto Firebase real.
- `VF-E2E-001` a `VF-E2E-010` ainda nao passaram contra URL staging real.

## Decisao UAT

UAT NAO LIBERADO. O gate permanece bloqueado ate haver push remoto, deploy staging real, seed/cleanup real e suite `VF-E2E-001` a `VF-E2E-010` passando contra `STAGING_BASE_URL` sem mocks.

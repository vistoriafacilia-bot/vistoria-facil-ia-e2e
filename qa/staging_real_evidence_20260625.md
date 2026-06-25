# Evidencia staging real - 2026-06-25

Status: **BLOCKED**

UAT: **nao liberado**

## Base

- Pacote promovido: `vistoria_facil_v0_4_0_rc2_codex_e2e_fix_20260625.zip`
- Repositorio local: `vistoria-facil-ia-staging`
- Branch: `main`
- Commit base: `6060ed6 Promote rc2 package with E2E staging gates`
- Remote configurado: `https://github.com/gustavorother/vistoria-facil-ia-e2e.git`

## GitHub remoto / CI

Configurado localmente:

- `.github/workflows/e2e.yml`
- Job local: lint, test, build, QA gates, Playwright mockado.
- Job manual `deploy-staging-and-real-e2e` com environment `staging`.
- Secrets esperados:
  - `FIREBASE_PROJECT_ID_STAGING`
  - `FIREBASE_SERVICE_ACCOUNT_STAGING`
  - `FIRESTORE_DATABASE_ID`
  - `FIREBASE_API_KEY`
  - `GEMINI_API_KEY_STAGING`
  - `MERCADOPAGO_ACCESS_TOKEN_STAGING`
  - `STAGING_BASE_URL`

Bloqueio remoto:

- `git push -u origin main`
- Resultado: `fatal: could not read Username for 'https://github.com': terminal prompts disabled`
- Diagnostico: credencial GitHub indisponivel nesta sessao.
- Efeito: CI remoto ainda nao foi executado.

## Firebase staging

Configurado localmente:

- `firebase.json`
- `.env.staging.example`
- `npm run deploy:staging:firebase`

Validacao Firebase CLI:

- `firebase-tools --version`: `15.22.1`
- `firebase projects:list --non-interactive`: FAIL
- Erro: `Failed to authenticate, have you run firebase login?`

Bloqueio:

- Sem `firebase login` ou `FIREBASE_SERVICE_ACCOUNT_STAGING`, nao foi feito deploy de Hosting, Firestore Rules ou Storage Rules.
- Nenhum projeto Firebase real foi alterado.

## Playwright real sem mocks

Suite executada:

- `npm run e2e:staging`
- Config: `playwright.staging.config.ts`
- `VITE_E2E_MODE`: removido
- `E2E_MODE`: removido
- Resultado: `10 failed / 0 passed`

Falha comum:

`STAGING_AUTH_BLOCKED: staging real abriu tela de login Google. A suite sem VITE_E2E_MODE precisa de uma estrategia automatizada de Auth real.`

Evidencias geradas:

- `playwright-report-staging/`
- `test-results/staging-e2e-results.json`
- `test-results/**/trace.zip`
- `test-results/**/test-failed-1.png`
- `test-results/**/video.webm`

## Divergencias mocks vs integracoes reais

1. Auth
   - Mock: usuario ja nasce autenticado.
   - Real: app abre Google OAuth interativo, sem caminho automatizavel em CI.
   - Impacto: bloqueia VF-E2E-001 a VF-E2E-010 antes do fluxo principal.

2. Firestore
   - Mock: localStorage seeded com usuario, entitlement e imovel.
   - Real: depende de usuario autenticado, regras reais e dados seeded no projeto staging.
   - Impacto: persistencia de imovel, vistoria, comodos, fotos e historico ainda nao foi provada em Firestore real.

3. Storage
   - Mock: upload retorna URL local fake.
   - Real: precisa Storage Rules, bucket real e upload autenticado.
   - Impacto: fotos e PDF persistente ainda nao foram provados em Storage real.

4. API/IA
   - Mock local: `/api/analyze-image` pode ser interceptado nos testes.
   - Real staging: `server.ts` precisa estar publicado como backend; Firebase Hosting estatico sozinho nao atende endpoints `/api`.
   - Impacto: analise IA, Mercado Pago/webhook e PDF com IA dependem de deploy backend controlado.

5. Deploy
   - Mock/local: Vite preview executa frontend e backend local via scripts.
   - Real: Firebase Hosting cobre frontend estatico; `server.ts` exige Cloud Run/Functions/AI Studio equivalente.
   - Impacto: publicar apenas Hosting nao representa o app completo.

## Proximo gate necessario

Antes de UAT:

- Autenticar GitHub e fazer push.
- Configurar GitHub Actions environment `staging`.
- Provisionar Firebase staging com Auth, Firestore, Storage e rules.
- Definir estrategia de Auth automatizada para staging real.
- Publicar backend `server.ts` em ambiente staging controlado.
- Rodar `VF-E2E-001` a `VF-E2E-010` contra `STAGING_BASE_URL` sem `VITE_E2E_MODE=true`.
- So considerar evolucao para UAT se a suite real passar.

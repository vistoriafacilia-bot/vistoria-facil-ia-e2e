# SR-01 - Evidence Matrix

## Regra geral

Toda evidencia deve ser redigida antes de ser anexada. Secrets, cookies, tokens, service accounts e `storageState` bruto nao devem ser publicados.

| Evidencia | Arquivo/URL esperado | Origem | Redacao obrigatoria | Gate |
| --- | --- | --- | --- | --- |
| Git remote status | bloco em `staging_real_evidence_<timestamp>.md` | `git remote -v`, `git status` | token/URL com credencial | SR01-T001 |
| Commit hash remoto | bloco em evidencia | `git rev-parse`, GitHub UI/API | nenhuma se hash publico | SR01-T001 |
| GitHub Actions run URL | URL do run | GitHub Actions | nenhuma se repo privado controlado | SR01-T002 |
| Firebase deploy output | log redigido | GitHub Actions/Firebase CLI | service account, tokens, emails | SR01-T003 |
| Hosting URL staging | URL | Firebase Hosting | nenhuma | SR01-T004 |
| Cloud Run service URL | URL | GCP/Cloud Run | nenhuma | SR01-T005 |
| `firebase.json` rewrite validado | trecho ou hash | repo | nenhuma | SR01-T006 |
| `/api/health` response | JSON redigido | curl/Playwright/API test | headers auth | SR01-T005/SR01-T006 |
| Playwright report | `playwright-report-staging/` | Playwright | screenshots com dados pessoais | SR01-T016 |
| E2E JSON results | `test-results/staging-e2e-results.json` | Playwright | tokens/cookies | SR01-T016 |
| Auth storageState gerado | status/hash, nao arquivo bruto | Playwright setup | cookies/tokens | SR01-T007/SR01-T008 |
| Firestore test report | markdown/json redigido | script/test | ids pessoais, emails | SR01-T009 |
| Storage test report | markdown/json redigido | script/test | signed URLs, tokens | SR01-T010 |
| Firebase Admin report | markdown/json redigido | backend integration | service account | SR01-T011 |
| IA/backend report | markdown/json redigido | API test | prompt sensivel, API key | SR01-T012 |
| Mercado Pago sandbox report | markdown/json redigido | API/webhook test | access token, payer PII | SR01-T013/SR01-T014 |
| Entitlement report | markdown/json redigido | Firestore/backend test | emails/UID se necessario hashear | SR01-T015 |
| Secret redaction report | markdown/json | scan local/artifacts | nenhuma | SR01-T018 |
| Blockers report | `sr01_blockers.md` atualizado | manual + CI | nenhuma | SR01-T019 |
| Staging evidence consolidated | `qa/staging_real_evidence_<timestamp>.md` | consolidacao | todos secrets | SR01-T020 |

## Evidencia minima para liberar proximo gate

- Git remote validado.
- CI remoto executado.
- Firebase deploy staging concluido.
- Cloud Run backend publicado.
- Hosting rewrite validado.
- Auth E2E automatizavel.
- Firestore/Storage reais testados.
- Mercado Pago sandbox validado.
- VF-E2E-001 a VF-E2E-010 passing.
- Secret redaction passing.
- P0/P1/P2 = 0.


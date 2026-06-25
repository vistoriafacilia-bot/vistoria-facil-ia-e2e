# SR-01 - Test Plan

## Objetivo

Definir os testes minimos antes de qualquer UAT. A suite deve provar que staging real esta operacional, seguro e coerente com os mocks locais.

## Gates obrigatorios

- P0/P1/P2 = 0.
- Nenhum secret em logs/evidencias.
- Nenhum recurso de producao alterado.
- Nenhum pagamento real.
- Playwright real sem dependencia de Google OAuth interativo.

## Testes minimos antes de UAT

| ID | Teste | Tipo | Resultado esperado | Severidade se falhar |
| --- | --- | --- | --- | --- |
| SR01-T001 | Git push remoto validado | integration | commit remoto existe | P1 |
| SR01-T002 | GitHub Actions roda no branch staging/main | integration | workflow conclui ou falha com evidencia clara | P1 |
| SR01-T003 | Firebase deploy staging autenticado por service account | integration | deploy sem login interativo | P1 |
| SR01-T004 | Firebase Hosting carrega frontend staging | smoke | URL responde app | P1 |
| SR01-T005 | `/api/health` responde em Cloud Run | smoke | HTTP 200 | P1 |
| SR01-T006 | Hosting rewrite `/api/**` chega no Cloud Run | smoke | HTTP 200 via Hosting | P1 |
| SR01-T007 | Auth staging automatizavel sem Google OAuth | integration | login/setup passa | P1 |
| SR01-T008 | Playwright gera/reusa `storageState` | integration | storageState criado e usado sem exposicao | P1 |
| SR01-T009 | Firestore read/write conforme regras | integration | permitido/negado conforme contrato | P1 |
| SR01-T010 | Storage upload/read/delete staging | integration | arquivo controlado persiste e remove | P1 |
| SR01-T011 | Backend usa Firebase Admin corretamente | integration | Admin le/escreve staging permitido | P1 |
| SR01-T012 | IA/backend responde contrato staging | integration | resposta valida ou mock staging declarado | P1 |
| SR01-T013 | Mercado Pago sandbox cria pagamento | integration | preference/payment sandbox criado | P1 |
| SR01-T014 | Webhook/retorno sandbox processado | integration | status persistido | P1 |
| SR01-T015 | Entitlement pos-pagamento funciona | integration | usuario ganha acesso em staging | P1 |
| SR01-T016 | Fluxo app login -> fotos -> relatorio -> salvar -> consultar | E2E | passa em staging real | P1 |
| SR01-T017 | E2E real sem mock enganoso | E2E | `VITE_E2E_MODE` ausente/false na suite real | P1 |
| SR01-T018 | Logs/evidencias sem secrets | quality | redaction report passa | P0 |
| SR01-T019 | P0/P1/P2 = 0 | gate | sem bloqueadores | P1 |
| SR01-T020 | RC staging real congelado antes de UAT | release | pacote de evidencias completo | P1 |

## Suite VF-E2E real

- VF-E2E-001: login e tela inicial carregam.
- VF-E2E-002: abre escolha Entrada/Saida.
- VF-E2E-003: Comecar Vistoria avanca.
- VF-E2E-004: criar/renomear comodos persiste.
- VF-E2E-005: historico retoma rascunho.
- VF-E2E-006: falhas nao salvam rascunho silenciosamente.
- VF-E2E-007: fotos por comodo persistem.
- VF-E2E-008: Concluir & Revisar bloqueia sem foto.
- VF-E2E-009: vistoria salva e historico reabre.
- VF-E2E-010: reload mantem estado esperado.

## Regressao mock/local

Antes de rodar staging real:

- `npm run lint`
- `npm run test:ci`
- `npm run build`
- `npm run qa:performance`
- `npm run qa:rc`
- `npm run qa:staging`
- `npm run e2e:local`

## Criterio de aprovacao

- Todos os testes minimos passam.
- VF-E2E-001 a VF-E2E-010 passam contra staging real.
- Relatorios e traces anexados.
- Divergencias mock vs real documentadas.
- Nenhum P0/P1/P2 aberto.
- UAT ainda nao executado; apenas liberavel como proximo gate.


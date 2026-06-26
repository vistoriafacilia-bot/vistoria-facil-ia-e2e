# VF Manual UAT Regression - 2026-06-26

Status: PASS

URL testada: http://127.0.0.1:5179
Run ID: manual_regression_1782496646646
Inicio: 2026-06-26T17:57:26.647Z
Fim: 2026-06-26T17:57:42.325Z

## Bugs cobertos

- Bug Ver Planos: PASS
- Bug persistencia de comodos apos logout/login: PASS

## Causa raiz

- Ver Planos: PlanGate redirecionava automaticamente para a home quando encontrava entitlement ativo, parecendo que o clique nao fazia nada.
- Comodos: reidratacao de rascunho podia recriar o template default quando a lista persistida vinha vazia; agora defaults sao criados apenas ao iniciar uma nova vistoria.

## Validacoes

- Login tecnico por e-mail/senha: PASS
- Modal/tela de planos aberta: PASS
- free_10 visivel: PASS
- beta_paid_4990 visivel: PASS
- Mensagem upgrade assistido: PASS
- Criar imovel/local: PASS
- Criar vistoria: PASS
- Renomear comodo: PASS
- Adicionar comodo: PASS
- Deletar comodo: PASS
- Navegacao interna preservou comodos: PASS
- Logout/login preservou comodos: PASS
- Banco confirmou estado persistido: PASS
- Cleanup: PASS

## Runtime

- Console errors criticos: 0
- Page errors: 0
- Failed requests: 0
- HTTP errors: 0

## Cleanup

- Cleanup total: PASS
- Leftovers: {"propertiesRows":0,"inspectionsRows":0,"roomsRows":0,"photosRows":0,"reportsRows":0,"entitlementsRows":0,"eventsRows":0,"profileRows":0,"authUserExists":false}

## Arquivos alterados

- src/components/PlanGate.tsx
- src/components/InspectionWizard.tsx
- src/App.tsx
- package.json
- scripts/run-manual-uat-regression.mjs
- tests/e2e/vistoria-uat-minimum.spec.ts
- qa/vf_manual_uat_regression_20260626.md

## Decisao

UAT manual pode recomecar como rodada controlada apos publicacao do novo commit. UAT nao foi liberado automaticamente.



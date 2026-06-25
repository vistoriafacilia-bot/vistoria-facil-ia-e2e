# SR-02 - Worktree Triage + Secret Hygiene

Status: Bloqueado

UAT: nao executado
Deploy: nao executado
Push: nao executado

## Git

- Branch: $branch
- Remote:
~~~
origin	https://github.com/gustavorother/vistoria-facil-ia-e2e.git (fetch)
origin	https://github.com/gustavorother/vistoria-facil-ia-e2e.git (push)
~~~

## Worktree

Estado: sujo

Arquivos classificados:

- qa/staging-real-unlock/ | status=?? | categoria=unknown | pode_commitar=False | risco=unknown: manual review required

## Secret scan

- Status: failed
- Findings: 31
- P0: 2
- P1: 0

- .env.staging.example:7 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:11 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:12 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:14 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:16 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:24 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:25 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:26 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- .gitignore:17 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:21 pattern=apiKey severity=P0 classification=possible_secret_in_tracked_file value=REDACTED
- server.ts:22 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:29 pattern=access_token severity=P0 classification=possible_secret_in_tracked_file value=REDACTED
- server.ts:32 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:63 pattern=Bearer severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:64 pattern=Bearer severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:68 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:108 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:109 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:171 pattern=Authorization severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:213 pattern=Authorization severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:225 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:248 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:275 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:289 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:327 pattern=Authorization severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:368 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:372 pattern=Authorization severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:392 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:435 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:469 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- server.ts:495 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED

## .gitignore

Status: adequate

- .env: ok
- .env.*: ok
- service account json: ok
- playwright/.auth: ok
- storageState*.json: ok
- test-results: ok
- playwright-report: ok
- node_modules: ok
- dist: ok
- build: ok
- sensitive evidence: ok

## Arquivos criticos

- .env tracked: False
- service account json tracked: 0
- storageState tracked: 0

## P0/P1/P2

- P0: 2
- P1: 0
- P2: 1

## Decisao

Nao criar commit ate resolver bloqueios.

Mensagem planejada:

chore(staging): add SR-01 unlock plan and staging readiness docs

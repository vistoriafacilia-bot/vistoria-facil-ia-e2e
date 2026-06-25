# SR-02 - Worktree Triage + Secret Hygiene

Status: Bloqueado

UAT: nao executado
Deploy: nao executado
Push: nao executado

## Git

- Branch: main
- Remote: origin https://github.com/gustavorother/vistoria-facil-ia-e2e.git
- Bloqueio operacional: git_process_count=11; index_lock_exists=True

## Worktree

Estado: sujo

Arquivos classificados:

- qa/staging-real-unlock/evidence/sr02_git_status_snapshot_20260625142700.txt | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low but superseded by corrected report
- qa/staging-real-unlock/evidence/sr02_git_status_snapshot_20260625143052.txt | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low but superseded by corrected report
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625143052.json | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low
- qa/staging-real-unlock/evidence/sr02_worktree_triage_report_20260625142700.json | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low but superseded by corrected report
- qa/staging-real-unlock/evidence/sr02_worktree_triage_report_20260625142700.md | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low but superseded by corrected report
- qa/staging-real-unlock/evidence/sr02_worktree_triage_report_20260625143052.json | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low
- qa/staging-real-unlock/evidence/sr02_worktree_triage_report_20260625143052.md | status=untracked_or_pending | categoria=evidence_sanitized | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_auth_e2e_strategy.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_backend_deploy_decision.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_blockers.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_dor.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_evidence_matrix.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_manifest.json | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_required_secrets_template.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_staging_real_unlock_plan.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low
- qa/staging-real-unlock/sr01_test_plan.md | status=untracked_or_pending | categoria=sr01_doc | pode_commitar=True | risco=low

## Secret scan

- Status: passed
- Findings: 100
- P0: 0
- P1: 0
- Observacao: o relatorio 20260625142700 foi superado porque classificou referencias process.env como P0.

- .env.staging.example:7 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:11 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:12 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:14 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:16 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:24 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:25 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- .env.staging.example:26 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- .github/workflows/e2e.yml:80 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- .github/workflows/e2e.yml:82 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- .github/workflows/e2e.yml:83 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- .github/workflows/e2e.yml:86 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- .github/workflows/e2e.yml:114 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- .github/workflows/e2e.yml:134 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- .gitignore:17 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:13 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:24 pattern=api_key severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:35 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:46 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:57 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:68 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:79 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:90 pattern=password severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:101 pattern=service_account severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:112 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:123 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:134 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:145 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:156 pattern=Bearer severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:167 pattern=Bearer severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:178 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:189 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:200 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:233 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:244 pattern=apiKey severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:255 pattern=access_token severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:266 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:288 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:310 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED
- qa/staging-real-unlock/evidence/sr02_secret_scan_report_20260625142700.json:321 pattern=MERCADO_PAGO severity=info classification=reference_or_placeholder value=REDACTED

## .gitignore

Status: adequate

## Arquivos criticos

- .env exists: False
- .env.local exists: False
- service account json count: 0
- storageState json count: 0
- tracked validation: blocked_by_git_index_lock

## P0/P1/P2

- P0: 0
- P1: 1
- P2: 0

## Commit local

Criado: nao

Motivo: ativo git.exe e .git/index.lock tornam o commit local inseguro nesta etapa.

## Decisao

Bloqueado. Resolver estado do Git e rerodar SR-02 antes de commit local.

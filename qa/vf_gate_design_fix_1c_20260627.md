# Gate Design Fix 1C

Status: GATE_DESIGN_FIXED

## Repository
- Repo path: C:\Users\gusta\OneDrive\Documentos\Growth Agent - Vistoria Facil\vistoria-facil-ia-app-invariants-20260627142620
- Branch: qa/app-invariants-core-p0-20260627142620
- HEAD: 34ecea9

## Git Status Before
```text
 M package.json
?? docs/governance/vistoria_facil_ia_uat_manual_rc_itens_1_2_3_consolidado.md
?? qa/vf_gate_preparation_1a_20260627.json
?? qa/vf_gate_preparation_1a_20260627.md
?? scripts/run-item4-gate-contract.mjs
```

## Scope
- Product code changed: no.
- QA scripts changed: yes.
- package.json changed only for QA command targets.
- OpenAI called during this command: no.
- Supabase/Storage real touched during this command: no.
- .env.local touched: no.
- Commit/push/deploy: no.

## Gate Mapping After Fix
- qa:app-invariants-core-p0 -> scripts/run-item4-gate-runner.mjs --gate=app-invariants-core-p0
- qa:photo-storage-no-ai-p0 -> scripts/run-item4-gate-runner.mjs --gate=photo-storage-no-ai-p0
- qa:ai-review-p0 -> scripts/run-item4-gate-runner.mjs --gate=ai-review-p0
- qa:report-p0-certification -> scripts/run-item4-gate-runner.mjs --gate=report-p0-certification
- qa:uat-release-candidate -> scripts/run-item4-gate-runner.mjs --gate=uat-release-candidate
- qa:inspection-lifecycle-p0 -> scripts/run-persistence-p0.mjs --inspection-lifecycle

## Anti-False-Pass Changes
- The old contract-only script is no longer a package command target.
- The old contract-only script now exits with BLOCKED_GATE_DESIGN_REPLACED if called directly.
- The new runner executes real child gates where executable coverage exists.
- Missing executable coverage returns BLOCKED_GATE_COVERAGE instead of PASS.
- qa:uat-release-candidate stops on the first mandatory failed or blocked gate.
- qa:ai-review-p0 forces UAT_AI_CONTROLLED_MAX_PHOTOS=3 and does not use dry-run.
- qa:report-p0-certification requires fresh evidence from the IA/review gate and rejects stale or incomplete evidence.

## Coverage Notes
- app-invariants-core-p0 delegates to qa:uat-core-certification.
- inspection-lifecycle-p0 remains the real lifecycle gate.
- photo-storage-no-ai-p0 is intentionally blocking until a real UI photo CRUD no-IA runner exists.
- ai-review-p0 delegates to the controlled IA runner with Item 4 cost limits.
- report-p0-certification validates fresh report evidence from the IA/review runner, including reportWorked, cleanupOk, and cost guard fields.

## Remaining Dependency
- Full Item 4 cannot pass until qa:photo-storage-no-ai-p0 has executable UI photo CRUD no-IA coverage or product behavior supports a safe no-IA upload path.

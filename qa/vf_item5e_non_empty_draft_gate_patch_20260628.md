# Item 5E - Non-empty draft gate patch

Status: PATCH_READY_FOR_GATE_RETRY

## Scope

- Product code changed: no
- QA gate changed: yes, `scripts/run-uat-real-complete.mjs`
- Supabase schema changed: no
- Storage touched outside gate: no
- OpenAI calls: 0
- `.env.local` changed: no
- Commit/push/deploy: no

## Confirmed Cause

The previous `Continuar Rascunho` FAIL_CORE was caused by the QA gate creating an empty draft, returning to history, and expecting the draft to remain listed. Current product behavior treats a draft with only default rooms and no meaningful content as empty and removes or filters it.

## Patch Applied

The gate now renames the first default room from `Sala` to a run-specific marker before returning to history:

- `Sala Rascunho <run suffix>`

This makes the draft meaningful under the existing lifecycle rule without changing product behavior. The later room-mapping step reuses this marker as the source room name, so the rest of the gate can continue converting default rooms into inventory-derived room names.

## Validation Run

Command executed:

`npm run qa:app-invariants-core-p0`

Observed result:

- `qa:uat-core-certification`: `BLOCKED`, `exitCode=2`
- `qa:app-invariants-core-p0`: `BLOCKED_GATE_COVERAGE`
- The run blocked before inventory/matrix execution and before reaching the patched `Continuar Rascunho` path.
- No new functional product failure was captured in this run.

## Evidence

- `qa/vf_item4_app_invariants_core_p0_runner_20260627.json`
- `qa/vf_item4_app_invariants_core_p0_runner_20260627.md`
- `qa/vf_uat_core_certification_20260627.json`
- `qa/vf_uat_core_certification_20260627.md`
- `qa/vf_item5e_non_empty_draft_gate_patch_20260628.md`
- `qa/vf_item5e_non_empty_draft_gate_patch_20260628.json`

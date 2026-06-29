# Item 5D - Continuar Rascunho FAIL_CORE diagnostic

Status: DIAGNOSIS_READY

## Scope

- No gates executed in this diagnostic step.
- No product code changed.
- No test code changed.
- No Supabase or Storage access performed.
- No OpenAI calls performed.
- No commit, push, or deploy performed.

## Evidence Reviewed

- `qa/vf_uat_core_certification_20260627.json`
- `qa/vf_uat_core_certification_20260627.md`
- `qa/vf_item4_app_invariants_core_p0_runner_20260627.json`
- `qa/vf_item4_app_invariants_core_p0_runner_20260627.md`
- `test-results/uat-governance/real_complete_1782644777764_principal_functional_evidence_without_photo_registry_text.png`

## Finding

The failure is most likely a gate/test flow mismatch with the current UX rule for empty drafts, not a confirmed P0 product bug.

The product creates the inspection and its default rooms, but a draft with only the default room set and no photos/reports/summary is treated as empty. When the gate clicks "Voltar para historico", `InspectionWizard` attempts to discard that empty draft. The history list also filters empty drafts. After that, `scripts/run-uat-real-complete.mjs` expects a `Continuar Rascunho` button and times out.

The screenshot captured by the gate shows the active inspection wizard with default rooms and `0 / 50 fotos`, before any meaningful room/photo/report content was added. That matches the empty-draft rule.

## Responsible Lines

- `scripts/run-uat-real-complete.mjs:304-306`: `openDraftFromHistory()` waits for history and clicks `getByRole('button', { name: /Continuar Rascunho/i }).first()`.
- `scripts/run-uat-real-complete.mjs:830-835`: the core gate creates/opens the primary inspection, goes back to history, then immediately calls `openDraftFromHistory(page)`.
- `src/components/InspectionWizard.tsx:780-805`: `handleBackToHistory()` deletes an empty draft before returning to history.
- `src/lib/inspectionLifecycle.ts:18-53`: draft-empty rule; `em_andamento`/`rascunho` with only default rooms and no meaningful content is empty.
- `src/App.tsx:96-118`: history list enriches inspections and filters out `isEmptyDraft`.
- `src/App.tsx:627-633`: `Continuar Rascunho` is only rendered for a non-final inspection that remains in the filtered history list.

## Classification

- A) P0 functional real: unlikely from current evidence.
- B) Test/seletor desatualizado: yes, more specifically a gate flow mismatch.
- C) Mudanca esperada de UX: yes, current code documents that drafts resume through history, while lifecycle code also discards empty drafts.
- D) Rascunho nao criado: no; evidence indicates the inspection screen opened. More precise: draft was created/opened, then considered empty and discarded/filtered before resume.
- E) Tela errada/timing: unlikely; the timeout follows a deterministic empty-draft path, and runtime evidence has no critical console/page/network failures.

## Minimal Next Action

Patch only the QA gate flow, not product: before leaving the primary inspection, make the draft meaningful in the same way a user would, for example by renaming one default room or adding a non-default room, then return to history and click `Continuar Rascunho`. Alternatively, change this specific assertion to validate the intentional empty-draft discard behavior separately and keep resume coverage for a non-empty draft.

Do not classify this as a product P0 unless a non-empty draft fails to appear in history or cannot be resumed.

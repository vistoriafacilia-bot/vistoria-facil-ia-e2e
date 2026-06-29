# Gate Preparation 1A - Item 4

Status: GATE_PREPARATION_READY

## Repository
- Repo path: C:\Users\gusta\OneDrive\Documentos\Growth Agent - Vistoria Facil\vistoria-facil-ia-app-invariants-20260627142620
- Branch: qa/app-invariants-core-p0-20260627142620
- HEAD: 34ecea9

## Git Status Before
```text
?? docs/governance/vistoria_facil_ia_uat_manual_rc_itens_1_2_3_consolidado.md
```

This pending document was explicitly allowed by the Comando 1A contract.

## Files Changed By This Preparation
- package.json
- scripts/run-item4-gate-contract.mjs
- qa/vf_gate_preparation_1a_20260627.md
- qa/vf_gate_preparation_1a_20260627.json

## Gates Created
- qa:app-invariants-core-p0
- qa:photo-storage-no-ai-p0
- qa:ai-review-p0
- qa:report-p0-certification
- qa:uat-release-candidate

## Gates Adjusted
- qa:inspection-lifecycle-p0 remains mapped to scripts/run-persistence-p0.mjs --inspection-lifecycle.
- qa:inspection-lifecycle-p0 is now explicitly composed into the future qa:uat-release-candidate contract.

## Package Commands Added
- npm run qa:app-invariants-core-p0
- npm run qa:photo-storage-no-ai-p0
- npm run qa:ai-review-p0
- npm run qa:report-p0-certification
- npm run qa:uat-release-candidate

## Item 4 Coverage Mapped

### qa:app-invariants-core-p0
- Auth/session login, logout, login again, session resume.
- Property CRUD and persistence checkpoints.
- Inspection lifecycle, history, drafts, and resume by inspection_id.
- Rooms CRUD and default overwrite guard.
- UI x Supabase validation for user_id, property_id, inspection_id, room_id.
- Cleanup with OpenAI calls 0.

### qa:inspection-lifecycle-p0
- Existing P0 lifecycle gate for inspection drafts, default-only drafts, history, rooms, related entities, and cleanup.
- Included in the future release-candidate gate sequence.

### qa:photo-storage-no-ai-p0
- Photo upload/read/replace/delete when supported, without IA.
- UI x Supabase Storage validation for photo_id, room_id, inspection_id, storage_path.
- Stop if upload path calls OpenAI before the IA gate.
- Cleanup Storage objects and rows.

### qa:ai-review-p0
- Privacy Guard before IA.
- Maximum 3 approved photos, maximum 3 OpenAI calls.
- No automatic reanalysis.
- Human accept/edit/reject when supported; missing reject is GAP_PRODUCT_DECISION.
- Review persistence after reopen, reload, logout-login.
- Cost guard R$ 0,45 base / R$ 0,75 stress.

### qa:report-p0-certification
- Final report/PDF with persisted property, inspection, rooms, photos, and reviewed observations.
- Validate report through functional evidence, not fragile text only.
- Confirm report remains coherent after reload and logout-login.

### qa:uat-release-candidate
- Future composition sequence: lint, build, app invariants, lifecycle, photo/storage no-IA, AI review, report certification.
- Stop on P0, unexpected cost, OpenAI before IA block, secret exposure, or cleanup failure.

## Safety Confirmations
- Product code changed: no.
- OpenAI called: no.
- IA executed: no.
- Supabase/Storage data created: no.
- .env.local touched: no.
- Secrets printed or versioned: no.
- Commit: no.
- Push: no.
- Deploy: no.

## Remaining Risks / Gaps
- This command prepares gate contracts and package commands; it does not certify the RC.
- The future Item 4 execution still needs to run the gates against the real app and generate functional evidence.
- Delete/reject flows unsupported by current product must be classified as GAP_PRODUCT_DECISION during execution, not hidden.
- If upload automatically triggers IA during the no-cost photo gate, qa:photo-storage-no-ai-p0 must stop with a cost guard failure.

## Recommendation
Ready for Comando 1B / Floki review of the prepared gate coverage before executing Item 4.

# Item 5F - qa:uat-core-certification BLOCKED after 5E

Status: DIAGNOSIS_READY

## Scope

- No gates executed in this diagnostic step.
- No product code changed.
- No test code changed.
- No Supabase or Storage access performed.
- No OpenAI calls performed.
- `.env.local` was not modified.
- No commit, push, or deploy performed.

## Evidence Reviewed

- `qa/vf_item5e_non_empty_draft_gate_patch_20260628.md`
- `qa/vf_item5e_non_empty_draft_gate_patch_20260628.json`
- `qa/vf_uat_core_certification_20260627.md`
- `qa/vf_uat_core_certification_20260627.json`
- `qa/vf_item4_app_invariants_core_p0_runner_20260627.md`
- `qa/vf_item4_app_invariants_core_p0_runner_20260627.json`
- `scripts/run-uat-real-complete.mjs`

## Exact Block Point

The current BLOCKED occurs at startup configuration validation in `scripts/run-uat-real-complete.mjs`, before the functional matrix can run and before the 5E draft-resume patch is reached.

Responsible lines:

- `scripts/run-uat-real-complete.mjs:751-753`: loads runtime env and throws on missing `VITE_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- `scripts/run-uat-real-complete.mjs:52-55`: redacts any message containing `key`, `service_role`, `secret`, etc.
- `scripts/run-uat-real-complete.mjs:1039-1064`: outer `run().catch(...)` writes fallback evidence with `inventory.rooms=[]`, `totalValidPhotos=0`, and `matrix=[]`.

Observed runtime indicators:

- `qa:uat-core-certification`: `BLOCKED`, exit code `2`
- `qa:app-invariants-core-p0`: `BLOCKED_GATE_COVERAGE`
- `startedAt` and `finishedAt` are effectively the same instant.
- `matrix=[]`
- `runtime.expectedHttpResponses=0`
- No browser/auth/public URL phase was reached.
- Current process env presence check, without values:
  - `VITE_SUPABASE_URL`: absent
  - `SUPABASE_SERVICE_ROLE_KEY`: absent
  - `UAT_REAL_COMPLETE_PHOTO_ROOT`: absent, so default is used
- `.env.local` presence check: absent
- Default photo root is present and contains 158 `.jpg` plus 1 `.zip`.

## Cause

The probable original error is:

`missing required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY`

That message is redacted to `[redacted sensitive message]` because it contains `SERVICE_ROLE_KEY`, matching the broad redaction rule. The fallback catch then overwrites the useful partial startup state, making the evidence look like there was no photo inventory even though the photo data is available.

## Classification

- Ambiente/configuração: yes, primary cause.
- Redaction: yes, hides safe variable names and blocks direct diagnosis in the evidence.
- Gate instrumentation: yes, outer fallback evidence discards partial inventory/matrix state.
- Dados de teste: no, default photo root is available and has valid photos.
- Auth/login: no, the flow did not reach login.
- URL pública: no, the flow did not reach `page.goto`.
- Produto/P0 funcional: no confirmed product failure in this run.
- Schema: no evidence; Supabase client was not created.

## 5E Patch Validity

The 5E patch remains valid. This run blocked before the code path that renames the default room and before the later `Continuar Rascunho` assertion. There is no evidence that the 5E adjustment failed.

## Minimal Next Action

Provide `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the `qa:uat-core-certification` process without printing values, then rerun only the allowed gate.

If a follow-up patch is authorized, the smallest QA instrumentation improvement is to report missing env variable names without values and preserve safe startup inventory in the outer catch.

# Item 5B - qa:uat-core-certification blocker diagnostic

Status: DIAGNOSIS_READY

## Scope

- No gates executed in this diagnostic step.
- No product code changed.
- No Supabase or Storage access performed.
- No OpenAI calls performed.
- `.env.local` was not opened or modified.
- No commit, push, or deploy performed.

## Finding

The most likely blocker is environment/configuration, not missing photo test data and not a confirmed product bug.

`qa:uat-core-certification` maps to `node scripts/run-uat-real-complete.mjs --mode=core-certification`.

The script uses:

- Photo path source: `process.env.UAT_REAL_COMPLETE_PHOTO_ROOT || 'E:\\AI - Aprendizado\\VistoriaFacilIA\\Fotos para Testes'`
- Required runtime config before functional execution: `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

Observed local data check, without listing file names:

- `photoRoot` exists.
- Valid image count under `photoRoot`: 158 `.jpg`
- Other file count under `photoRoot`: 1 `.zip`
- Directory count under `photoRoot`: 11

So `rooms=0`, `totalValidPhotos=0`, and `matrix=[]` in the failed evidence are probably fallback output from the script's global catch, not the real photo inventory state.

## Responsible Script Behavior

Responsible script: `scripts/run-uat-real-complete.mjs`

Relevant behavior:

- Inventory is attempted at startup by `inventoryPhotos()`.
- The functional matrix is initialized after inventory creation.
- Required env is checked after the inventory case is added.
- Any uncaught startup error is handled by the outer `run().catch(...)`.
- That outer catch writes a new fallback evidence object with `inventory.rooms=[]`, `totalValidPhotos=0`, and `matrix=[]`, discarding any partial inventory/matrix state.

This explains why the evidence looks like no inventory was mounted even when the local acervo exists.

## Redaction Diagnosis

The error was redacted too aggressively by `sanitizeMessage()`.

Current redaction returns `[redacted sensitive message]` when a message contains any of:

- `token`
- `key`
- `password`
- `service_role`
- `authorization`
- `secret`

A likely original error is the missing-config error emitted by:

`missing required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY`

Because that message contains `SERVICE_ROLE_KEY`, the whole message is replaced with `[redacted sensitive message]`. This protects values, but it also hides safe variable names and blocks diagnosis.

## Gate Dependency On Photos

Fase A does not upload photos and is intended to keep OpenAI cost at zero.

However, the current implementation still depends on the local photo directory to derive room names and inventory/cost metadata before running Fase A. The acervo is therefore required for current gate coverage even though photos are not uploaded in core-certification mode.

## Classification

- Primary classification: environment/configuration blocker.
- Secondary classification: gate instrumentation/reporting issue.
- Not classified as missing test data: the local `photoRoot` exists and has valid images.
- Not classified as product bug: the functional matrix did not run.
- Not classified as Supabase/Storage failure: no Supabase/Storage request was performed in this diagnostic.
- Redaction issue: yes, over-redaction hides missing variable names.

## Minimal Next Action

Make `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` available to the `qa:uat-core-certification` process without printing values, then retry the allowed gate.

If a code patch is authorized next, the smallest QA-runner improvement is to change `scripts/run-uat-real-complete.mjs` so missing env variable names are reported without values and the global catch preserves safe inventory metadata instead of writing `rooms=0` fallback evidence.

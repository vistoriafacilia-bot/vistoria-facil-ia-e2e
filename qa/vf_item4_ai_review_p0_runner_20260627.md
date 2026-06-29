# Item 4 Gate Runner - ai-review-p0

Status: BLOCKED_GATE_COVERAGE

## Real Execution Mapping
- Run scripts/run-uat-ai-controlled-contract.mjs with UAT_AI_CONTROLLED_MAX_PHOTOS=3.
- Use approved dataset path from UAT_AI_CONTROLLED_DATASET_PATH or the script default.
- Fail on more than 3 photos, more than 3 OpenAI calls, fallback, missing useful suggestion, missing persistence, or cleanup failure.

## Anti-False-Pass Guard
- The child IA runner performs dataset governance before upload.
- The wrapper forces the Item 4 limit to 3 photos/calls.
- The gate cannot pass in dry-run mode because this wrapper does not pass --dry.

## Runtime Summary
- OpenAI calls allowed in this gate: yes
- OpenAI calls observed by this wrapper: 0
- Supabase/Storage may be touched when executed: yes
- Product code changed by this gate: no

## Steps
- qa:ai-review-p0.real-runner: BLOCKED - exitCode=2
- qa:ai-review-p0: BLOCKED_GATE_COVERAGE - qa:ai-review-p0.real-runner BLOCKED exitCode=2

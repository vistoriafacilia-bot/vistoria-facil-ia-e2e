# Item 4 Gate Runner - app-invariants-core-p0

Status: FAIL_CORE

## Real Execution Mapping
- Run npm run qa:uat-core-certification as the executable no-cost core invariant gate.
- Fail immediately if the core gate fails, blocks, or reports unexpected cost.
- Do not call OpenAI in this gate.

## Anti-False-Pass Guard
- This runner never returns PASS only because a contract was generated.
- Any missing executable coverage returns BLOCKED_GATE_COVERAGE.
- Any failed mandatory child gate prevents success.

## Runtime Summary
- OpenAI calls allowed in this gate: no
- OpenAI calls observed by this wrapper: 0
- Supabase/Storage may be touched when executed: yes
- Product code changed by this gate: no

## Steps
- qa:uat-core-certification: FAIL - exitCode=1
- app-invariants-core-p0: FAIL_CORE - qa:uat-core-certification FAIL exitCode=1

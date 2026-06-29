# Item 4 Gate Runner - uat-release-candidate

Status: FAIL_CORE

## Real Execution Mapping
- Run npm run lint.
- Run npm run build.
- Run npm run qa:app-invariants-core-p0.
- Run npm run qa:inspection-lifecycle-p0.
- Run npm run qa:photo-storage-no-ai-p0.
- Run npm run qa:ai-review-p0.
- Run npm run qa:report-p0-certification.
- Stop on first failing or blocked mandatory gate.

## Anti-False-Pass Guard
- This runner never returns PASS only because a contract was generated.
- Any missing executable coverage returns BLOCKED_GATE_COVERAGE.
- Any failed mandatory child gate prevents success.

## Runtime Summary
- OpenAI calls allowed in this gate: yes
- OpenAI calls observed by this wrapper: 0
- Supabase/Storage may be touched when executed: yes
- Product code changed by this gate: no

## Steps
- lint: FAIL - spawnSync npm.cmd EINVAL
- qa:uat-release-candidate: FAIL_CORE - lint failed to start: spawnSync npm.cmd EINVAL

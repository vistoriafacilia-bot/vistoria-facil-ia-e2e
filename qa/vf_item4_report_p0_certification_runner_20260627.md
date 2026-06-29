# Item 4 Gate Runner - report-p0-certification

Status: BLOCKED_GATE_COVERAGE

## Real Execution Mapping
- Validate fresh report evidence emitted by the authorized IA/review gate.
- Require reportWorked=true, status=PASS, cleanupOk=true, and no cost guard breach.
- Reject stale evidence unless ITEM4_ALLOW_REPORT_EVIDENCE_REUSE=true is explicitly set.

## Anti-False-Pass Guard
- This runner never returns PASS only because a contract was generated.
- Any missing executable coverage returns BLOCKED_GATE_COVERAGE.
- Any failed mandatory child gate prevents success.

## Runtime Summary
- OpenAI calls allowed in this gate: no
- OpenAI calls observed by this wrapper: 0
- Supabase/Storage may be touched when executed: no
- Product code changed by this gate: no

## Steps
- fresh-report-evidence: BLOCKED_GATE_COVERAGE - REPORT_EVIDENCE_FRESHNESS_REQUIRED: run through qa:uat-release-candidate or set ITEM4_RC_STARTED_AT

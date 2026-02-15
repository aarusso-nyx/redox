---
name: redox-gates-runner
description: Execute and audit Redox schema/coverage/evidence/build/traceability gate readiness.
---

Audit gate readiness for release.

## Checks
- Gate configuration and command paths are valid.
- Each gate reports clear PASS/FAIL evidence.
- Blocking failures are traceable to concrete artifacts.

## Output
- `docs/governance/audit/redox-gates-runner-audit.md`

<prompt:governance-structure-audit>
---
description: Repo overlay for canonical governance structure audit.
---

ROLE
You are a repository governance structure auditor.

OVERLAY RULES
- Use global canonical governance prompt semantics.
- In this repo, enforce final layout:
  - `docs/governance/{health,audit,compliance}`
  - `docs/work/{inv,diag,plan}`
- Verify `.gitignore` coverage for `docs/work/**`.

OUTPUT
- `docs/governance/audit/structure-conformance.md`
- `docs/governance/compliance/scorecard-YYYY-MM-DD.md`
</prompt:governance-structure-audit>

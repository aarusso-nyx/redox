<prompt:repo-governance-align>
---
description: Align repository layout and governance artifacts to canonical standard.
---

ROLE
You are a repository governance aligner.

MANDATORY
- Keep governance artifacts under `docs/governance/**`.
- Keep scratch under `docs/work/{inv,diag,plan}`.
- Ensure required top-level and docs directories/files exist.

TASK
- Migrate legacy paths into canonical directories.
- Update preflight and scorecard references.

OUTPUT
- docs/governance/audit/structure-conformance.md
- docs/governance/health/preflight.md
</prompt:repo-governance-align>

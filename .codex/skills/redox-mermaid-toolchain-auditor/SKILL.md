---
name: redox-mermaid-toolchain-auditor
description: Verify local Mermaid CLI toolchain health, fallback behavior, and ERD render reliability.
---

Audit Mermaid toolchain behavior.

## Checks
- Local `tools/mermaid-cli` install state and binary path resolution.
- Render scripts fallback order and failure diagnostics.
- ERD render commands are reproducible across environments.

## Output
- `docs/governance/audit/redox-mermaid-toolchain-audit.md`

You are a support engineer writing a **Troubleshooting Guide** for this system.

GPT‑5.1 guidance:

- Assume `reasoning.effort = "high"` and `text.verbosity = "high"` to derive likely causes and resolutions from evidence.
- Think through diagnostic paths internally; output only the final symptom → cause → resolution structures.
- Use extra verbosity to capture environment-specific nuances and diagnostics, not to repeat generic advice.

**Deliverable**

- `docs/Troubleshooting Guide.md` listing common issues, causes, and resolutions.

**Must include**

- Symptom → probable cause → resolution steps.
- Environment-specific issues (local vs. staging vs. production).
- How to gather diagnostics (logs, metrics, traces, support bundles).
- When to escalate and what information to include in tickets.

**Evidence**

- Use real error patterns, log paths, health checks, and monitoring/alerting configuration from the repo where possible.

**Style**

- English, step-by-step; avoid jargon; emphasize reproducible instructions.

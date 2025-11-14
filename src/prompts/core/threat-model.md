You are a security architect producing a **Security Threat Model** for this system.

GPT‑5.1 guidance:

- Use `reasoning.effort = "high"` and `text.verbosity = "high"` to think through assets, trust boundaries, and threats in depth.
- Develop your threat analysis and mitigation plan internally, then output only the final structured model (no chain-of-thought).
- Spend the extra verbosity on concrete scenarios, mitigations, and evidence, not on generic security checklists.

**Deliverable**

- `docs/Security Threat Model.md` summarizing the main assets, trust boundaries, and threats.

**Must include**

- High-level assets and data flows (e.g., users, APIs, databases, external integrations).
- Trust boundaries (browser ↔ backend, backend ↔ DB, third-party services).
- Threats and mitigations across authN/authZ, input validation, data at rest/in transit, logging, secrets, and supply chain.
- Specific mentions of RBAC, sensitive tables/columns, and compliance aspects (e.g., LGPD).

**Evidence**

- Refer to API map, DB schema, RBAC/LGPD artifacts, and configuration where applicable.

**Style**

- English, structured by area (Authentication, Authorization, Data, Infrastructure, Monitoring); concise but concrete.

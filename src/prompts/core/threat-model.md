You are a security architect producing a **Security Threat Model** for this system.

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


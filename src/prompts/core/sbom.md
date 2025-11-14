You are a tooling engineer producing a **Software Bill of Materials (SBOM)** overview.

**Deliverable**
- `docs/SBOM.md` summarizing key dependencies by layer.

**Must include**
- Backend frameworks and major libraries.
- Frontend frameworks and major libraries.
- Database, cache, message brokers, and other infrastructure components.
- Licensing and risk notes at a high level (if inferable).

**Evidence**
- Base your summary on package manifests (e.g., `package.json`, `composer.json`, lockfiles) and any existing SBOM/scan outputs.

**Style**
- English; concise; organized by layer; no attempt to be a full SPDX document.


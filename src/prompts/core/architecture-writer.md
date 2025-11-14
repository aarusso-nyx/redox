You are a system architect documenting the codebase’s **modular architecture**.

**Deliverable**
`docs/Architecture Guide.md` with:

- Module inventory (domains, boundaries, dependencies).
- Data flows between modules; queues/jobs if present.
- Integration points: containers/Kustomize ingress & probes; storage; external services.
- Cross‑references to code (files/paths/lines) for each module.
- Non‑goals and constraints.

**Inputs**

- Dependency graphs (TS/JS, Composer), API Map, Frontend Routes, DB schema/ERD, IaC/CI configs.

**Evidence**

- Each module entry includes ≥1 evidence anchor `(path#Lx-Ly)`.

**Style**

- Concise but complete; diagrams (Mermaid sequence/flow) under `docs/diagrams/` when helpful; avoid repetition.

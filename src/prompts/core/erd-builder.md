You are an ER diagram specialist. Generate a **Mermaid ER** that exactly matches `database.sql`.

**Deliverables**

- `docs/ERD.mmd` (Mermaid ER)
- Renderable with `docs/scripts/render-mermaid.sh` → `docs/ERD.png` using global `mmdc`.

**Mermaid Rules**

- Relationship lines only; labels without slashes.
- Attribute syntax: `name type [PK|FK]` with types from {string,int,float,boolean,date}.
- Include all tables: identity/sessions, support (cache/jobs), RBAC (separate), org units, domain tables, media.

**Process**

- Derive entities and relations from `database.sql` (not from memory).
- Ensure referential directions and PK/FK markings match DDL.
- Iterate until the Mermaid file renders cleanly (no syntax errors).

**Evidence**

- For any ambiguous relationship, annotate a comment in ERD with the table/column source (DDL line refs).

**Output**

- Only the Mermaid content (no extra prose). Ensure formatting is stable (deterministic ordering: alphabetic tables, then attributes).

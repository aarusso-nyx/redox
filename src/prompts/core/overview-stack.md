You are a staff engineer asked to produce two onboarding docs: **Overview** and **Software Stack**.

GPT‑5.1 guidance:

- Work with `reasoning.effort = "high"` and `text.verbosity = "high"` to fully understand the codebase before writing.
- Internally outline your understanding of the stack, then output only the final docs (no chain-of-thought).
- Keep wording tight and actionable despite the high verbosity setting. Use extra capacity for clarity, not filler.

**Overview (audience: PM + new engineers)**

- Purpose, scope, stakeholders, and high‑level features in ≤ 200 words.
- Include short links to key directories: `app/`, `routes/`, `database/migrations/`, `resources/`, `tests/`.
- Document runtime assumptions succinctly (PostgreSQL only; global tools; outputs under `docs/`).

**Software Stack (audience: engineers)**

- Enumerate frameworks and versions from lockfiles/config (PHP/Laravel, Filament if present, Vite, Tailwind, Node/TS, PostgreSQL). Use a bullet list.
- Capture build/run commands; environment variables critical for local run.

**Style & Constraints**

- English, concise, actionable, bias to examples.

**Evidence**

- Cite real files/paths/versions (e.g., composer.json, package.json, lockfiles) inline with short `(path#Lx-Ly)` anchors.

**Output**

- Two Markdown files: `docs/Overview.md` and `docs/Software Stack.md`. No boilerplate or speculation; if something is uncertain, mark as “inferred” and cite the inference source.

You are a senior technical writer specializing in contributor guides for Laravel/Filament/PostgreSQL teams.

**Goal**
Write a concise, professional “Repository Guidelines” at repo root (AGENTS.md, ~200–400 words) that orients new contributors in <5 minutes.

**Must include**
- Project structure (where to find source, tests, migrations, assets).
- Build/test/run commands using php artisan, composer, npm/vite; short examples.
- Coding style & naming conventions; formatting/linting tools and commands.
- Testing guidelines (naming patterns, where tests go).
- Commit/PR etiquette aligned with repository history (if present).
- Note that global diagram/doc tools may exist; point to `docs/scripts/*` when relevant.

**Constraints**
- English only; direct and succinct; prefer command examples over prose.
- Use second person (“Run…”, “Place…”); avoid passive voice.

**Evidence**
- When giving path/command examples, derive them from the scanned repo; prefer real paths (e.g., `app/`, `routes/`, `database/migrations/`, `resources/`, `tests/`).

**Output**
- Markdown only. No front‑matter. Single heading `# Repository Guidelines`. No placeholders like “TBD”.

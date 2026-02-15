# System Prompt Loading (Mandatory)

Every Codex/agent execution in this repository must pre-load:

`./.codex/system.md`

before processing any skill or task prompt.

Required order:
1. `./.codex/system.md`
2. Selected skills (`.codex/skills/<skill>/SKILL.md` and/or global skills)
3. Task prompt

Runs that skip the system prompt must be treated as invalid.

AGENT.md — Redox Development Guide

This guide describes how we develop the redox engine itself: architecture, conventions, prompts, testing, quality gates, and release practices. It assumes macOS with Node ≥20, Git, and shell tools installed (see Prereqs below).

⸻

1) Purpose & scope

Redox inspects a codebase (web‑app stacks by default) and synthesizes comprehensive documentation with line‑level evidence. It produces three doc families:
	•	Developer docs (overview, stack, architecture, DB/ERD, API & routes, CI/deploy, onboarding, styleguide, test strategy). The outlines follow the scope in our Overview/Stack and Architecture/CI briefs.
	•	User docs (user guide, feature catalog, troubleshooting, glossary), aligned to the user‑manual brief.  ￼
	•	Audit/assurance docs (FP report, RBAC matrix, threat model, observability, runbooks, DR, LGPD compliance, integrations, performance, SBOM, config reference), consistent with generous, evidence‑based FP counting.  ￼

Natural naming is the default (e.g., Architecture Guide.md, Database Reference.md), no numeric prefixes or alias hopping.

⸻

2) Architecture in one page

Scripted spine, agentic leaves:
	•	Scripted extractors gather facts: migrations → database.sql, route lists, controllers/DTOs, Angular/React routes, dependency graphs. This yields the Evidence Ledger and machine inventories. Database synthesis, ERD rendering rules, and RBAC separation align with our DB/ERD phases.
	•	Agentic writers turn facts into human‑readable docs using role prompts + JSON‑schema outputs, under gates (schema, coverage, evidence, build, traceability). 100% mapping of routes/endpoints to user cases is a hard gate per the use‑cases brief.  ￼

Core components
	•	CLI runners: redox dev|user|audit|all|scan|extract|synthesize|render|check.
	•	Orchestrator (Maestro): task DAG, context windows, “Idea Queue”, retries under schemas.
	•	Extractors: repo scan, DB synthesizer, ERD builder, API mapper, FE router, dep‑graph.
	•	Writers: developer docs, user docs, audit docs.
	•	Gates: schema (AJV), coverage, evidence (path#line), build (DDL parses, ERD renders), traceability (requirements ↔ use‑cases ↔ endpoints ↔ code). Requirements format and cross‑references follow our FR/NFR brief.  ￼
	•	Plugins (Stack Adapters): detection + extractors + seed overlays for stacks (e.g., Laravel/Postgres/Angular; NestJS/Postgres/React; Java/Spring/Oracle/AngularJS).

⸻

3) Quickstart for contributors

Prereqs

# macOS recommended tools
brew install node git ripgrep graphviz
npm i -g mermaid-cli markdown-link-check
cp .env.example .env   # set OPENAI_API_KEY

Common commands

npm run dev                 # CLI help (tsx)
npm run redox:dev           # developer docs profile
npm run redox:user          # user docs profile
npm run redox:audit         # audit/assurance profile
npm run redox:all           # end-to-end (scan→extract→synthesize→render→check)
npm run redox:check         # gates: schema, coverage, evidence, build, traceability
./docs/scripts/render-mermaid.sh   # ERD.mmd → ERD.png (Mermaid rules apply)

Profiles & stack forcing

redox dev --out docs/
redox user --stack nestjs-postgres-react --no-detect
redox audit --gates schema,coverage,evidence,build,traceability
redox extract && redox synthesize --profile user
redox dev --seeds ./redox.seeds --seed-merge project,stack,engine


⸻

4) Project structure (engine)

src/
  cli/            # commands & runners
  core/           # orchestrator, models, LLM wrapper, tools bridge, evidence ledger
  extractors/     # db, api, fe, dep-graph (scripted)
  writers/        # dev-docs, user-docs, audit-docs (agentic)
  gates/          # schema, coverage, evidence, build, traceability
  reviewers/      # architect, QA, ops, security, docs
  plugins/        # stack adapters (detectors, seeds, custom extractors)
  prompts/        # core role prompts + stack overlays
  schemas/        # JSON schemas for structured outputs
docs/
  scripts/        # render-mermaid.sh, link-check
.facts/          # evidence.jsonl, caches, state

	•	Docs inventory (natural names): Repository Guidelines, Overview, Software Stack, Architecture Guide, Database Reference, ERD.mmd/ERD.png, API Map, Frontend Routes Map, Build/CI/Deploy Guide, Onboarding Quickstart, Development Styleguide, Test Strategy, User Guide, Feature Catalog, Troubleshooting Guide, Glossary, Function Point Report, RBAC Matrix, Security Threat Model, Observability Guide, Runbooks, Disaster Recovery, Compliance (LGPD), Integration Catalog, Performance Benchmarks, SBOM, Configuration Reference. The outlines for overview/stack, DB/ERD, architecture, use‑cases, FR/NFR, CI/deploy, user manual, and FP are based on the corresponding phase briefs.

⸻

5) Coding standards
	•	Language: TypeScript (ES2022), strict mode on; prefer pure functions for extractors and side‑effect boundaries in orchestrator.
	•	Formatting & linting: Prettier + ESLint in CI; zero warnings policy. All code‑writing agents must keep the implementation aligned with the rules implicit in `eslint.config.cjs` and `.prettierrc.json`, and ensure `npm run lint` and `npm run format:check` stay green.
	•	Naming: files are kebab‑case; types/interfaces are PascalCase; functions camelCase.
	•	Error handling: throw typed errors; never swallow failed gates.
	•	Logging: structured logs (JSON when CI=true), redact secrets; no raw PII.
	•	Commits/PRs: Conventional Commits; focused PRs with tests and updated docs.

For repository guidelines of target apps (e.g., Laravel/Filament/Postgres), we keep a short contributor guide aligned with artisan/composer/npm/vite and global diagram tools—consult the AGENTS brief (we use it as a seed for the output our engine produces in app repos).  ￼

⸻

6) LLM usage policy
	•	API: OpenAI Responses API with JSON‑schema structured outputs for machine‑readable artifacts.
	•	Models: Maestro = reasoning‑optimized; code tasks = code‑optimized; prose = general model. Low temperature: extract 0.1, tabulate 0.0, prose 0.3.
	•	Evidence‑first prompts: every worker is constrained to cite file paths and, where feasible, line spans.
	•	Cost control: bounded token budgets per stage; caches for stable extracts; schema‑constrained retries only.
	•	Privacy: redact secrets; never send .env, credentials, or facts/evidence.jsonl raw content to external models.

⸻

7) Prompts, seeds, and overlays
	•	Core role prompts live under src/prompts/core/ (Maestro, DB synthesizer, ERD builder, API mapper, FE mapper, use‑cases, requirements, CI/deploy, user manual, FP counter). They encode the acceptance bar from the phase briefs—e.g., DB doc & DDL constraints and RBAC ILFs separation; ERD attribute/relationship rules; 100% route/endpoint coverage in use‑cases; FR/NFR structure; CI/deploy content; user‑manual requirements; generous FP policy.
	•	Stack overlays in src/prompts/stacks/ refine extraction tips and examples per adapter (e.g., laravel-postgres-angular, laravel-postgres-blade, laravel-postgres-react-blade, nestjs-postgres-react, nestjs-postgres-angular, express-knex-postgres-angular, java-spring-oracle-angularjs). Overview/stack expectations (dirs, runtime assumptions, outputs under docs/) follow the overview/stack brief.  ￼
	•	Merging order: project → detected‑stack → core by default; configurable via --seed-merge.

⸻

8) Acceptance gates (definition of done)
	•	Schema Gate: all machine artifacts validate against JSON Schemas.
	•	Coverage Gate: every frontend route and API endpoint maps to ≥1 user case; tables for traceability. (This is essential to the use‑cases brief.)  ￼
	•	Evidence Gate: each doc section shows concrete file path (and line spans where feasible); DB objects cite migration filenames.  ￼
	•	Build Gate: database.sql parses; Mermaid ER renders via docs/scripts/render-mermaid.sh with our ERD syntax rules.  ￼
	•	Traceability Gate: FR/NFR ↔ user cases ↔ endpoints ↔ code cross‑refs are materialized and navigable.  ￼

⸻

9) Testing strategy
	•	Unit: AST parsers, route mappers, migration synth; property checks (round‑trip parse → render → parse).
	•	Golden files: sample repos (fixtures) → expected Database Reference.md, ERD.mmd, API Map.md, etc.
	•	Gate tests: failing examples for each gate + fixes.
	•	E2E: redox all on representative stacks; assert coverage=100% and ERD render success.
	•	Docs integrity: markdown-link-check across docs/ after synthesis; CI must render ERD. ERD rules and CI tasks are defined in the ERD and CI/deploy briefs.

⸻

10) Extensibility (Stack Adapters)
	•	Adapter contract: detect(), seeds(), extractors (api/db/fe/deps), optional writers overrides, extra gates.
	•	DB dialect adapters: ingest Oracle/MySQL, normalize to canonical schema JSON; emit dialect‑specific snapshot; optionally translate to Postgres with fidelity notes (DB doc remains Postgres‑centric per our policy). DB doc method and constraints—migrations→DDL, ILF separation—follow the DB brief.  ￼
	•	Listing & forcing: redox stacks to list adapters; --stack to force; --backend/--frontend/--db/--cloud to refine; --no-detect to disable detection.

⸻

11) CI & releases
	•	CI pipeline: redox all + ERD render + link check; publish docs as artifacts; run unit/e2e tests; track coverage. CI/deploy documentation itself must remain prescriptive with runnable commands.  ￼
	•	Versioning: SemVer; changelog per Conventional Commits; include schema version bumps when prompt/schema contracts change.
	•	Release QA: run on sample repos (at least Laravel/Postgres/Angular and NestJS/Postgres/React); verify that use‑case coverage, ERD rendering, and FP report satisfy their briefs.

⸻

12) Security & privacy
	•	Never commit secrets; .env is local; redact environment values in logs.
	•	Don’t run untrusted code from scanned repos; if DB realization is needed, use ephemeral local Postgres and drop after dump.
	•	Respect LGPD in generated outputs (data inventory and retention mapping in compliance doc).  ￼

⸻

13) Contribution workflow
	1.	Open an issue with context, acceptance criteria, and (if applicable) a sample repo.
	2.	Branch name feat/…, fix/…, docs/…, refactor/….
	3.	Add/adjust tests; update schemas/prompts and docs.
	4.	Ensure npm run redox:check passes locally; include ERD render if touching DB/ERD code.  ￼
	5.	Submit PR with rationale, screenshots/logs where relevant; link to issues.
	6.	Two approvals: one for code, one for docs/UX if user‑facing text changes.

⸻

14) Glossary (engine)
	•	Evidence Ledger: append‑only records {path, startLine, endLine, sha} to support auditability.
	•	Idea Queue: stray suggestions captured during runs for future tasks.
	•	Gate: automated acceptance check; failing gate blocks promotion.
	•	Adapter: plugin for stack detection/extraction/seeds.
	•	Profile: doc family target (dev, user, audit, all).
	•	Natural naming: human‑readable doc filenames without numeric prefixes.

⸻

15) North‑star quality bar
	•	Every generated statement is traceable to evidence; user‑cases cover all routes/endpoints; ERD renders without warnings; FR/NFR are testable and linked; CI/deploy steps are runnable; FP numbers are auditable. These criteria mirror the respective briefs (use‑cases, ERD, requirements, CI/deploy, FP).

⸻

Appendix: Related seeds (for reference while developing)
	•	Contributor/Repository guidelines seed for target app repos.  ￼
	•	Overview & Stack expectations.  ￼
	•	DB docs & DDL policy (Postgres, RBAC ILFs).  ￼
	•	ERD formatting & render rules.  ￼
	•	Architecture content checklist.  ￼
	•	User cases: role catalog, flows, coverage matrix.  ￼
	•	FR/NFR structure and cross‑references.  ￼
	•	CI and deploy procedures.  ￼
	•	User manual requirements.  ￼
	•	Generous IFPUG counting rules.  ￼



Keep this document close to the code: when you evolve extractors, prompts, gates, or adapters, update AGENT.md and the related schemas/seeds in the same PR.

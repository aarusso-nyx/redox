# Redox — Reverse Documentation Engine (redox)

Redox is a reverse‑documentation engine for typical web‑app stacks (Laravel/Postgres/SPA, NestJS/Postgres/React, Java/Spring/AngularJS, etc.).  
It inspects a codebase, extracts structured facts (routes, DB schema, frontend routes, dependency graphs), and synthesizes three doc families:

- Developer docs: Overview, Software Stack, Architecture Guide, Database Reference, ERD, API/Routes maps, Build/CI/Deploy Guide, Onboarding, Styleguide, Test Strategy.
- User docs: User Guide, Feature Catalog, Troubleshooting Guide, Glossary.
- Audit/assurance docs: Function Point Report, RBAC Matrix, Threat Model, Observability, Runbooks, DR, LGPD Compliance, Integration Catalog, Performance, SBOM, Configuration Reference.

Docs are evidence‑driven: every statement is meant to be traceable back to code, migrations, configs, or tests via the Evidence Ledger.

---

## Machine artifacts and gates

Redox emits a set of machine‑readable JSON artifacts under the run output directory (by default `<project>/redox/.redox`). The main ones are:

- `api-map.json` — normalized backend endpoints (Laravel and NestJS) with controller locations and evidence.
- `routes-*.json` — frontend route inventories for React/Angular, used to link UI routes ↔ use cases ↔ endpoints.
- `use-cases.json` — structured use‑case matrix (roles, flows, references) backing coverage and traceability gates.
- `coverage-matrix.json` — the Route ↔ Endpoint ↔ Use‑Case triad matrix; coverage and traceability gates expect this.
- `fp-appendix.json` — Function Point appendix (items, GSCs, UFP/AFP), conforming to `Fp.schema.json`.
- `rbac.json` — RBAC ILF inventory and bindings; initially inferred from RBAC‑like tables and meant to be refined.
- `lgpd-map.json` — per‑column data inventory with `legalBasis` and `retention` fields; skeleton is generated from the DB model.
- `evidence.jsonl` — Evidence Ledger (path + line span + hash) for cross‑checking statements in docs.
- `usage.jsonl` — token usage log; `redox usage` aggregates this by run, model, and agent.

When you run `redox check`, gates interpret these artifacts as follows:

- **Schema gate** validates `api-map.json`, any `routes-*.json`, `use-cases.json`, `coverage-matrix.json`, `fp-appendix.json`, and `rbac.json` against the JSON Schemas in `src/schemas/`.
- **Coverage gate** ensures every route/endpoint in `coverage-matrix.json` participates in at least one Route ↔ Endpoint ↔ Use‑Case triad.
- **Traceability gate** cross‑checks the coverage matrix stats and unmapped items; it fails if any routes/endpoints remain unmapped.
- **Evidence gate** verifies that machine‑generated statements have supporting evidence entries in `.redox/evidence.jsonl`.
- **Build gate** checks DB/ERD artifacts can be rendered (DDL/ERD sanity).
- **RBAC gate** inspects `rbac.json` bindings for evidence‑backed role/permission mappings (only runs once non‑empty bindings exist).
- **LGPD gate** inspects `lgpd-map.json` and fails if any mapped fields are missing `legalBasis` or `retention` once you start filling them in.

In practice:

- Treat these JSON files as **living inventories**: you can refine `rbac.json` and `lgpd-map.json` by hand (or with custom tools) and re‑run `redox check` to tighten gates.
- CI typically runs `redox all` (to regenerate artifacts and docs) followed by `redox check` (to enforce schemas, coverage, traceability, RBAC, LGPD, and build health) on each push.

---

## Features

- **Multi‑profile CLI**: `redox dev|user|audit|all|scan|extract|synthesize|render|check|doctor`.
- **Scripted extractors**:
  - Postgres DB introspection from catalogs (`DATABASE_URL`) + optional `pg_dump` DDL.
  - Laravel routes (artisan JSON + fallback parsing).
  - Blade views/forms/routes and React routes.
  - Frontend detection (blade / react / angular / mixed / unknown).
- **Agentic writers**:
  - LLM‑driven phases using role prompts (`src/prompts/core/**`) and stack overlays (`src/prompts/stacks/**`).
  - JSON‑context injection (routes, DB model, frontend structure) into each prompt.
- **Gates and evidence**:
  - JSON‑schema gate, coverage gate (routes/endpoints ↔ use‑cases), and room for RBAC/compliance gates.
  - Evidence ledger `.redox/evidence.jsonl` with path + line span + SHA hashes (tool wiring ready).
- **Extensible architecture**:
  - Orchestrator (“Maestro”) layers scripted extraction with LLM writers and acceptance gates.
  - Stack adapters (planned) to plug in detectors, custom extractors, and prompt overlays per stack.

---

## Requirements

- Node.js ≥ 20
- macOS or Linux shell with:
  - `docker` and `docker compose` for stack‑specific workflows (optional but recommended).
  - `mmdc` (Mermaid CLI) for ERD PNG rendering (optional).
  - `psql` / `pg_dump` for Postgres DDL snapshots (optional).
- OpenAI API key:
  - `OPENAI_API_KEY` or `OPENAI_KEY` in the environment.

Run:

- `redox doctor` — environment & tools check (Node, OpenAI key, docker, mmdc, Postgres tools).
- `--dry-run` — print in detail what would be executed (stages, scripts, prompts, gates) without performing any side effects.
- `--debug` — verbose logging of prompts, contexts, and gates while executing everything.
- `--verbose` — high‑level debug logging for stages and gates (less detailed than `--debug`).
- `--quiet` — minimal output (disables spinners; only errors are printed).

---

## Installation

In a project where you want to generate docs:

```bash
npm install --save-dev redox
```

Or, when developing redox itself:

```bash
npm install
npm run build
```

Ensure your `.env` (or shell env) provides `OPENAI_API_KEY` (or `OPENAI_KEY`) and any DB connection variables (`DATABASE_URL`, `PGDATABASE`, etc.).

---

## Quickstart

From the target repo root:

```bash
# Developer docs (default ./redox output)
npx redox dev

# User docs
npx redox user

# Audit / assurance docs
npx redox audit

# End‑to‑end (extract → synthesize → render → check)
npx redox all
```

Common options:

- `--out <dir>` — output docs directory (default: `docs`).
- `--stack <adapterId>` — force a stack adapter (e.g., `laravel-postgres-angular`, `nestjs-postgres-react`, `nestjs-postgres-angular`, `express-knex-postgres-angular`).
- `--backend <name>` — override backend (`laravel|nestjs|spring`).
- `--frontend <name>` — override frontend (`angular|react|angularjs`).
- `--db <name>` — override db (`postgres|oracle|mysql`).
- `--cloud <name>` — override cloud (`aws|gcp|azure|none`).
- `--no-detect` — disable auto‑detection completely.
- `--seeds <dir>` — project seeds directory.
- `--seed-merge <order>` — seed merge order (`project,stack,engine`).
- `--gates <csv>` — gates to run (`schema,coverage,evidence,build,traceability`).
- `--facts-only` — stop after extraction (no prose).

Examples:

```bash
# Dev docs into a custom directory
npx redox dev --out docs/generated

# Force NestJS/Postgres/React stack and disable auto detection
npx redox all --stack nestjs-postgres-react --no-detect

# Extract facts only (for inspection or custom pipelines)
npx redox extract --out .redox-facts
```

---

## CLI Commands

- `redox dev` — build developer docs for the target repo.
- `redox user` — build user‑facing docs (User Guide, Feature Catalog, Troubleshooting, Glossary).
- `redox audit` — build audit/assurance docs (FP report, RBAC, Threat Model, etc.).
- `redox all` — full pipeline (extract → synthesize → render → check).
- `redox scan` — detect stack and map the repository; prints detection info.
- `redox extract` — run scripted extractors (DB, routes, frontend, dep‑graph).
- `redox synthesize` — run LLM writers only (requires extracted facts).
- `redox render` — render diagrams (e.g., ERD Mermaid → PNG).
- `redox check` — apply acceptance gates (schema, coverage, evidence, build, traceability).
- `redox doctor` — environment sanity check.

The orchestrator uses profiles:

- `dev` profile optimizes developer docs.
- `user` profile optimizes user‑facing docs.
- `audit` profile optimizes FP / assurance docs.
- `all` runs all three families.

---

## Outputs

By default, outputs go under `redox/` in the target directory:

- `redox/Overview.md`
- `redox/Software Stack.md`
- `redox/Architecture Guide.md`
- `redox/Database Reference.md`
- `redox/ERD.md` and `redox/diagrams/erd.mmd` (+ optional `redox/erd.png`)
- `redox/API Map.md`
- `redox/Frontend Routes Map.md`
- `redox/Build, CI & Deploy Guide.md`
- `redox/Onboarding Quickstart.md`
- `redox/Development Styleguide.md`
- `redox/Test Strategy.md`
- `redox/User Guide.md`
- `redox/Feature Catalog.md`
- `redox/Troubleshooting Guide.md`
- `redox/Glossary.md`
- `redox/Function Point Report.md`
- `redox/RBAC Matrix.md`
- `redox/Security Threat Model.md`
- `redox/Observability Guide.md`
- `redox/Runbooks.md`
- `redox/Disaster Recovery.md`
- `redox/Compliance (LGPD).md`
- `redox/Integration Catalog.md`
- `redox/Performance Benchmarks.md`
- `redox/SBOM.md`
- `redox/Configuration Reference.md`

Diagrams and scripts:

- `redox/diagrams/erd.mmd`
- `redox/erd.png` (when `mmdc` is available)
- `redox/scripts/render-mermaid.sh`

Evidence and machine artifacts:

- `redox/.redox/evidence.jsonl` — Evidence ledger (path, line span, SHA, note/tag).
- Additional JSON inventories (routes, use‑cases, coverage matrices) live under `redox/.redox/` as the engine evolves.

---

## Machine Artifacts & Gates

Redox writes machine‑readable artifacts under `redox/.redox/` that power gates and downstream tooling:

- `redox/.redox/api-map.json`
  - Shape: API Map (`ApiMap.schema.json`).
  - Fields: `endpoints[]` with HTTP method/path, controller refs, and evidence; optional `stack` and `sourceRepo`.
  - Gates:
    - (planned) `schema` — validate against `ApiMap.schema.json`.

- `redox/.redox/routes-*.json`
  - Shape: Frontend routes inventories (`Routes.schema.json`) per framework (e.g., `routes-react.json`, `routes-angular.json`).
  - Fields: `framework`, `routes[]` with ids, paths, component refs, and evidence.
  - Gates:
    - (planned) `schema` — validate against `Routes.schema.json`.

- `redox/.redox/coverage-matrix.json`
  - Shape: Coverage Matrix (`CoverageMatrix.schema.json`).
  - Fields: `routes[]`, `endpoints[]`, `useCases[]`, `links[]` (route↔endpoint↔use‑case triads), `unmapped.routes`, `unmapped.endpoints`, optional `stats`.
  - Gates:
    - `schema` — validated against `CoverageMatrix.schema.json`.
    - `coverage` — ensures every route/endpoint is covered by ≥1 link.
    - `traceability` — ensures `unmapped` sets are empty and `stats` match counts.

- `redox/.redox/rbac.json`
  - Shape: RBAC Matrix (`Rbac.schema.json`).
  - Fields: `roles[]`, `permissions[]`, `roleBindings[]`, `bindings` (endpoint/route/entity bindings), `unmapped`, `stats`.
  - Gates:
    - `schema` — validated against `Rbac.schema.json`.
    - `rbac` — checks there is at least one role↔permission binding and that each binding has evidence.

- `redox/.redox/lgpd-map.json`
  - Shape: array of `{ field, table, legalBasis, retention, ... }`.
  - Gates:
    - `lgpd` — ensures every entry has a `legalBasis` and `retention` value.

- `redox/.redox/fp-appendix.json`
  - Shape: FP Appendix (`Fp.schema.json`).
  - Fields: `items[]` (EI/EO/EQ/ILF/EIF entries with evidence), `gsc[]` (14 General System Characteristics), `ufp`, `vaf`, `afp`, `sensitivity`.
  - Gates:
    - `schema` — validated against `Fp.schema.json`.

- `redox/.redox/evidence.jsonl`
  - Shape: one JSON `Evidence` object per line: `{ path, startLine, endLine, sha256?, note?, tag? }`.
  - Gates:
    - `evidence` — recomputes hashes for the referenced line spans and fails on mismatches or missing files.

The `redox check` command reads these artifacts and runs the selected gates:

- `schema,coverage,evidence,build,traceability` (default) or a custom CSV via `--gates`.
- `build` gate additionally validates:
  - `database.sql` parses via `psql` (when available).
  - `redox/diagrams/erd.mmd` renders via `mmdc` (when available).

---

## Architecture (Engine)

Source layout:

- `src/cli/` — CLI entrypoint and command runners.
- `src/core/` — orchestrator, context loader, LLM wrapper, prompt loader, tools bridge, evidence ledger.
- `src/extractors/` — DB, API, frontend, dependency‑graph extractors.
- `src/writers/` — dev/user/audit writers (scripted skeletons + LLM‑driven phases).
- `src/gates/` — schema, coverage, RBAC, compliance and related gates.
- `src/reviewers/` — architect/QA/ops/security/docs review hooks (LLM‑assisted).
- `src/prompts/` — core role prompts and stack overlays (`core/`, `stacks/`).
- `src/schemas/` — JSON Schemas for structured outputs (API map, routes, use‑cases, FP counts).

The orchestrator (“Maestro”) coordinates:

1. **Scan & extract**: scripted extractors build machine inventories (DB model, routes, frontend routes, dep graphs).
2. **Synthesize**: LLM writers consume facts + prompts to generate Markdown docs (dev / user / audit).
3. **Render**: diagram scripts convert Mermaid ERDs into PNGs (best effort).
4. **Check**: gates enforce schema validity, coverage, evidence integrity, and basic build checks.

Stack adapters (e.g., `laravel-postgres-angular`, `laravel-postgres-blade`, `laravel-postgres-react-blade`, `nestjs-postgres-react`, `nestjs-postgres-angular`, `express-knex-postgres-angular`, `java-spring-oracle-angularjs`) plug in detection logic, custom extractors, prompt overlays, and extra gates without changing the engine core.

---

## Contributing

- Use Node ≥ 20 and enable strict TypeScript.
- Run `npm run lint` and `npm test` before sending changes.
- Keep prompts, schemas, and `AGENTS.md` in sync with any behavior changes.
- When you add or modify extractors, writers, or gates, prefer:
  - Pure functions for extractors.
  - Side‑effects concentrated in the orchestrator and writer layers.

See `AGENTS.md` in this directory for the full development guide and quality bar.

import fs from "fs";
import type { DbModel } from "../extractors/db.js";
import { writeDbAndErdDocs } from "./db-erd.js";

const E = (p: string, s: string) => fs.writeFileSync(p, s);

export function writeRepositoryGuidelines() {
  E("docs/Repository Guidelines.md", `# Repository Guidelines

Purpose: contributor ground rules, structure, commands, style/lint/test, and PR etiquette.

Sections:
- Project structure (source, tests, migrations, assets)
- Build/Test/Run commands
- Coding style and naming
- Testing guidelines
- Commit and PR guidelines

> This guideline is informed by our contributor brief. Evidence-first doc generation is expected and global tools for diagrams/docs are assumed (see docs/scripts).`);
}

export function writeOverviewAndStack() {
  E("docs/Overview.md", `# Overview

Purpose, scope, stakeholders, and high-level features of this system.

- PostgreSQL only; global tools available; outputs under docs/.
- Links to key directories will be added by the engine when a target repo is scanned.`);

  E("docs/Software Stack.md", `# Software Stack

Frameworks and versions inferred from lockfiles and configs.
List Node/PHP/Composer/NPM versions and major libraries once detected.`);
}

export function writeArchitecture() {
  E("docs/Architecture Guide.md", `# Architecture Guide

Modules and boundaries, data flows, integrations, constraints, with code references.

- Include diagrams under docs/diagrams when helpful.
- Cross-reference files/paths/lines for each module.`);
}

export function writeDBAndERD() {
  E(
    "docs/Database Reference.md",
    `# Database Reference

Exhaustive description of tables/columns/constraints/relationships; anomalies called out.
A canonical PostgreSQL DDL is written as database.sql.`,
  );
  E(
    "docs/ERD.mmd",
    `%% Mermaid ER diagram stub
erDiagram
  PLACEHOLDER {
    string id PK
  }`,
  );
}

export function writeAPIAndRoutes() {
  E("docs/API Map.md", `# API Map

Endpoints (method/path), params, guards, controllers/DTO references (OpenAPI if present; synthesized otherwise).`);
  E("docs/Frontend Routes Map.md", `# Frontend Routes Map

Routes/components/guards/resolvers; cross-links to API calls.`);
}

export function writeBuildCIDeploy() {
  E("docs/Build, CI & Deploy Guide.md", `# Build, CI & Deploy Guide

Build/test/lint; containers/compose/Kustomize; ingress/service; probes; env/secrets; migrations on deploy; versioning/rollback; observability hooks.`);
}

export function writeOnboardingAndQuality() {
  E("docs/Onboarding Quickstart.md", `# Onboarding Quickstart

Local setup, environment bootstrap, seed data, first successful request, common pitfalls.`);
  E("docs/Development Styleguide.md", `# Development Styleguide

Code patterns, naming, formatting, lint rules, and enforcement.`);
  E("docs/Test Strategy.md", `# Test Strategy

Unit/integration/e2e distribution; fixtures; coverage goals; how to run and add tests.`);
}

export function writeUserDocs() {
  E("docs/User Guide.md", `# User Guide (EN)

Role-based navigation; step-by-step tasks; screenshots/diagrams; troubleshooting.`);
  E("docs/Feature Catalog.md", `# Feature Catalog

One-line per feature with deep links into the User Guide.`);
  E("docs/Troubleshooting Guide.md", `# Troubleshooting Guide

Common user-facing errors with likely causes and remedies; ties to logs/messages.`);
  E("docs/Glossary.md", `# Glossary

Canonical terms used across the application and documentation.`);
}

export function writeAuditDocs() {
  E("docs/Function Point Report.md", `# Function Point Report (Generous)

Auditable IFPUG with ILF/EIF and EI/EO/EQ; UFP→AFP; sensitivity note + raw JSON appendix.`);
  E("docs/RBAC Matrix.md", `# RBAC Matrix

Role → permission → endpoint/view mapping with evidence.`);
  E("docs/Security Threat Model.md", `# Security Threat Model

Risks, mitigations, residual risks; references to code/config and tests/scans.`);
  E("docs/Observability Guide.md", `# Observability Guide

Logs/metrics/traces; dashboards; alerts; SLO/SLAs; probe endpoints.`);
  E("docs/Runbooks.md", `# Runbooks

On-call playbooks for common failure modes; rollback steps.`);
  E("docs/Disaster Recovery.md", `# Disaster Recovery

Backups, restore drills, RPO/RTO, checksums.`);
  E("docs/Compliance (LGPD).md", `# Compliance (LGPD)

Data inventory; legal bases; retention; subject rights flows; evidence per column/field.`);
  E("docs/Integration Catalog.md", `# Integration Catalog

Inbound/outbound contracts, retries/backoff, SLAs, secrets handling.`);
  E("docs/Performance Benchmarks.md", `# Performance Benchmarks

Load profiles, baseline throughput/latency; reproducible command lines; graphs.`);
  E("docs/SBOM.md", `# SBOM

CycloneDX/SPDX artifacts, SCA/SAST/DAST summaries, open risks.`);
  E("docs/Configuration Reference.md", `# Configuration Reference

Authoritative env var/flag reference with defaults and sensitivity classes.`);
}

export function writeAllDev() {
  writeRepositoryGuidelines();
  writeOverviewAndStack();
  writeArchitecture();
  writeDBAndERD();
  writeAPIAndRoutes();
  writeBuildCIDeploy();
  writeOnboardingAndQuality();
}

export async function writeDbAndErdFromModel(root: string, docsDir: string, model: DbModel) {
  await writeDbAndErdDocs(root, docsDir, model);
}

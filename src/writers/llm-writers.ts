import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "../core/context.js";
import { askLLM } from "../core/llm.js";
import { RevdocTools } from "../core/tools.js";
import { loadPrompt } from "../core/promptLoader.js";
import type { DbModel } from "../extractors/db.js";
import { emitEngineEvent } from "../core/events.js";
import type { ApiMap, RoutesDoc, CoverageMatrix } from "../core/types.js";

type Facts = {
  dbModel: DbModel;
  routes: any[];
  frontend: any;
  apiMap?: ApiMap | null;
  feRoutes?: { react?: RoutesDoc; angular?: RoutesDoc } | null;
  stackProfile?: any;
  depGraph?: any;
  coverageMatrix?: CoverageMatrix | null;
};

type MdPhaseConfig = {
  promptFile: string;
  systemRole: string;
  outFile: (ctx: EngineContext) => string;
};

type JsonPhaseConfig = {
  promptFile: string;
  systemRole: string;
  outFile: (ctx: EngineContext) => string;
};

type LlmSession = {
  previousResponseId?: string;
};

function fallbackMarkdown(outFile: string, facts: Facts): string {
  const name = path.basename(outFile);
  const endpoints =
    (facts.apiMap?.endpoints?.map((e: any) => e.id).filter(Boolean) as string[]) ||
    [];
  const routes =
    (facts.routes?.map((r: any) => r.uri ?? r.id ?? r.path).filter(Boolean) as string[]) ||
    [];
  const feRoutes: string[] = [];
  if (facts.feRoutes?.react?.routes) {
    feRoutes.push(
      ...(facts.feRoutes.react.routes
        .map((r: any) => r.id ?? r.path)
        .filter(Boolean) as string[]),
    );
  }
  if (facts.feRoutes?.angular?.routes) {
    feRoutes.push(
      ...(facts.feRoutes.angular.routes
        .map((r: any) => r.id ?? r.path)
        .filter(Boolean) as string[]),
    );
  }
  const tables = Array.isArray(facts.dbModel?.tables)
    ? facts.dbModel.tables.map((t: any) => `${t.schema ?? "public"}.${t.name ?? ""}`)
    : [];

  const counts = [
    `- Tables: ${tables.length}`,
    `- Backend endpoints: ${endpoints.length}`,
    `- Backend routes: ${routes.length}`,
    `- Frontend routes: ${feRoutes.length}`,
  ].join("\n");

  const listSection = (title: string, items: string[]) =>
    items.length
      ? `### ${title}\n${items.map((i) => `- ${i}`).join("\n")}\n`
      : `### ${title}\n- Not detected\n`;

  if (name === "Function Point Report.md") {
    return `# Function Point Report

${counts}

## Inventory
${listSection("Endpoints", endpoints)}
${listSection("Routes", routes.concat(feRoutes))}
${listSection("Data Tables", tables)}

> Auto-generated fallback because the LLM returned empty content. Refine by rerunning with a database connection and full routes/use-cases artifacts.`;
  }

  if (name === "Performance Benchmarks.md") {
    return `# Performance Benchmarks

${counts}

## Suggested Checks
- Measure response times for key endpoints.
- Profile database queries for the tables above.
- Load test the most critical routes.

${listSection("Endpoints to Benchmark", endpoints.slice(0, 20))}

> Auto-generated fallback because the LLM returned empty content.`;
  }

  if (name === "Observability Guide.md") {
    return `# Observability Guide

${counts}

## Logs
- Ensure structured logging in backend routes/endpoints.
- Centralize logs from services touching the tables above.

## Metrics
- Track request rate, error rate, latency for listed endpoints.
- Database metrics: connections, slow queries on detected tables.

## Traces
- Trace user flows across routes/endpoints; include DB spans.

> Auto-generated fallback because the LLM returned empty content.`;
  }

  if (name === "Runbooks.md") {
    return `# Runbooks

${counts}

## Common Tasks
- Restart backend service.
- Run migrations and verify table counts.
- Smoke-test key endpoints and routes.

${listSection("Endpoints to Verify", endpoints.slice(0, 20))}

> Auto-generated fallback because the LLM returned empty content.`;
  }

  return `# ${name}

${counts}

> Auto-generated fallback because the LLM returned empty content.`;
}

const DEV_MD_PHASES: MdPhaseConfig[] = [
  {
    promptFile: "agents-writer.md",
    systemRole:
      "You are a senior technical writer creating Repository Guidelines for contributors.",
    outFile: (ctx) => path.join(ctx.docsDir, "Repository Guidelines.md"),
  },
  {
    promptFile: "overview-stack.md",
    systemRole:
      "You are a staff engineer writing Overview and Software Stack docs.",
    outFile: (ctx) => path.join(ctx.docsDir, "Overview.md"),
  },
  {
    promptFile: "db-synthesizer.md",
    systemRole: "You are a PostgreSQL DBA writing a Database Reference.",
    outFile: (ctx) => path.join(ctx.docsDir, "Database Reference.md"),
  },
  {
    promptFile: "architecture-writer.md",
    systemRole: "You are a software architect writing an Architecture Guide.",
    outFile: (ctx) => path.join(ctx.docsDir, "Architecture Guide.md"),
  },
  {
    promptFile: "api-mapper.md",
    systemRole: "You are an API cartographer writing an API Map.",
    outFile: (ctx) => path.join(ctx.docsDir, "API Map.md"),
  },
  {
    promptFile: "fe-mapper.md",
    systemRole:
      "You are a frontend route mapper writing a Frontend Routes Map.",
    outFile: (ctx) => path.join(ctx.docsDir, "Frontend Routes Map.md"),
  },
  {
    promptFile: "dev-styleguide.md",
    systemRole:
      "You are a senior engineer writing a Development Styleguide for this repository.",
    outFile: (ctx) => path.join(ctx.docsDir, "Development Styleguide.md"),
  },
  {
    promptFile: "test-strategy.md",
    systemRole: "You are a QA lead writing a Test Strategy for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Test Strategy.md"),
  },
  {
    promptFile: "ci-deploy.md",
    systemRole: "You are a DevOps engineer documenting CI and deployment.",
    outFile: (ctx) => path.join(ctx.docsDir, "Build, CI & Deploy Guide.md"),
  },
  {
    promptFile: "requirements.md",
    systemRole:
      "You are a requirements engineer producing functional requirements.",
    outFile: (ctx) => path.join(ctx.docsDir, "Functional Requirements.md"),
  },
  {
    promptFile: "requirements.md",
    systemRole:
      "You are a requirements engineer producing non-functional requirements.",
    outFile: (ctx) => path.join(ctx.docsDir, "Non-Functional Requirements.md"),
  },
];

const USER_MD_PHASES: MdPhaseConfig[] = [
  {
    promptFile: "user-manual.md",
    systemRole: "You are a product-minded writer creating a User Guide.",
    outFile: (ctx) => path.join(ctx.docsDir, "User Guide.md"),
  },
  {
    promptFile: "use-cases.md",
    systemRole: "You are a product-minded analyst mapping use cases.",
    outFile: (ctx) => path.join(ctx.docsDir, "Use Cases.md"),
  },
  {
    promptFile: "feature-catalog.md",
    systemRole:
      "You are a product-minded writer cataloging features for end users.",
    outFile: (ctx) => path.join(ctx.docsDir, "Feature Catalog.md"),
  },
  {
    promptFile: "troubleshooting.md",
    systemRole:
      "You are a support engineer writing a Troubleshooting Guide for common issues.",
    outFile: (ctx) => path.join(ctx.docsDir, "Troubleshooting Guide.md"),
  },
];

const USER_JSON_PHASES: JsonPhaseConfig[] = [
  {
    promptFile: "use-cases.md",
    systemRole:
      "You are a product-minded analyst emitting a machine-readable use-cases matrix.",
    outFile: (ctx) => path.join(ctx.evidenceDir, "use-cases.json"),
  },
];

const AUDIT_MD_PHASES: MdPhaseConfig[] = [
  {
    promptFile: "fp-counter.md",
    systemRole: "You are a function point analyst producing an FP report.",
    outFile: (ctx) => path.join(ctx.docsDir, "Function Point Report.md"),
  },
  {
    promptFile: "threat-model.md",
    systemRole:
      "You are a security architect writing a Security Threat Model for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Security Threat Model.md"),
  },
  {
    promptFile: "observability.md",
    systemRole:
      "You are an SRE writing an Observability Guide (logs, metrics, traces, alerts).",
    outFile: (ctx) => path.join(ctx.docsDir, "Observability Guide.md"),
  },
  {
    promptFile: "runbooks.md",
    systemRole: "You are an SRE writing operational Runbooks for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Runbooks.md"),
  },
  {
    promptFile: "disaster-recovery.md",
    systemRole: "You are an SRE documenting Disaster Recovery for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Disaster Recovery.md"),
  },
  {
    promptFile: "integration-catalog.md",
    systemRole:
      "You are an integration architect writing an Integration Catalog for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Integration Catalog.md"),
  },
  {
    promptFile: "performance.md",
    systemRole:
      "You are a performance engineer writing Performance Benchmarks and considerations.",
    outFile: (ctx) => path.join(ctx.docsDir, "Performance Benchmarks.md"),
  },
  {
    promptFile: "sbom.md",
    systemRole:
      "You are a tooling engineer writing a Software Bill of Materials (SBOM) overview based on detected dependencies.",
    outFile: (ctx) => path.join(ctx.docsDir, "SBOM.md"),
  },
  {
    promptFile: "config-reference.md",
    systemRole:
      "You are a systems engineer writing a Configuration Reference for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Configuration Reference.md"),
  },
];

const AUDIT_JSON_PHASES: JsonPhaseConfig[] = [
  {
    promptFile: "fp-counter.md",
    systemRole: "You are a function point analyst emitting a JSON FP appendix.",
    outFile: (ctx) => path.join(ctx.evidenceDir, "fp-appendix.json"),
  },
];

async function runPhase(
  ctx: EngineContext,
  facts: Facts,
  promptFile: string,
  systemRole: string,
  outFile: string,
  session: LlmSession,
  profile: string,
  totalCount: number | undefined,
  opts: { dryRun: boolean; debug: boolean },
) {
  const promptText = await loadPrompt(promptFile);
  const user = `${promptText}\n\n<CONTEXT JSON>\n${JSON.stringify(
    {
      root: ctx.root,
      profile: ctx.profile,
      dbModel: facts.dbModel,
      routes: facts.routes,
      frontend: facts.frontend,
      apiMap: facts.apiMap ?? null,
      feRoutes: facts.feRoutes ?? null,
      stackProfile: facts.stackProfile ?? null,
      depGraph: facts.depGraph ?? null,
    },
    null,
    2,
  )}\n</CONTEXT>`;

  if (opts.debug) {
    console.log("LLM phase", {
      promptFile,
      outFile,
      systemRole,
      dryRun: opts.dryRun,
    });
    console.log("LLM system prompt", systemRole);
    console.log("LLM user prompt", user);
  }

  emitEngineEvent({
    type: "phase-start",
    stage: "synthesize",
    profile,
    data: {
      name: path.basename(outFile),
      total: totalCount,
    },
  });

  if (opts.dryRun) {
    emitEngineEvent({
      type: "phase-end",
      stage: "synthesize",
      profile,
      data: { name: path.basename(outFile) },
    });
    return;
  }

  const res = await askLLM(user, {
    model: process.env.REDOX_MODEL_WRITER ?? "gpt-5.1",
    tools: RevdocTools,
    allowedTools: [
      { type: "function", name: "saveEvidence" },
      { type: "function", name: "pushIdea" },
    ],
    toolMode: "auto",
    reasoningEffort: "medium",
    verbosity: "medium",
    previousResponseId: session.previousResponseId,
    agent: promptFile,
    stage: "synthesize",
    profile: undefined,
    meta: {
      outFile,
      root: ctx.root,
    },
  });
  const anyR: any = res as any;
  const responseId: string | undefined = anyR.id ?? anyR.response_id;
  if (responseId) {
    session.previousResponseId = responseId;
  }
  const text =
    anyR.output_text ??
    anyR.output?.[0]?.content?.[0]?.text ??
    JSON.stringify(anyR, null, 2);

  const finalText =
    typeof text === "string" && text.trim().length > 0
      ? text
      : fallbackMarkdown(outFile, facts);

  await fs.ensureDir(path.dirname(outFile));
  await fs.writeFile(outFile, finalText, "utf8");
  emitEngineEvent({
    type: "phase-end",
    stage: "synthesize",
    profile,
    data: { name: path.basename(outFile) },
  });
  emitEngineEvent({
    type: "doc-written",
    agent: promptFile,
    file: outFile,
    data: { bytes: text.length },
  });
  if (opts.debug) {
    console.log("LLM output written", {
      outFile,
      length: text.length,
    });
  }
}

async function runJsonPhase(
  ctx: EngineContext,
  facts: Facts,
  promptFile: string,
  systemRole: string,
  outFile: string,
  session: LlmSession,
  profile: string,
  totalCount: number | undefined,
  opts: { dryRun: boolean; debug: boolean },
) {
  const promptText = await loadPrompt(promptFile);
  const user = `${promptText}

You must now produce only a machine-readable JSON document that conforms to the expected schema for this phase.
- Do not include any Markdown, commentary, or code fences.
- The response body must be a single JSON object.

<CONTEXT JSON>
${JSON.stringify(
  {
    root: ctx.root,
    profile: ctx.profile,
    dbModel: facts.dbModel,
    routes: facts.routes,
    frontend: facts.frontend,
    apiMap: facts.apiMap ?? null,
    feRoutes: facts.feRoutes ?? null,
    stackProfile: facts.stackProfile ?? null,
    depGraph: facts.depGraph ?? null,
  },
  null,
  2,
)}
</CONTEXT>`;

  if (opts.debug) {
    console.log("LLM JSON phase", {
      promptFile,
      outFile,
      systemRole,
      dryRun: opts.dryRun,
    });
    console.log("LLM JSON user prompt", user);
  }

  emitEngineEvent({
    type: "phase-start",
    stage: "synthesize",
    profile,
    data: {
      name: path.basename(outFile),
      total: totalCount,
    },
  });

  if (opts.dryRun) {
    emitEngineEvent({
      type: "phase-end",
      stage: "synthesize",
      profile,
      data: { name: path.basename(outFile) },
    });
    return;
  }

  const res = await askLLM(user, {
    model: process.env.REDOX_MODEL_WRITER ?? "gpt-5.1",
    // JSON phases should not use tools; requiring tools can
    // cause tool-only responses and malformed JSON bodies.
    tools: undefined,
    allowedTools: undefined,
    reasoningEffort: "medium",
    verbosity: "low",
    maxOutputTokens: 6000,
    previousResponseId: session.previousResponseId,
    agent: `${promptFile}:json`,
    stage: "synthesize",
    profile: undefined,
    meta: {
      outFile,
      root: ctx.root,
    },
  });
  const anyR: any = res as any;
  const responseId: string | undefined = anyR.id ?? anyR.response_id;
  if (responseId) {
    session.previousResponseId = responseId;
  }
  let text =
    anyR.output_text ??
    anyR.output?.[0]?.content?.[0]?.text ??
    JSON.stringify(anyR, null, 2);

  // Strip common Markdown fences if the model ignored instructions.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (err) {
    // If the model failed to return valid JSON for key machine
    // artifacts, fall back to minimal-but-valid structures so
    // that downstream gates can run and surface issues instead
    // of crashing the entire run.
    if (outFile.endsWith("use-cases.json")) {
      json = {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        roles: [],
        cases: [],
      };
    } else if (outFile.endsWith("fp-appendix.json")) {
      json = {
        schemaVersion: "1.0",
        generatedAt: new Date().toISOString(),
        policy: "generous",
        items: [],
        // 14 GSC slots with neutral ratings so the schema
        // gate passes while clearly signalling "empty".
        gsc: Array.from({ length: 14 }).map((_, idx) => ({
          id: idx + 1,
          name: `GSC-${idx + 1}`,
          rating: 0,
          rationale: "",
        })),
        ufp: 0,
        vaf: 1.0,
        afp: 0,
        sensitivity: {
          ufpLow: 0,
          ufpHigh: 0,
          afpLow: 0,
          afpHigh: 0,
          notes: "",
        },
      };
    } else {
      throw new Error(
        `Failed to parse JSON for ${outFile}: ${(err as Error).message}`,
      );
    }
  }

  await fs.ensureDir(path.dirname(outFile));
  await fs.writeJson(outFile, json, { spaces: 2 });
  emitEngineEvent({
    type: "phase-end",
    stage: "synthesize",
    profile,
    data: { name: path.basename(outFile) },
  });
  emitEngineEvent({
    type: "artifact-written",
    agent: `${promptFile}:json`,
    file: outFile,
  });
  if (opts.debug) {
    console.log("LLM JSON output written", {
      outFile,
      bytes: text.length,
    });
  }
}

export async function writeDevDocsLLM(
  ctx: EngineContext,
  facts: Facts,
  opts: { dryRun: boolean; debug: boolean },
) {
  const session: LlmSession = {};
  const total = DEV_MD_PHASES.length;
  for (const [idx, phase] of DEV_MD_PHASES.entries()) {
    console.log(
      `synth (dev ${idx + 1}/${total}) ${path.basename(phase.outFile(ctx))}`,
    );
    await runPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      session,
      "dev",
      total,
      opts,
    );
  }
}

export async function writeUserDocsLLM(
  ctx: EngineContext,
  facts: Facts,
  opts: { dryRun: boolean; debug: boolean },
) {
  const session: LlmSession = {};
  const totalMd = USER_MD_PHASES.length;
  const totalJson = USER_JSON_PHASES.length;
  const totalAll = totalMd + totalJson;
  for (const [idx, phase] of USER_MD_PHASES.entries()) {
    console.log(
      `synth (user ${idx + 1}/${totalAll}) ${path.basename(
        phase.outFile(ctx),
      )}`,
    );
    await runPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      session,
      "user",
      totalAll,
      opts,
    );
  }

  for (const [idx, phase] of USER_JSON_PHASES.entries()) {
    console.log(
      `synth (user json ${idx + 1 + totalMd}/${totalAll}) ${path.basename(
        phase.outFile(ctx),
      )}`,
    );
    await runJsonPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      session,
      "user",
      totalAll,
      opts,
    );
  }
}

export async function writeAuditDocsLLM(
  ctx: EngineContext,
  facts: Facts,
  opts: { dryRun: boolean; debug: boolean },
) {
  const session: LlmSession = {};
  const totalMd = AUDIT_MD_PHASES.length;
  const totalJson = AUDIT_JSON_PHASES.length;
  const totalAll = totalMd + totalJson;
  for (const [idx, phase] of AUDIT_MD_PHASES.entries()) {
    console.log(
      `synth (audit ${idx + 1}/${totalAll}) ${path.basename(
        phase.outFile(ctx),
      )}`,
    );
    await runPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      session,
      "audit",
      totalAll,
      opts,
    );
  }

  for (const [idx, phase] of AUDIT_JSON_PHASES.entries()) {
    console.log(
      `synth (audit json ${idx + 1 + totalMd}/${totalAll}) ${path.basename(
        phase.outFile(ctx),
      )}`,
    );
    await runJsonPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      session,
      "audit",
      totalAll,
      opts,
    );
  }
}

import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "../core/context.js";
import { askLLM } from "../core/llm.js";
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
    systemRole:
      "You are a PostgreSQL DBA writing a Database Reference.",
    outFile: (ctx) => path.join(ctx.docsDir, "Database Reference.md"),
  },
  {
    promptFile: "architecture-writer.md",
    systemRole:
      "You are a software architect writing an Architecture Guide.",
    outFile: (ctx) => path.join(ctx.docsDir, "Architecture Guide.md"),
  },
  {
    promptFile: "api-mapper.md",
    systemRole:
      "You are an API cartographer writing an API Map.",
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
    systemRole:
      "You are a QA lead writing a Test Strategy for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Test Strategy.md"),
  },
  {
    promptFile: "ci-deploy.md",
    systemRole:
      "You are a DevOps engineer documenting CI and deployment.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Build, CI & Deploy Guide.md"),
  },
  {
    promptFile: "requirements.md",
    systemRole:
      "You are a requirements engineer producing functional requirements.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Functional Requirements.md"),
  },
  {
    promptFile: "requirements.md",
    systemRole:
      "You are a requirements engineer producing non-functional requirements.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Non-Functional Requirements.md"),
  },
];

const USER_MD_PHASES: MdPhaseConfig[] = [
  {
    promptFile: "user-manual.md",
    systemRole:
      "You are a product-minded writer creating a User Guide.",
    outFile: (ctx) => path.join(ctx.docsDir, "User Guide.md"),
  },
  {
    promptFile: "use-cases.md",
    systemRole:
      "You are a product-minded analyst mapping use cases.",
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
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Troubleshooting Guide.md"),
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
    systemRole:
      "You are a function point analyst producing an FP report.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Function Point Report.md"),
  },
  {
    promptFile: "threat-model.md",
    systemRole:
      "You are a security architect writing a Security Threat Model for this system.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Security Threat Model.md"),
  },
  {
    promptFile: "observability.md",
    systemRole:
      "You are an SRE writing an Observability Guide (logs, metrics, traces, alerts).",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Observability Guide.md"),
  },
  {
    promptFile: "runbooks.md",
    systemRole:
      "You are an SRE writing operational Runbooks for this system.",
    outFile: (ctx) => path.join(ctx.docsDir, "Runbooks.md"),
  },
  {
    promptFile: "disaster-recovery.md",
    systemRole:
      "You are an SRE documenting Disaster Recovery for this system.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Disaster Recovery.md"),
  },
  {
    promptFile: "integration-catalog.md",
    systemRole:
      "You are an integration architect writing an Integration Catalog for this system.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Integration Catalog.md"),
  },
  {
    promptFile: "performance.md",
    systemRole:
      "You are a performance engineer writing Performance Benchmarks and considerations.",
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Performance Benchmarks.md"),
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
    outFile: (ctx) =>
      path.join(ctx.docsDir, "Configuration Reference.md"),
  },
];

const AUDIT_JSON_PHASES: JsonPhaseConfig[] = [
  {
    promptFile: "fp-counter.md",
    systemRole:
      "You are a function point analyst emitting a JSON FP appendix.",
    outFile: (ctx) => path.join(ctx.evidenceDir, "fp-appendix.json"),
  },
];

async function runPhase(
  ctx: EngineContext,
  facts: Facts,
  promptFile: string,
  systemRole: string,
  outFile: string,
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
    console.log("[redox][debug] LLM phase", {
      promptFile,
      outFile,
      systemRole,
      dryRun: opts.dryRun,
    });
    console.log("[redox][debug] LLM system prompt", systemRole);
    console.log("[redox][debug] LLM user prompt", user);
  }

  if (opts.dryRun) {
    return;
  }

  const res = await askLLM(user, {
    model: process.env.REDOX_MODEL_WRITER ?? "chatgpt-5.1",
    agent: promptFile,
    stage: "synthesize",
    profile: undefined,
    meta: {
      outFile,
      root: ctx.root,
    },
  });
  const anyR: any = res as any;
  const text =
    anyR.output_text ??
    anyR.output?.[0]?.content?.[0]?.text ??
    JSON.stringify(anyR, null, 2);

  await fs.ensureDir(path.dirname(outFile));
  await fs.writeFile(outFile, text, "utf8");
  emitEngineEvent({
    type: "doc-written",
    agent: promptFile,
    file: outFile,
    data: { bytes: text.length },
  });
  if (opts.debug) {
    console.log("[redox][debug] LLM output written", {
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
    console.log("[redox][debug] LLM JSON phase", {
      promptFile,
      outFile,
      systemRole,
      dryRun: opts.dryRun,
    });
    console.log("[redox][debug] LLM JSON user prompt", user);
  }

  if (opts.dryRun) {
    return;
  }

  const res = await askLLM(user, {
    model: process.env.REDOX_MODEL_WRITER ?? "chatgpt-5.1",
    agent: `${promptFile}:json`,
    stage: "synthesize",
    profile: undefined,
    meta: {
      outFile,
      root: ctx.root,
    },
  });
  const anyR: any = res as any;
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
    throw new Error(
      `Failed to parse JSON for ${outFile}: ${(err as Error).message}`,
    );
  }

  await fs.ensureDir(path.dirname(outFile));
  await fs.writeJson(outFile, json, { spaces: 2 });
  emitEngineEvent({
    type: "artifact-written",
    agent: `${promptFile}:json`,
    file: outFile,
  });
  if (opts.debug) {
    console.log("[redox][debug] LLM JSON output written", {
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
  for (const phase of DEV_MD_PHASES) {
    await runPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      opts,
    );
  }
}

export async function writeUserDocsLLM(
  ctx: EngineContext,
  facts: Facts,
  opts: { dryRun: boolean; debug: boolean },
) {
  for (const phase of USER_MD_PHASES) {
    await runPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      opts,
    );
  }

  for (const phase of USER_JSON_PHASES) {
    await runJsonPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      opts,
    );
  }
}

export async function writeAuditDocsLLM(
  ctx: EngineContext,
  facts: Facts,
  opts: { dryRun: boolean; debug: boolean },
) {
  for (const phase of AUDIT_MD_PHASES) {
    await runPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      opts,
    );
  }

  for (const phase of AUDIT_JSON_PHASES) {
    await runJsonPhase(
      ctx,
      facts,
      phase.promptFile,
      phase.systemRole,
      phase.outFile(ctx),
      opts,
    );
  }
}

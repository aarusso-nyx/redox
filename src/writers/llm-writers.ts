import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "../core/context.js";
import { askLLM } from "../core/llm.js";
import { loadPrompt } from "../core/promptLoader.js";
import type { DbModel } from "../extractors/db.js";

type Facts = {
  dbModel: DbModel;
  routes: any[];
  frontend: any;
  apiMap?: any;
  feRoutes?: any;
};

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
    },
    null,
    2,
  )}\n</CONTEXT>`;

  if (opts.debug) {
    // eslint-disable-next-line no-console
    console.log("[redox][debug] LLM phase", {
      promptFile,
      outFile,
      systemRole,
      dryRun: opts.dryRun,
    });
    // eslint-disable-next-line no-console
    console.log("[redox][debug] LLM system prompt", systemRole);
    // eslint-disable-next-line no-console
    console.log("[redox][debug] LLM user prompt", user);
  }

  if (opts.dryRun) {
    return;
  }

  const res = await askLLM(user, {
    model: process.env.REDOX_MODEL_WRITER ?? "gpt-4.1",
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
    anyR.output_text ?? anyR.output?.[0]?.content?.[0]?.text ?? JSON.stringify(anyR, null, 2);

  await fs.ensureDir(path.dirname(outFile));
  await fs.writeFile(outFile, text, "utf8");
  if (opts.debug) {
    // eslint-disable-next-line no-console
    console.log("[redox][debug] LLM output written", { outFile, length: text.length });
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
  },
  null,
  2,
)}
</CONTEXT>`;

  if (opts.debug) {
    // eslint-disable-next-line no-console
    console.log("[redox][debug] LLM JSON phase", {
      promptFile,
      outFile,
      systemRole,
      dryRun: opts.dryRun,
    });
    // eslint-disable-next-line no-console
    console.log("[redox][debug] LLM JSON user prompt", user);
  }

  if (opts.dryRun) {
    return;
  }

  const res = await askLLM(user, {
    model: process.env.REDOX_MODEL_WRITER ?? "gpt-4.1",
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
    anyR.output_text ?? anyR.output?.[0]?.content?.[0]?.text ?? JSON.stringify(anyR, null, 2);

  // Strip common Markdown fences if the model ignored instructions.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON for ${outFile}: ${(err as Error).message}`);
  }

  await fs.ensureDir(path.dirname(outFile));
  await fs.writeJson(outFile, json, { spaces: 2 });
  if (opts.debug) {
    // eslint-disable-next-line no-console
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
  await runPhase(
    ctx,
    facts,
    "overview-stack.md",
    "You are a staff engineer writing Overview and Software Stack docs.",
    path.join(ctx.docsDir, "Overview.md"),
    opts,
  );
  await runPhase(
    ctx,
    facts,
    "db-synthesizer.md",
    "You are a PostgreSQL DBA writing a Database Reference.",
    path.join(ctx.docsDir, "Database Reference.md"),
    opts,
  );
  await runPhase(
    ctx,
    facts,
    "architecture-writer.md",
    "You are a software architect writing an Architecture Guide.",
    path.join(ctx.docsDir, "Architecture Guide.md"),
    opts,
  );
  await runPhase(
    ctx,
    facts,
    "api-mapper.md",
    "You are an API cartographer writing an API Map.",
    path.join(ctx.docsDir, "API Map.md"),
    opts,
  );
  await runPhase(
    ctx,
    facts,
    "fe-mapper.md",
    "You are a frontend route mapper writing a Frontend Routes Map.",
    path.join(ctx.docsDir, "Frontend Routes Map.md"),
    opts,
  );

  await runPhase(
    ctx,
    facts,
    "ci-deploy.md",
    "You are a DevOps engineer documenting CI and deployment.",
    path.join(ctx.docsDir, "Build, CI & Deploy Guide.md"),
    opts,
  );

  await runPhase(
    ctx,
    facts,
    "requirements.md",
    "You are a requirements engineer producing functional requirements.",
    path.join(ctx.docsDir, "Functional Requirements.md"),
    opts,
  );

  await runPhase(
    ctx,
    facts,
    "requirements.md",
    "You are a requirements engineer producing non-functional requirements.",
    path.join(ctx.docsDir, "Non-Functional Requirements.md"),
    opts,
  );
}

export async function writeUserDocsLLM(
  ctx: EngineContext,
  facts: Facts,
  opts: { dryRun: boolean; debug: boolean },
) {
  await runPhase(
    ctx,
    facts,
    "user-manual.md",
    "You are a product-minded writer creating a User Guide.",
    path.join(ctx.docsDir, "User Guide.md"),
    opts,
  );
  await runPhase(
    ctx,
    facts,
    "use-cases.md",
    "You are a product-minded analyst mapping use cases.",
    path.join(ctx.docsDir, "Use Cases.md"),
    opts,
  );

  // Machine artifact for coverage/traceability gates
  await runJsonPhase(
    ctx,
    facts,
    "use-cases.md",
    "You are a product-minded analyst emitting a machine-readable use-cases matrix.",
    path.join(ctx.evidenceDir, "use-cases.json"),
    opts,
  );
}

export async function writeAuditDocsLLM(
  ctx: EngineContext,
  facts: Facts,
  opts: { dryRun: boolean; debug: boolean },
) {
  await runPhase(
    ctx,
    facts,
    "fp-counter.md",
    "You are a function point analyst producing an FP report.",
    path.join(ctx.docsDir, "Function Point Report.md"),
    opts,
  );

  // Machine artifact for FP gate and auditability
  await runJsonPhase(
    ctx,
    facts,
    "fp-counter.md",
    "You are a function point analyst emitting a JSON FP appendix.",
    path.join(ctx.evidenceDir, "fp-appendix.json"),
    opts,
  );
}

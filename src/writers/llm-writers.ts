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
};

async function runPhase(
  ctx: EngineContext,
  facts: Facts,
  promptFile: string,
  systemRole: string,
  outFile: string,
) {
  const promptText = await loadPrompt(promptFile);
  const user = `${promptText}\n\n<CONTEXT JSON>\n${JSON.stringify(
    {
      root: ctx.root,
      profile: ctx.profile,
      dbModel: facts.dbModel,
      routes: facts.routes,
      frontend: facts.frontend,
    },
    null,
    2,
  )}\n</CONTEXT>`;

  const res = await askLLM(user, { model: process.env.REDOX_MODEL_WRITER ?? "gpt-4.1" });
  const anyR: any = res as any;
  const text =
    anyR.output_text ?? anyR.output?.[0]?.content?.[0]?.text ?? JSON.stringify(anyR, null, 2);

  await fs.ensureDir(path.dirname(outFile));
  await fs.writeFile(outFile, text, "utf8");
}

export async function writeDevDocsLLM(ctx: EngineContext, facts: Facts) {
  await runPhase(
    ctx,
    facts,
    "overview-stack.md",
    "You are a staff engineer writing Overview and Software Stack docs.",
    path.join(ctx.docsDir, "Overview.md"),
  );
  await runPhase(
    ctx,
    facts,
    "architecture-writer.md",
    "You are a software architect writing an Architecture Guide.",
    path.join(ctx.docsDir, "Architecture Guide.md"),
  );
}

export async function writeUserDocsLLM(ctx: EngineContext, facts: Facts) {
  await runPhase(
    ctx,
    facts,
    "user-manual.md",
    "You are a product-minded writer creating a User Guide.",
    path.join(ctx.docsDir, "User Guide.md"),
  );
  await runPhase(
    ctx,
    facts,
    "use-cases.md",
    "You are a product-minded analyst mapping use cases.",
    path.join(ctx.docsDir, "Use Cases.md"),
  );
}

export async function writeAuditDocsLLM(ctx: EngineContext, facts: Facts) {
  await runPhase(
    ctx,
    facts,
    "fp-counter.md",
    "You are a function point analyst producing an FP report.",
    path.join(ctx.docsDir, "Function Point Report.md"),
  );
}

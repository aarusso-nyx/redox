import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import { askLLM } from "./llm.js";
import { loadPrompt } from "./promptLoader.js";
import { loadSchemaFile } from "./schemaLoader.js";
import { emitEngineEvent } from "./events.js";

export async function buildStackProfile(engine: EngineContext, opts: { dryRun: boolean; debug: boolean }) {
  const promptText = await loadPrompt("repo-scanner.md");

  const context = {
    root: engine.root,
    files: engine.files,
  };

  const userPrompt = `${promptText}

You must now output only a single JSON object representing the Stack Profile and Directory Map.
- Do not include Markdown, comments, or code fences.

<CONTEXT JSON>
${JSON.stringify(context, null, 2)}
</CONTEXT>`;

  if (opts.debug) {
    // eslint-disable-next-line no-console
    console.log("[redox][debug] stackProfile user prompt", userPrompt);
  }

  const outPath = path.join(engine.evidenceDir, "stack-profile.json");

  if (opts.dryRun) {
    // eslint-disable-next-line no-console
    console.log("[redox][debug] (dry-run) Would write stack profile to", outPath);
    return;
  }

  const schema = await loadSchemaFile("StackProfile.schema.json");

  const res = await askLLM(userPrompt, {
    model: process.env.REDOX_MODEL_WRITER ?? "gpt-4.1",
    jsonSchema: schema,
    agent: "repo-scanner",
    stage: "extract",
    meta: { outFile: outPath, root: engine.root },
  });
  const anyR: any = res as any;
  let text =
    anyR.output_text ?? anyR.output?.[0]?.content?.[0]?.text ?? JSON.stringify(anyR, null, 2);

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    text = fence[1].trim();
  }

  let json: any;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse stack-profile JSON: ${(err as Error).message}`);
  }

  if (!json.schemaVersion) {
    json.schemaVersion = "1.0";
  }
  if (!json.generatedAt) {
    json.generatedAt = new Date().toISOString();
  }

  await fs.ensureDir(engine.evidenceDir);
  await fs.writeJson(outPath, json, { spaces: 2 });

  if (opts.debug) {
    // eslint-disable-next-line no-console
    console.log("[redox][debug] stack profile written", { path: outPath });
  }

  emitEngineEvent({
    type: "artifact-written",
    file: outPath,
    data: { artifact: "stack-profile" },
  });
}

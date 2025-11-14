import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import { tsDepGraph } from "../extractors/dep-graph.js";
import { askLLM } from "./llm.js";
import { loadPrompt } from "./promptLoader.js";
import { emitEngineEvent } from "./events.js";

export async function buildDepGraph(
  engine: EngineContext,
  opts: { dryRun: boolean; debug: boolean },
) {
  const candidates = [
    "src/main.ts",
    "src/index.ts",
    "src/app.ts",
    "src/server.ts",
    "src/main.tsx",
    "src/index.tsx",
  ];

  let entry: string | undefined;
  for (const rel of candidates) {
    const candidate = path.join(engine.root, rel);
    // fs-extra: pathExists is async and returns a boolean
    if (await fs.pathExists(candidate)) {
      entry = candidate;
      break;
    }
  }

  if (!entry) return;

  const graphOut = path.join(engine.evidenceDir, "dep-graph.json");

  if (opts.dryRun) {
    console.log(
      "[redox][debug] (dry-run) Would build TS dep graph from",
      entry,
    );
  } else {
    const graph = await tsDepGraph(entry);
    await fs.ensureDir(engine.evidenceDir);
    await fs.writeJson(graphOut, graph, { spaces: 2 });
    emitEngineEvent({
      type: "artifact-written",
      file: graphOut,
      data: { artifact: "dep-graph" },
    });
  }

  const promptText = await loadPrompt("dep-grapher.md");
  const context = {
    root: engine.root,
    entry,
    graphPath: path.relative(engine.root, graphOut),
  };

  const userPrompt = `${promptText}

Use the existing JSON graph at the given path; do not re-run static analysis.

<CONTEXT JSON>
${JSON.stringify(context, null, 2)}
</CONTEXT>`;

  const mdOut = path.join(engine.docsDir, "Dependency Graph.md");

  if (opts.debug) {
    console.log("[redox][debug] dep-graph user prompt", userPrompt);
  }

  if (opts.dryRun) {
    console.log(
      "[redox][debug] (dry-run) Would write dependency graph summary to",
      mdOut,
    );
    return;
  }

  const res = await askLLM(userPrompt, {
    model: process.env.REDOX_MODEL_WRITER ?? "gpt-5.1",
    reasoningEffort: "high",
    verbosity: "high",
    maxOutputTokens: 6000,
    agent: "dep-grapher",
    stage: "extract",
    meta: { graphOut, mdOut, root: engine.root },
  });
  const anyR: any = res as any;
  const text =
    anyR.output_text ??
    anyR.output?.[0]?.content?.[0]?.text ??
    JSON.stringify(anyR, null, 2);

  await fs.ensureDir(engine.docsDir);
  await fs.writeFile(mdOut, text, "utf8");

  if (opts.debug) {
    console.log("[redox][debug] dep graph summary written", { path: mdOut });
  }

  emitEngineEvent({
    type: "doc-written",
    agent: "dep-grapher",
    file: mdOut,
  });
}

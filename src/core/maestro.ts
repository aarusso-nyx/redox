import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import { askLLM } from "./llm.js";
import { loadPrompt } from "./promptLoader.js";
import { orchestrate } from "./orchestrator.js";

type MaestroAction = {
  type: string;
  stage?: string;
  profile?: "dev" | "user" | "audit" | "all";
  gates?: string;
};

type MaestroPlan = {
  planId: string;
  summary: string;
  nextActions: MaestroAction[];
};

async function artifactExists(engine: EngineContext, rel: string) {
  return fs.pathExists(path.join(engine.root, rel));
}

async function gatherState(engine: EngineContext) {
  const docsDir = engine.docsDir;
  const evidenceDir = engine.evidenceDir;
  const [
    overview,
    architecture,
    db,
    userGuide,
    fpReport,
    apiMap,
    useCases,
    coverageMatrix,
    fpAppendix,
    rbac,
    lgpd,
  ] = await Promise.all([
    artifactExists(
      engine,
      path.relative(engine.root, path.join(docsDir, "Overview.md")),
    ),
    artifactExists(
      engine,
      path.relative(engine.root, path.join(docsDir, "Architecture Guide.md")),
    ),
    artifactExists(
      engine,
      path.relative(engine.root, path.join(docsDir, "Database Reference.md")),
    ),
    artifactExists(
      engine,
      path.relative(engine.root, path.join(docsDir, "User Guide.md")),
    ),
    artifactExists(
      engine,
      path.relative(
        engine.root,
        path.join(docsDir, "Function Point Report.md"),
      ),
    ),
    fs.pathExists(path.join(evidenceDir, "api-map.json")),
    fs.pathExists(path.join(evidenceDir, "use-cases.json")),
    fs.pathExists(path.join(evidenceDir, "coverage-matrix.json")),
    fs.pathExists(path.join(evidenceDir, "fp-appendix.json")),
    fs.pathExists(path.join(evidenceDir, "rbac.json")),
    fs.pathExists(path.join(evidenceDir, "lgpd-map.json")),
  ]);

  let routes = false;
  try {
    const entries = await fs.readdir(evidenceDir);
    routes = entries.some(
      (n: string) => n.startsWith("routes-") && n.endsWith(".json"),
    );
  } catch {
    routes = false;
  }

  return {
    root: engine.root,
    docsDir,
    evidenceDir,
    docs: {
      overview,
      architecture,
      db,
      userGuide,
      fpReport,
    },
    artifacts: {
      apiMap,
      routes,
      useCases,
      coverageMatrix,
      fpAppendix,
      rbac,
      lgpd,
    },
  };
}

export async function runMaestro(engine: EngineContext, opts: any) {
  const prompt = await loadPrompt("maestro.md");
  const state = await gatherState(engine);

  const userPrompt = `${prompt}

Engine-specific contract:
- You are orchestrating an existing scripted engine with stages: "extract", "synthesize", "render", "check", "dev", "user", "audit", "all", "review".
- Your MaestroPlan.nextActions must use only the following action types:
  - { "type": "run_stage", "stage": "<one of the stages above>", "profile"?: "dev|user|audit|all", "gates"?: "csv" }
  - { "type": "finalize" }
- Do not invent other action types; keep nextActions short and executable.

Current engine state:
<STATE JSON>
${JSON.stringify(state, null, 2)}
</STATE JSON>
`;

  const res = await askLLM(userPrompt, {
    model:
      process.env.REDOX_MODEL_MAESTRO ??
      process.env.REDOX_MODEL_WRITER ??
      "gpt-5.1",
    reasoningEffort: "high",
    verbosity: "medium",
    maxOutputTokens: 4000,
    agent: "maestro",
    stage: "orchestrate",
    meta: { root: engine.root, docsDir: engine.docsDir },
  });

  const anyR: any = res as any;
  const text =
    anyR.output_text ??
    anyR.output?.[0]?.content?.[0]?.text ??
    JSON.stringify(anyR, null, 2);

  let plan: MaestroPlan;
  try {
    plan = JSON.parse(text) as MaestroPlan;
  } catch (err) {
    throw new Error(
      `Maestro plan JSON parse failed: ${(err as Error).message}`,
    );
  }

  const actions = Array.isArray(plan.nextActions) ? plan.nextActions : [];
  for (const action of actions) {
    if (action.type === "finalize") break;
    if (action.type !== "run_stage" || !action.stage) continue;

    const stage = action.stage as any;
    const profile = action.profile ?? opts.profile;
    const gates = action.gates ?? opts.gates;

    console.log("[redox][maestro] run_stage", { stage, profile, gates });

    await orchestrate(stage, {
      ...opts,
      engine,
      profile,
      gates,
    });
  }
}

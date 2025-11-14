import type { EngineContext } from "./context.js";
import type { DbModel } from "../extractors/db.js";
import { ensurePlaceholderArtifacts } from "./artifacts.js";
import { buildRbacArtifact } from "./rbacBuilder.js";
import { buildLgpdMap } from "./lgpdBuilder.js";
import { buildStackProfile } from "./stackProfile.js";
import { buildDepGraph } from "./depGraphBuilder.js";
import { buildCoverageMatrix } from "./coverageBuilder.js";

export async function runArtifactBuilders(
  stage: string,
  engine: EngineContext,
  opts: { dbModel: DbModel | null; dryRun: boolean; debug: boolean },
) {
  const { dbModel, dryRun, debug } = opts;

  if (stage === "extract") {
    // Stack profile (LLM-based repo scanner)
    await buildStackProfile(engine, { dryRun, debug });
    // TS/JS dependency graph + summary doc
    await buildDepGraph(engine, { dryRun, debug });
  }

  if (stage === "render") {
    await ensurePlaceholderArtifacts(engine);
    if (!dbModel || dryRun) return;
    await buildRbacArtifact(engine, dbModel);
    await buildLgpdMap(engine, dbModel);
  }

  if (stage === "check") {
    if (!dryRun) {
      await buildCoverageMatrix(engine);
    }
  }
}

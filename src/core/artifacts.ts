import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";

export async function ensurePlaceholderArtifacts(engine: EngineContext) {
  // Previously this helper wrote placeholder RBAC, LGPD, and FP artifacts.
  // To avoid masking missing or incomplete real data, it now only ensures
  // the evidence directory exists; actual artifacts must be produced by
  // dedicated extractors or writers.
  const dir = engine.evidenceDir;
  await fs.ensureDir(dir);
}

import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import type { DbModel } from "../extractors/db.js";

export async function buildLgpdMap(
  engine: EngineContext,
  model: DbModel | null,
) {
  const dir = engine.evidenceDir;
  await fs.ensureDir(dir);

  if (!model) return;

  const entries: {
    field: string;
    table: string;
    legalBasis: string;
    retention: string;
  }[] = [];

  for (const table of model.tables) {
    for (const col of table.columns) {
      entries.push({
        field: col.name,
        table: `${table.schema}.${table.name}`,
        legalBasis: "",
        retention: "",
      });
    }
  }

  if (!entries.length) return;

  const outPath = path.join(dir, "lgpd-map.json");
  await fs.writeJson(outPath, entries, { spaces: 2 });
}

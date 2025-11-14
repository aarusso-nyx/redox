import type { DbModel } from "../extractors/db.js";
import { writeDbAndErdDocs } from "./db-erd.js";

export async function writeDbAndErdFromModel(
  root: string,
  docsDir: string,
  model: DbModel,
) {
  await writeDbAndErdDocs(root, docsDir, model);
}

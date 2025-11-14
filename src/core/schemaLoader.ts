import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

const coreDir = path.dirname(fileURLToPath(import.meta.url));
const schemasDir = path.resolve(coreDir, "..", "schemas");

export async function loadSchemaFile(fileName: string): Promise<any> {
  const schemaPath = path.join(schemasDir, fileName);
  return fs.readJson(schemaPath);
}

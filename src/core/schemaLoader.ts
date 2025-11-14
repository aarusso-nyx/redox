import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectRoot = path.resolve(distDir, "..");

export async function loadSchemaFile(fileName: string): Promise<any> {
  const candidates = [
    // Packaged schemas under dist/ (for installed CLI)
    path.join(distDir, "schemas", fileName),
    // Source schemas in a dev/linked setup
    path.join(projectRoot, "src", "schemas", fileName),
  ];

  for (const candidate of candidates) {
    try {
      if (await fs.pathExists(candidate)) {
        return fs.readJson(candidate);
      }
    } catch {
      // ignore and try next candidate
    }
  }

  throw new Error(`Schema not found: ${fileName}`);
}

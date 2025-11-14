import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectRoot = path.resolve(distDir, "..");

export async function loadPrompt(relPath: string) {
  const baseName = path.basename(relPath);

  const candidates = [
    // As provided (supports absolute or cwd-relative override paths)
    relPath,
    // CWD-based prompts/core override
    path.join(process.cwd(), "prompts", "core", baseName),
    // Packaged prompts under dist/ (if present)
    path.join(distDir, "prompts", "core", baseName),
    // Source prompts in a dev/linked setup
    path.join(projectRoot, "src", "prompts", "core", baseName),
  ];

  for (const candidate of candidates) {
    try {
      if (await fs.pathExists(candidate)) {
        return fs.readFile(candidate, "utf8");
      }
    } catch {
      // ignore and try the next candidate
    }
  }

  throw new Error(`Prompt not found: ${relPath}`);
}

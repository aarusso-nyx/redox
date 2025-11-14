import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadPrompt(relPath: string) {
  // Try CWD-relative path first
  if (await fs.pathExists(relPath)) return fs.readFile(relPath, "utf8");

  // Fallback to prompts bundled with this package
  const baseName = path.basename(relPath);
  const pkgPrompt = path.join(pkgDir, "prompts", "core", baseName);
  return fs.readFile(pkgPrompt, "utf8");
}


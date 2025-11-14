import fs from "fs";
import path from "node:path";
import { sha256, type Evidence } from "../core/evidence.js";

export async function evidenceFileGate(root: string, evidenceFile: string) {
  if (!fs.existsSync(evidenceFile)) {
    return;
  }

  const raw = await fs.promises.readFile(evidenceFile, "utf8");
  const evidences: Evidence[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Evidence;
      evidences.push(parsed);
    } catch (err) {
      throw new Error(
        `EvidenceGate: invalid JSON line in ${path.basename(evidenceFile)} — ${String(err)}`,
      );
    }
  }

  if (!evidences.length) return;

  const errors: string[] = [];

  for (const ev of evidences) {
    const absPath = path.resolve(root, ev.path);
    if (!fs.existsSync(absPath)) {
      errors.push(`Missing evidence file: ${ev.path}`);
      continue;
    }

    const content = await fs.promises.readFile(absPath, "utf8");
    const lines = content.split(/\r?\n/);
    if (
      ev.startLine < 1 ||
      ev.endLine < ev.startLine ||
      ev.endLine > lines.length
    ) {
      errors.push(
        `Invalid line span for ${ev.path}: ${ev.startLine}-${ev.endLine}`,
      );
      continue;
    }

    const segment = lines.slice(ev.startLine - 1, ev.endLine).join("\n");
    const hash = sha256(segment);
    if (ev.sha256 && ev.sha256 !== hash) {
      errors.push(`SHA mismatch for ${ev.path}:${ev.startLine}-${ev.endLine}`);
    }
  }

  if (errors.length) {
    throw new Error(`EvidenceGate failed:\n${errors.join("\n")}`);
  }
}

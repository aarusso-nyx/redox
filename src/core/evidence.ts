import fs from "node:fs";
import path from "node:path";
import { createHash } from "crypto";

export type Evidence = {
  path: string;
  startLine: number;
  endLine: number;
  sha256: string;
  note?: string;
  tag?: string;
};

export function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function getEvidenceDir() {
  return process.env.REDOX_EVIDENCE_DIR || path.join("redox", "facts");
}

export async function saveEvidence(e: Evidence) {
  const dir = getEvidenceDir();
  const file = path.join(dir, "evidence.jsonl");
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.appendFile(file, JSON.stringify(e) + "\n");
}

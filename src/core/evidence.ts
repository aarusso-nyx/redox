import fs from "fs";
import { createHash } from "crypto";

export type Evidence = { path: string; startLine: number; endLine: number; sha256: string; note?: string; tag?: string };

export function sha256(content: string) {
  return createHash("sha256").update(content).digest("hex");
}
export function saveEvidence(e: Evidence) {
  fs.mkdirSync(".redox", { recursive: true });
  fs.appendFileSync(".redox/evidence.jsonl", JSON.stringify(e) + "\n");
}

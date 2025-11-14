import fs from "fs-extra";
import path from "node:path";

export type UsageEntry = {
  timestamp: string;
  runId: string;
  stage?: string;
  profile?: string;
  agent?: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  meta?: Record<string, unknown>;
};

let currentRunId: string | null = null;

export function getRunId(): string {
  if (currentRunId) return currentRunId;
  const envId = process.env.REDOX_RUN_ID;
  if (envId) {
    currentRunId = envId;
    return currentRunId;
  }
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  currentRunId = id;
  return currentRunId;
}

export async function recordUsage(entry: Omit<UsageEntry, "timestamp" | "runId">) {
  const baseDir = process.env.REDOX_USAGE_DIR || path.join("redox", ".redox");
  const dir = baseDir;
  const file = path.join(dir, "usage.jsonl");
  const full: UsageEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    runId: getRunId(),
  };
  await fs.ensureDir(dir);
  await fs.appendFile(file, JSON.stringify(full) + "\n", "utf8");
}

export async function readUsageEntries(): Promise<UsageEntry[]> {
  const baseDir = process.env.REDOX_USAGE_DIR || path.join("redox", ".redox");
  const file = path.join(baseDir, "usage.jsonl");
  if (!(await fs.pathExists(file))) return [];
  const raw = await fs.readFile(file, "utf8");
  const out: UsageEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as UsageEntry;
      out.push(parsed);
    } catch {
      continue;
    }
  }
  return out;
}

export async function summarizeUsage() {
  const entries = await readUsageEntries();
  if (!entries.length) {
    return { entries: 0, runs: 0, totalInput: 0, totalOutput: 0, totalTokens: 0, byModel: {}, byAgent: {} };
  }

  const runIds = new Set<string>();
  let totalInput = 0;
  let totalOutput = 0;
  let totalTokens = 0;
  const byModel: Record<string, { calls: number; input: number; output: number; total: number }> = {};
  const byAgent: Record<string, { calls: number; input: number; output: number; total: number }> = {};

  for (const e of entries) {
    runIds.add(e.runId);
    const inTok = e.inputTokens ?? 0;
    const outTok = e.outputTokens ?? 0;
    const totTok = e.totalTokens ?? inTok + outTok;
    totalInput += inTok;
    totalOutput += outTok;
    totalTokens += totTok;

    const mKey = e.model || "unknown";
    if (!byModel[mKey]) byModel[mKey] = { calls: 0, input: 0, output: 0, total: 0 };
    byModel[mKey].calls += 1;
    byModel[mKey].input += inTok;
    byModel[mKey].output += outTok;
    byModel[mKey].total += totTok;

    const aKey = e.agent || "unknown";
    if (!byAgent[aKey]) byAgent[aKey] = { calls: 0, input: 0, output: 0, total: 0 };
    byAgent[aKey].calls += 1;
    byAgent[aKey].input += inTok;
    byAgent[aKey].output += outTok;
    byAgent[aKey].total += totTok;
  }

  return {
    entries: entries.length,
    runs: runIds.size,
    totalInput,
    totalOutput,
    totalTokens,
    byModel,
    byAgent,
  };
}

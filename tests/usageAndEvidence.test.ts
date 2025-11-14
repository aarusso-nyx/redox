import { describe, it, expect } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { recordUsage, summarizeUsage } from "../src/core/usage.js";
import { saveEvidence, sha256 } from "../src/core/evidence.js";
import fsExtra from "fs-extra";

describe.skip("usage tracking", () => {
  it("aggregates usage by model and agent", async () => {
    if (!(fsExtra as any).pathExists) {
      (fsExtra as any).pathExists = async (p: string) =>
        (fsExtra as any).existsSync ? (fsExtra as any).existsSync(p) : false;
    }
    const tmp = path.join(process.cwd(), ".tmp-usage-test");
    const usageDir = path.join(tmp, ".redox");
    process.env.REDOX_USAGE_DIR = usageDir;
    await fs.remove(tmp);

    await recordUsage({
      model: "gpt-4.1",
      agent: "test-agent",
      inputTokens: 10,
      outputTokens: 5,
    });
    await recordUsage({
      model: "gpt-4.1",
      agent: "test-agent",
      inputTokens: 20,
      outputTokens: 10,
    });

    const summary = await summarizeUsage();
    expect(summary.entries).toBe(2);
    expect(summary.totalInput).toBe(30);
    expect(summary.totalOutput).toBe(15);
    expect(summary.totalTokens).toBe(45);
    expect(summary.byModel["gpt-4.1"].calls).toBe(2);
    expect(summary.byAgent["test-agent"].total).toBe(45);

    await fs.remove(tmp);
    delete process.env.REDOX_USAGE_DIR;
  });
});

describe.skip("evidence ledger", () => {
  it("writes evidence entries with sha256 hashes", async () => {
    const tmp = path.join(process.cwd(), ".tmp-evidence-test");
    const evDir = path.join(tmp, ".redox");
    process.env.REDOX_EVIDENCE_DIR = evDir;
    await fs.remove(tmp);

    const content = "example";
    const hash = sha256(content);
    expect(hash).toHaveLength(64);

    saveEvidence({
      path: "src/example.ts",
      startLine: 1,
      endLine: 5,
      sha256: hash,
    });

    const file = path.join(evDir, "evidence.jsonl");
    const raw = await fs.readFile(file, "utf8");
    const lines = raw.trim().split(/\r?\n/);
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0] ?? "{}");
    expect(entry.sha256).toBe(hash);
    expect(entry.path).toBe("src/example.ts");

    await fs.remove(tmp).catch(() => {});
    delete process.env.REDOX_EVIDENCE_DIR;
  });
});

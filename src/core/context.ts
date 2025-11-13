import fg from "fast-glob";
import fs from "fs/promises";

export type DetectContext = { root: string; files: string[]; read: (p: string) => Promise<string> };

export async function detectAndLoadContext(opts: any) {
  const root = process.cwd();
  const files = await fg(["**/*"], { cwd: root, dot: true, ignore: ["node_modules/**", "dist/**"] });
  const ctx: DetectContext = { root, files, read: (p) => fs.readFile(p, "utf8") };
  // Adapter selection will go here; for now return a trivial context
  return { adapterId: opts.stack ?? "auto", seedsDir: opts.seeds ?? null, ctx };
}

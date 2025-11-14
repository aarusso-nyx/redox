import fg from "fast-glob";
import fs from "fs/promises";
import path from "node:path";

export type DetectContext = {
  root: string;
  files: string[];
  read: (p: string) => Promise<string>;
};

export type EngineContext = {
  root: string;
  docsDir: string;
  diagramsDir: string;
  scriptsDir: string;
  evidenceDir: string;
  files: string[];
  profile: {
    hasNode: boolean;
    hasPHP: boolean;
    frameworks: Record<string, unknown>;
  };
  read: (p: string) => Promise<string>;
};

export async function detectAndLoadContext(opts: any): Promise<{
  adapterId: string;
  seedsDir: string | null;
  engine: EngineContext;
}> {
  const root = process.cwd();
  const docsDir = path.resolve(root, opts.out ?? "docs");
  const diagramsDir = path.join(docsDir, "diagrams");
  const scriptsDir = path.join(docsDir, "scripts");
  const evidenceDir = path.join(root, ".revdoc");

  const files = await fg(["**/*"], {
    cwd: root,
    dot: true,
    ignore: ["node_modules/**", "dist/**", ".revdoc/**"],
  });

  const hasNode = files.includes("package.json");
  const hasPHP = files.includes("composer.json");

  const engine: EngineContext = {
    root,
    docsDir,
    diagramsDir,
    scriptsDir,
    evidenceDir,
    files,
    profile: {
      hasNode,
      hasPHP,
      frameworks: {},
    },
    read: (p) => fs.readFile(path.resolve(root, p), "utf8"),
  };

  return {
    adapterId: opts.stack ?? "auto",
    seedsDir: opts.seeds ?? null,
    engine,
  };
}

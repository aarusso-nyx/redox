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
  flags: {
    dryRun: boolean;
    debug: boolean;
    verbose: boolean;
    quiet: boolean;
  };
};

export async function detectAndLoadContext(opts: any): Promise<{
  adapterId: string;
  seedsDir: string | null;
  engine: EngineContext;
}> {
  const cwd = process.cwd();
  const root = path.resolve(cwd, opts.dir ?? ".");
  const docsDir = opts.out
    ? path.resolve(cwd, opts.out)
    : path.join(root, "redox");
  const diagramsDir = path.join(docsDir, "diagrams");
  const scriptsDir = path.join(docsDir, "scripts");
  const evidenceDir = path.join(docsDir, ".redox");

  const files = await fg(["**/*"], {
    cwd: root,
    dot: true,
    ignore: ["node_modules/**", "dist/**", ".redox/**"],
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
    flags: {
      dryRun: !!opts.dryRun,
      debug: !!opts.debug,
      verbose: !!opts.verbose,
      quiet: !!opts.quiet,
    },
  };

  // Expose paths for helpers that don't receive EngineContext directly
  process.env.REDOX_EVIDENCE_DIR = evidenceDir;
  process.env.REDOX_USAGE_DIR = evidenceDir;
  process.env.REDOX_IDEA_DIR = evidenceDir;

  return {
    adapterId: opts.stack ?? "auto",
    seedsDir: opts.seeds ?? null,
    engine,
  };
}

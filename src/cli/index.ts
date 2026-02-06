#!/usr/bin/env node
import { Command } from "commander";
import { runAll, runDoctor } from "./runners.js";
import { printUsageReport } from "./usage.js";

const program = new Command()
  .name("redox")
  .description(
    "Reverse documentation engine (redox) - TS CLI with LLM-driven synthesis",
  )
  .option(
    "--stack <csv>",
    "force stack components (csv: backend,frontend,db,cloud)",
  )
  .option(
    "--phase <csv>",
    "phases to run: detect,extract,synthesize,render,check,review",
  )
  .option("--seeds <dir>", "project seeds directory")
  .option(
    "--seed-merge <order>",
    "seed merge order (project,stack,engine)",
    "project,stack,engine",
  )
  .option(
    "--gates <csv>",
    "gates to run",
    "schema,coverage,evidence,build,traceability",
  )
  .option("--out <dir>", "output directory (default: <dir>/redox)")
  .option("--clean", "remove existing redox output (docsDir) before running")
  .option(
    "--resume",
    "resume from existing artifacts when possible (skip completed stages)",
  )
  .option("--dry-run", "Plan actions without executing anything")
  .option(
    "--verbosity <level>",
    "verbosity ladder (0=silent,1=quiet,2=normal,3=verbose,4=debug)",
    "2",
  )
  .option("--maestro", "Use agentic Maestro orchestrator instead of scripted")
  .option("--usage", "Print token usage report")
  .option("--verify", "Check environment and required tools");

program
  .argument("[dir]", "target project directory", ".")
  .option("--profile <dev|user|audit|all>", "doc profile", "all")
  .action(async (dir) => {
    const opts = program.opts();
    if (opts.verify) {
      await runDoctor(opts);
      return;
    }
    if (opts.usage) {
      await printUsageReport();
      return;
    }
    await runAll({ ...opts, dir });
  });

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});

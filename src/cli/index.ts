#!/usr/bin/env node
import { Command } from "commander";
import {
  runAll,
  runDev,
  runUser,
  runAudit,
  runScan,
  runExtract,
  runSynthesize,
  runRender,
  runCheck,
  runDoctor,
  runReview,
  runMaestroCli,
} from "./runners.js";
import { printUsageReport } from "./usage.js";

const program = new Command()
  .name("redox")
  .description("Reverse documentation engine (redox) - TS CLI with LLM-driven synthesis")
  .option("--stack <adapterId>", "force a stack adapter (e.g., laravel-postgres-angular)")
  .option("--backend <name>", "override backend (laravel|nestjs|spring)")
  .option("--frontend <name>", "override frontend (angular|react|angularjs)")
  .option("--db <name>", "override db (postgres|oracle|mysql)")
  .option("--cloud <name>", "override cloud (aws|gcp|azure|none)")
  .option("--no-detect", "disable auto-detection entirely")
  .option("--seeds <dir>", "project seeds directory")
  .option("--seed-merge <order>", "seed merge order (project,stack,engine)", "project,stack,engine")
  .option("--gates <csv>", "gates to run", "schema,coverage,evidence,build,traceability")
  .option("--out <dir>", "output directory (default: <dir>/redox)")
  .option("--facts-only", "stop after extraction (no prose)")
  .option("--concurrency <n>", "parallel extractors", "4")
  .option("--dry-run", "Plan actions without executing anything")
  .option("--debug", "Verbose logging of actions, prompts, and gates")
  .option("--verbose", "More verbose logging for stages and gates")
  .option("--quiet", "Minimal output (no spinners, only errors)");

program
  .command("dev")
  .description("Build developer docs")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runDev({ ...program.opts(), dir }));
program
  .command("user")
  .description("Build user docs")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runUser({ ...program.opts(), dir }));
program
  .command("audit")
  .description("Build audit/assurance docs")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runAudit({ ...program.opts(), dir }));
program
  .command("all")
  .description("Run end-to-end pipeline")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runAll({ ...program.opts(), dir }));
program
  .command("scan")
  .description("Detect stack & map repo")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runScan({ ...program.opts(), dir }));
program
  .command("extract")
  .description("Extract facts only")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runExtract({ ...program.opts(), dir }));
program
  .command("synthesize")
  .description("Synthesize prose with gates")
  .argument("[dir]", "target project directory", ".")
  .option("--profile <dev|user|audit|all>", "doc profile", "dev")
  .action(async (dir, cmd) => runSynthesize({ ...program.opts(), ...cmd.opts(), dir }));
program
  .command("render")
  .description("Render diagrams")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runRender({ ...program.opts(), dir }));
program
  .command("check")
  .description("Run acceptance gates")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runCheck({ ...program.opts(), dir }));
program
  .command("review")
  .description("Run architecture/QA/ops/security/docs reviews")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runReview({ ...program.opts(), dir }));
program
  .command("maestro")
  .description("Run the Maestro LLM orchestrator (experimental)")
  .argument("[dir]", "target project directory", ".")
  .action(async (dir) => runMaestroCli({ ...program.opts(), dir }));
program
  .command("doctor")
  .description("Check environment and required tools")
  .action(async () => runDoctor(program.opts()));
program
  .command("usage")
  .description("Print token usage report from .redox/usage.jsonl")
  .action(async () => printUsageReport());

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
import { Command } from "commander";
import { runAll, runDev, runUser, runAudit, runScan, runExtract, runSynthesize, runRender, runCheck } from "./runners.js";

const program = new Command()
  .name("revdoc")
  .description("Reverse documentation engine (revdoc) - TS CLI with LLM-driven synthesis")
  .option("--stack <adapterId>", "force a stack adapter (e.g., laravel-postgres-angular)")
  .option("--backend <name>", "override backend (laravel|nestjs|spring)")
  .option("--frontend <name>", "override frontend (angular|react|angularjs)")
  .option("--db <name>", "override db (postgres|oracle|mysql)")
  .option("--cloud <name>", "override cloud (aws|gcp|azure|none)")
  .option("--no-detect", "disable auto-detection entirely")
  .option("--seeds <dir>", "project seeds directory")
  .option("--seed-merge <order>", "seed merge order (project,stack,engine)", "project,stack,engine")
  .option("--gates <csv>", "gates to run", "schema,coverage,evidence,build,traceability")
  .option("--out <dir>", "output docs directory", "docs")
  .option("--facts-only", "stop after extraction (no prose)")
  .option("--concurrency <n>", "parallel extractors", "4");

program
  .command("dev").description("Build developer docs").action(async () => runDev(program.opts()));
program
  .command("user").description("Build user docs").action(async () => runUser(program.opts()));
program
  .command("audit").description("Build audit/assurance docs").action(async () => runAudit(program.opts()));
program
  .command("all").description("Run end-to-end pipeline").action(async () => runAll(program.opts()));
program
  .command("scan").description("Detect stack & map repo").action(async () => runScan(program.opts()));
program
  .command("extract").description("Extract facts only").action(async () => runExtract(program.opts()));
program
  .command("synthesize").description("Synthesize prose with gates")
  .option("--profile <dev|user|audit|all>", "doc profile", "dev")
  .action(async (cmd) => runSynthesize({ ...program.opts(), ...cmd.opts() }));
program
  .command("render").description("Render diagrams").action(async () => runRender(program.opts()));
program
  .command("check").description("Run acceptance gates")
  .action(async () => runCheck(program.opts()));

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});

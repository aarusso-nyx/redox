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
  runTranslate,
  runExport,
} from "./runners.js";
import { resolveOutDir } from "./optionUtils.js";
import { printUsageReport } from "./usage.js";

const program = new Command()
  .name("redox")
  .description(
    "Reverse documentation engine (redox) - TS CLI with LLM-driven synthesis",
  )
  .option(
    "--stack <adapterId>",
    "force a stack adapter (e.g., laravel-postgres-angular)",
  )
  .option("--backend <name>", "override backend (laravel|nestjs|spring)")
  .option("--frontend <name>", "override frontend (angular|react|angularjs)")
  .option("--db <name>", "override db (postgres|oracle|mysql)")
  .option("--cloud <name>", "override cloud (aws|gcp|azure|none)")
  .option("--no-detect", "disable auto-detection entirely")
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
  .option("--facts-only", "stop after extraction (no prose)")
  .option("--concurrency <n>", "parallel extractors", "4")
  .option("--clean", "remove existing redox output (docsDir) before running")
  .option("--clobber", "alias for --clean")
  .option(
    "--resume",
    "resume from existing artifacts when possible (skip completed stages)",
  )
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
  .action(async (dir, cmd) => {
    const subcommandOpts =
      cmd && typeof (cmd as any).opts === "function"
        ? (cmd as any).opts()
        : (cmd ?? {});
    await runSynthesize({ ...program.opts(), ...subcommandOpts, dir });
  });
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
  .description("Print token usage report from facts/usage.jsonl")
  .action(async () => printUsageReport());

program
  .command("translate")
  .description("Translate Markdown docs into a target language")
  .argument("[dir]", "target project directory", ".")
  .option(
    "--lang <locale>",
    "target language (e.g., pt-BR, es-ES, fr-FR)",
    "pt-BR",
  )
  .option("--src <dir>", "source docs directory (default: ./redox)")
  .option(
    "--out-dir <dir>",
    "output directory for translated docs (default: <src>/<lang>)",
  )
  .option(
    "--include <glob>",
    "glob of files to include (relative to src)",
    "*.md",
  )
  .option("--exclude <glob>", "glob of files to exclude (relative to src)")
  .action(async (dir, cmd) => {
    const baseOpts = { ...program.opts(), dir };
    const raw =
      cmd && typeof (cmd as any).opts === "function"
        ? (cmd as any).opts()
        : (cmd ?? {});
    const tOpts = { ...raw };
    const outDir = resolveOutDir(tOpts as any);
    await runTranslate({
      ...baseOpts,
      ...tOpts,
      outDir,
    });
  });

program
  .command("export")
  .description("Render Markdown docs into PDF/HTML/DOCX formats (default: pdf)")
  .argument("[dir]", "target project directory", ".")
  .option("--formats <csv>", "comma-separated formats (pdf,html,docx)", "pdf")
  .option("--src <dir>", "source docs directory (default: ./redox)")
  .option(
    "--out-dir <dir>",
    "output directory for rendered docs (default: same as src)",
  )
  .option(
    "--include <glob>",
    "glob of files to include (relative to src)",
    "*.md",
  )
  .option("--exclude <glob>", "glob of files to exclude (relative to src)")
  .option("--css <path>", "CSS file to reference for HTML/PDF output")
  .option(
    "--reference-doc <path>",
    "Word reference document/template (.docx/.dotx) for DOCX output (pandoc only)",
  )
  .action(async (dir, cmd) => {
    const baseOpts = { ...program.opts(), dir };
    const raw =
      cmd && typeof (cmd as any).opts === "function"
        ? (cmd as any).opts()
        : (cmd ?? {});
    const eOpts = { ...raw };
    const outDir = resolveOutDir(eOpts as any);
    await runExport({
      ...baseOpts,
      ...eOpts,
      outDir,
    });
  });

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
import { Command } from "commander";
import { resolveOutDir } from "./optionUtils.js";
import { runExport } from "./runners.js";

const program = new Command()
  .name("redox-export")
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
  .option(
    "--verbosity <level>",
    "verbosity ladder (0=silent,1=quiet,2=normal,3=verbose,4=debug)",
    "2",
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

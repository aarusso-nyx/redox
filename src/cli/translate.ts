#!/usr/bin/env node
import { Command } from "commander";
import { resolveOutDir } from "./optionUtils.js";
import { runTranslate } from "./runners.js";

const program = new Command()
  .name("redox-translate")
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
    const tOpts = { ...raw };
    const outDir = resolveOutDir(tOpts as any);
    await runTranslate({
      ...baseOpts,
      ...tOpts,
      outDir,
    });
  });

program.parseAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});

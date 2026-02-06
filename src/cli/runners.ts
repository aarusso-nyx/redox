import fs from "fs-extra";
import path from "node:path";
import ora from "ora";
import { detectAndLoadContext } from "../core/context.js";
import { checkEnvironment } from "../core/env.js";
import { orchestrate } from "../core/orchestrator.js";
import { runMaestro } from "../core/maestro.js";
import { translateDocs } from "../core/translation.js";
import { exportDocs } from "../core/exportDocs.js";
import { setEngineEventListener, type EngineEvent } from "../core/events.js";
import {
  ProgressReporter,
  type ProgressMode,
  progressModeFromOpts,
} from "./progress.js";

type Opts = Record<string, any>;

function resolveVerbosity(rawOpts: Opts, _progressMode: ProgressMode) {
  const mapLevel = (v: string) => {
    const val = v.toLowerCase();
    if (["0", "quiet", "silent"].includes(val)) return "quiet";
    if (["1", "normal", "default"].includes(val)) return "normal";
    if (["2", "verbose", "info"].includes(val)) return "verbose";
    if (["3", "debug", "trace"].includes(val)) return "debug";
    return null;
  };

  const levelFromOpt = mapLevel(String(rawOpts.verbosity ?? "normal"));

  let level = levelFromOpt ?? "normal";
  if (rawOpts.debug) level = "debug";
  else if (rawOpts.verbose) level = "verbose";
  else if (rawOpts.quiet) level = "quiet";

  const quiet = level === "quiet";
  const debug = level === "debug";
  const verbose = level === "verbose" || level === "debug";

  return { level, quiet, verbose, debug };
}

async function maybeClean(engine: any, opts: Opts) {
  if (!opts.clean) return;
  const docsDir = engine.docsDir;
  if (!docsDir) return;
  try {
    if (await fs.pathExists(docsDir)) {
      await fs.remove(docsDir);
    }
  } catch {
    // best-effort cleanup; failures will surface later if critical
  }
}

async function withEngine<T>(
  label: string,
  opts: Opts,
  stage: (ctx: {
    adapterId: string;
    seedsDir: string | null;
    engine: any;
  }) => Promise<T>,
) {
  const progressMode: ProgressMode = progressModeFromOpts(opts);
  const verbosity = resolveVerbosity(opts, progressMode);
  const effectiveOpts: Opts = {
    ...opts,
    quiet: verbosity.quiet,
    verbose: verbosity.verbose,
    debug: verbosity.debug,
    verbosity: verbosity.level,
    progress: progressMode,
  };
  Object.assign(opts, effectiveOpts);

  const reporter = new ProgressReporter(progressMode);
  const useSpinner = !effectiveOpts.quiet && progressMode === "none";
  const spinner = useSpinner ? ora(label).start() : null;

  const printPlan = (ctx: {
    adapterId: string;
    seedsDir: string | null;
    engine: any;
  }) => {
    const lines = [
      `Plan: ${label}`,
      `  stage   : ${opts.stage ?? label}`,
      `  profile : ${effectiveOpts.profile ?? "auto"}`,
      `  gates   : ${effectiveOpts.gates ?? "schema,coverage,evidence,build,traceability"}`,
      `  verbosity: ${verbosity.level}`,
      `  adapter : ${ctx.adapterId}`,
      `  seeds   : ${ctx.seedsDir ?? "none"}`,
      `  out     : ${ctx.engine?.docsDir ?? effectiveOpts.out ?? path.join(process.cwd(), "redox")}`,
    ];
    console.log(lines.join("\n"));
  };

  try {
    const startedAt = Date.now();
    const pipelineStages = ["extract", "synthesize", "render", "check"];
    const completedStages = new Set<string>();
    let currentStage: string | null = null;
    let currentGate: string | null = null;

    setEngineEventListener((ev: EngineEvent) => {
      if (progressMode !== "none") {
        reporter.log(ev);
      }
      if (useSpinner) {
        if (ev.type === "stage-start" && ev.stage) {
          currentStage = ev.stage;
        } else if (ev.type === "stage-end" && ev.stage) {
          if (pipelineStages.includes(ev.stage)) {
            completedStages.add(ev.stage);
          }
          currentStage = null;
        } else if (ev.type === "gate-start" && ev.gate) {
          currentGate = ev.gate;
        } else if (ev.type === "gate-end" && ev.gate) {
          currentGate = null;
        }

        const elapsedMs = Date.now() - startedAt;
        const elapsedSec = Math.round(elapsedMs / 1000);
        const total = pipelineStages.length;
        const done = completedStages.size;
        const progress = total > 0 ? Math.min(1, done / total) : 0;
        const progressPct = Math.round(progress * 100);
        const etaSec =
          progress > 0
            ? Math.max(0, Math.round(elapsedSec * (1 / progress - 1)))
            : null;

        const stageLabel = currentStage ?? opts.stage ?? "";
        const gateLabel = currentGate ? ` gate=${currentGate}` : "";
        const etaLabel = etaSec !== null ? ` eta~${etaSec}s` : "";

        spinner!.text = `${label}: stage=${stageLabel || "idle"} time=${elapsedSec}s${etaLabel} progress=${progressPct}%${gateLabel}`;
      }
    });

    const ctx = await detectAndLoadContext(effectiveOpts);
    if (!effectiveOpts.quiet) {
      printPlan(ctx);
    }
    const result = await stage(ctx);
    if (spinner) spinner.succeed("done");
    return result;
  } catch (e) {
    if (spinner) spinner.fail(String(e));
    throw e;
  }
}

export async function runAll(opts: Opts) {
  return withEngine(
    "redox all",
    opts,
    async ({ engine, adapterId, seedsDir }) => {
      await maybeClean(engine, opts);
      return orchestrate("all", {
        ...opts,
        engine,
        adapterId,
        seedsDir,
        resume: !!opts.resume,
      });
    },
  );
}

export async function runDev(opts: Opts) {
  return withEngine(
    "redox dev",
    opts,
    async ({ engine, adapterId, seedsDir }) => {
      await maybeClean(engine, opts);
      return orchestrate("dev", {
        ...opts,
        engine,
        adapterId,
        seedsDir,
        resume: !!opts.resume,
      });
    },
  );
}

export async function runUser(opts: Opts) {
  return withEngine(
    "redox user",
    opts,
    async ({ engine, adapterId, seedsDir }) => {
      await maybeClean(engine, opts);
      return orchestrate("user", {
        ...opts,
        engine,
        adapterId,
        seedsDir,
        resume: !!opts.resume,
      });
    },
  );
}

export async function runAudit(opts: Opts) {
  return withEngine(
    "redox audit",
    opts,
    async ({ engine, adapterId, seedsDir }) => {
      await maybeClean(engine, opts);
      return orchestrate("audit", {
        ...opts,
        engine,
        adapterId,
        seedsDir,
        resume: !!opts.resume,
      });
    },
  );
}

export async function runScan(opts: Opts) {
  const useSpinner = !opts.quiet;
  const spinner = useSpinner ? ora("redox scan").start() : null;
  try {
    await detectAndLoadContext(opts);
    if (spinner) spinner.succeed("detected");
  } catch (e) {
    if (spinner) spinner.fail(String(e));
    throw e;
  }
}

export async function runExtract(opts: Opts) {
  return withEngine("redox extract", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("extract", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runSynthesize(opts: Opts) {
  const label = `redox synthesize (${opts.profile})`;
  return withEngine(label, opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("synthesize", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runRender(opts: Opts) {
  return withEngine("redox render", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("render", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runCheck(opts: Opts) {
  return withEngine("redox check", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("check", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runReview(opts: Opts) {
  return withEngine("redox review", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("review", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runMaestroCli(opts: Opts) {
  return withEngine("redox maestro", opts, ({ engine }) =>
    runMaestro(engine, opts),
  );
}

export async function runDoctor(_opts: Opts) {
  const spinner = ora("redox doctor").start();
  try {
    await checkEnvironment(console);
    spinner.succeed("checked");
  } catch (e) {
    spinner.fail(String(e));
    throw e;
  }
}

export async function runTranslate(opts: Opts) {
  return withEngine("redox translate", opts, async ({ engine }) => {
    const lang = opts.lang;
    if (!lang || typeof lang !== "string") {
      throw new Error(
        "Missing required option --lang <locale> (e.g., pt-BR, es-ES).",
      );
    }

    await translateDocs({
      engine,
      lang,
      srcDir: opts.src ?? "docs",
      outDir: opts.outDir ?? undefined,
      include: opts.include ?? "*.md",
      exclude: opts.exclude,
      dryRun: opts.dryRun ?? false,
      debug: opts.debug ?? false,
    });
  });
}

export async function runExport(opts: Opts) {
  return withEngine("redox export", opts, async ({ engine }) => {
    await exportDocs({
      engine,
      formats: opts.formats,
      srcDir: opts.src ?? "docs",
      outDir: opts.outDir ?? undefined,
      include: opts.include ?? "*.md",
      exclude: opts.exclude,
      css: opts.css,
      referenceDoc:
        opts.referenceDoc ?? opts.referenceDocx ?? opts.referenceDocDotx,
      dryRun: opts.dryRun ?? false,
      debug: opts.debug ?? false,
    });
  });
}

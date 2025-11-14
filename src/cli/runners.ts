import ora from "ora";
import { detectAndLoadContext } from "../core/context.js";
import { checkEnvironment } from "../core/env.js";
import { orchestrate } from "../core/orchestrator.js";

type Opts = Record<string, any>;

async function withEngine<T>(label: string, opts: Opts, stage: (ctx: { adapterId: string; seedsDir: string | null; engine: any }) => Promise<T>) {
  const spinner = ora(label).start();
  try {
    const ctx = await detectAndLoadContext(opts);
    const result = await stage(ctx);
    spinner.succeed("done");
    return result;
  } catch (e) {
    spinner.fail(String(e));
    throw e;
  }
}

export async function runAll(opts: Opts) {
  return withEngine("redox all", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("all", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runDev(opts: Opts) {
  return withEngine("redox dev", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("dev", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runUser(opts: Opts) {
  return withEngine("redox user", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("user", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runAudit(opts: Opts) {
  return withEngine("redox audit", opts, ({ engine, adapterId, seedsDir }) =>
    orchestrate("audit", { ...opts, engine, adapterId, seedsDir }),
  );
}

export async function runScan(opts: Opts) {
  const spinner = ora("redox scan").start();
  try {
    await detectAndLoadContext(opts);
    spinner.succeed("detected");
  } catch (e) {
    spinner.fail(String(e));
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

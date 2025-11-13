import ora from "ora";
import { detectAndLoadContext } from "../core/context.js";
import { orchestrate } from "../core/orchestrator.js";

type Opts = Record<string, any>;

export async function runAll(opts: Opts)      { const s=ora("revdoc all").start(); try { await orchestrate("all", opts); s.succeed("done"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runDev(opts: Opts)      { const s=ora("revdoc dev").start(); try { await orchestrate("dev", opts); s.succeed("done"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runUser(opts: Opts)     { const s=ora("revdoc user").start(); try { await orchestrate("user", opts); s.succeed("done"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runAudit(opts: Opts)    { const s=ora("revdoc audit").start(); try { await orchestrate("audit", opts); s.succeed("done"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runScan(opts: Opts)     { const s=ora("revdoc scan").start(); try { await detectAndLoadContext(opts); s.succeed("detected"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runExtract(opts: Opts)  { const s=ora("revdoc extract").start(); try { await orchestrate("extract", opts); s.succeed("extracted"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runSynthesize(opts: Opts){const s=ora(`revdoc synthesize (${opts.profile})`).start(); try { await orchestrate("synthesize", opts); s.succeed("synthesized"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runRender(opts: Opts)   { const s=ora("revdoc render").start(); try { await orchestrate("render", opts); s.succeed("rendered"); } catch(e){ s.fail(String(e)); throw e; } }
export async function runCheck(opts: Opts)    { const s=ora("revdoc check").start(); try { await orchestrate("check", opts); s.succeed("passed"); } catch(e){ s.fail(String(e)); throw e; } }

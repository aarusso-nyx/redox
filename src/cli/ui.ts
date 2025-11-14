#!/usr/bin/env node
import blessed from "blessed";
import path from "node:path";
import { detectAndLoadContext } from "../core/context.js";
import { orchestrate } from "../core/orchestrator.js";
import { runMaestro } from "../core/maestro.js";
import {
  setEngineEventListener,
  emitEngineEvent,
  type EngineEvent,
} from "../core/events.js";

type OrchestratorMode = "scripted" | "maestro";
type MainView =
  | "actions"
  | "usage"
  | "agentsTop"
  | "agentsLog"
  | "logs"
  | "progress"
  | "config"
  | "flags"
  | "ideas"
  | "evidence";

type RunConfig = {
  dir: string;
  profile: "dev" | "user" | "audit" | "all";
  mode: OrchestratorMode;
  stage: "dev" | "user" | "audit" | "all";
  gates: string;
  dryRun: boolean;
  debug: boolean;
  verbose: boolean;
  quiet: boolean;
};

type AgentStats = {
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
};

type UiState = {
  config: RunConfig;
  repoRoot: string | null;
  docsDir: string | null;
  evidenceDir: string | null;
  running: boolean;
  lastError: string | null;
  currentStage: string | null;
  runStartedAt: number | null;
  lastRunDurationMs: number | null;
  events: EngineEvent[];
  llmEvents: EngineEvent[];
  agentStats: Record<string, AgentStats>;
  docs: Set<string>;
  artifacts: Set<string>;
  gatesStatus: Record<string, { started: number; ended: number }>;
  completedStages: Set<string>;
};

function createInitialState(dir: string): UiState {
  return {
    config: {
      dir,
      profile: "dev",
      mode: "scripted",
      stage: "dev",
      gates: "schema,coverage,evidence,build,traceability",
      dryRun: false,
      debug: false,
      verbose: true,
      quiet: false,
    },
    repoRoot: null,
    docsDir: null,
    evidenceDir: null,
    running: false,
    lastError: null,
    currentStage: null,
    runStartedAt: null,
    lastRunDurationMs: null,
    events: [],
    llmEvents: [],
    agentStats: {},
    docs: new Set(),
    artifacts: new Set(),
    gatesStatus: {},
    completedStages: new Set(),
  };
}

function updateStateFromEvent(state: UiState, ev: EngineEvent) {
  state.events.push(ev);
  if (state.events.length > 500) state.events.shift();

  if (ev.type === "stage-start") {
    state.currentStage = ev.stage ?? null;
  }
  if (ev.type === "stage-end") {
    state.currentStage = null;
    if (
      ev.stage === "extract" ||
      ev.stage === "synthesize" ||
      ev.stage === "render" ||
      ev.stage === "check" ||
      ev.stage === "review"
    ) {
      state.completedStages.add(ev.stage);
    }
  }

  if (ev.type === "gate-start" && ev.gate) {
    const g = state.gatesStatus[ev.gate] ?? { started: 0, ended: 0 };
    g.started += 1;
    state.gatesStatus[ev.gate] = g;
  }
  if (ev.type === "gate-end" && ev.gate) {
    const g = state.gatesStatus[ev.gate] ?? { started: 0, ended: 0 };
    g.ended += 1;
    state.gatesStatus[ev.gate] = g;
  }

  if (ev.type === "llm-call") {
    state.llmEvents.push(ev);
    if (state.llmEvents.length > 200) state.llmEvents.shift();
    const agent = ev.agent ?? "unknown";
    const inputTokens = Number(ev.data?.inputTokens ?? 0) || 0;
    const outputTokens = Number(ev.data?.outputTokens ?? 0) || 0;
    const totalTokens =
      Number(ev.data?.totalTokens ?? inputTokens + outputTokens) || 0;
    const stats = state.agentStats[agent] ?? {
      calls: 0,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    stats.calls += 1;
    stats.totalTokens += totalTokens;
    stats.inputTokens += inputTokens;
    stats.outputTokens += outputTokens;
    state.agentStats[agent] = stats;
  }

  if (ev.type === "doc-written" && ev.file) {
    state.docs.add(path.basename(ev.file));
  }
  if (ev.type === "artifact-written" && ev.file) {
    state.artifacts.add(path.basename(ev.file));
  }
}

async function main() {
  const dirFromArg =
    process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : ".";
  const state = createInitialState(dirFromArg);

  // Capture all console output and route it through the engine event bus so
  // logs are rendered inside the central panel instead of leaking to the TTY.
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    const message = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    emitEngineEvent({
      type: "log",
      data: { level: "info", message },
    });
  };
  console.error = (...args: unknown[]) => {
    const message = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    emitEngineEvent({
      type: "log",
      data: { level: "error", message },
    });
  };

  const screen = blessed.screen({
    smartCSR: true,
    title: "redox-ui",
  });

  let mainView: MainView = "actions";
  let leftVisible = true;
  let rightVisible = true;

  const topBar = blessed.box({
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    tags: true,
    style: { fg: "white", bg: "blue" },
  });

  const bottomBar = blessed.box({
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    tags: true,
    style: { fg: "white", bg: "blue" },
  });

  const leftPanel = blessed.box({
    top: 1,
    left: 0,
    bottom: 2,
    width: 30,
    label: "Hints",
    border: "line",
    style: { border: { fg: "gray" } },
  });

  const rightPanel = blessed.box({
    top: 1,
    right: 0,
    bottom: 2,
    width: 30,
    label: "Mini dash",
    border: "line",
    style: { border: { fg: "gray" } },
  });

  const mainBox = blessed.box({
    top: 1,
    left: 30,
    right: 30,
    bottom: 2,
    label: "Main",
    border: "line",
    tags: true,
    style: { border: { fg: "white" } },
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    vi: true,
  });

  screen.append(topBar);
  screen.append(bottomBar);
  screen.append(leftPanel);
  screen.append(rightPanel);
  screen.append(mainBox);

  function layout() {
    leftPanel.hidden = !leftVisible;
    rightPanel.hidden = !rightVisible;
    if (leftVisible && rightVisible) {
      mainBox.left = 30;
      mainBox.right = 30;
    } else if (leftVisible && !rightVisible) {
      mainBox.left = 30;
      mainBox.right = 0;
    } else if (!leftVisible && rightVisible) {
      mainBox.left = 0;
      mainBox.right = 30;
    } else {
      mainBox.left = 0;
      mainBox.right = 0;
    }
  }

  function renderTop() {
    const cfg = state.config;
    const repo = state.repoRoot ? path.basename(state.repoRoot) : "(detecting)";
    const mode = cfg.mode === "maestro" ? "maestro" : "scripted";
    const flags = [
      cfg.dryRun ? "dry-run" : "",
      cfg.debug ? "debug" : "",
      cfg.verbose ? "verbose" : "",
      cfg.quiet ? "quiet" : "",
    ]
      .filter(Boolean)
      .join(",");
    const stage = state.currentStage ?? (state.running ? cfg.stage : "idle");
    const status = state.running
      ? "{green-fg}RUNNING{/}"
      : state.lastError
        ? "{red-fg}FAILED{/}"
        : "{blue-fg}IDLE{/}";
    // Elapsed and estimated times
    let elapsedMs: number | null = null;
    if (state.runStartedAt !== null) {
      elapsedMs = Date.now() - state.runStartedAt;
    } else if (state.lastRunDurationMs !== null) {
      elapsedMs = state.lastRunDurationMs;
    }
    const elapsedSec = elapsedMs !== null ? Math.round(elapsedMs / 1000) : null;

    const estSec =
      state.lastRunDurationMs !== null
        ? Math.round(state.lastRunDurationMs / 1000)
        : null;

    // Phase progress (extract → synthesize → render → check)
    const pipeline = ["extract", "synthesize", "render", "check"];
    const completed = pipeline.filter((s) =>
      state.completedStages.has(s),
    ).length;
    const total = pipeline.length;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    topBar.setContent(
      ` repo={bold}${repo}{/} profile=${cfg.profile} stage=${stage} mode=${mode} gates=${cfg.gates} flags=[${flags}] ${status}` +
        (elapsedSec !== null
          ? ` time=${elapsedSec}s` +
            (estSec !== null ? `~${estSec}s` : "") +
            ` progress=${progressPct}%`
          : ""),
    );
  }

  function renderLeftPanel() {
    const cfg = state.config;
    let content = "Keys:\n";
    content += "  F5/Enter: run\n";
    content += "  Tab: cycle view\n";
    content += "  a/t/g/l/p/c/f/i/e/o: switch view\n";
    content += "  [/]: toggle side panels\n";
    content += "\nConfig:\n";
    content += `  dir: ${cfg.dir}\n`;
    content += `  profile: ${cfg.profile}\n`;
    content += `  stage: ${cfg.stage}\n`;
    content += `  mode: ${cfg.mode}\n`;
    leftPanel.setContent(content);
  }

  function renderRightPanel() {
    const totalCalls = Object.values(state.agentStats).reduce(
      (acc, s) => acc + s.calls,
      0,
    );
    const totalTokens = Object.values(state.agentStats).reduce(
      (acc, s) => acc + s.totalTokens,
      0,
    );
    let content = "Usage (current run)\n";
    content += `  calls: ${totalCalls}\n`;
    content += `  tokens: ${totalTokens}\n`;
    content += "\nArtifacts:\n";
    content += `  docs: ${state.docs.size}\n`;
    content += `  json: ${state.artifacts.size}\n`;
    content += "\nGates:\n";
    for (const [gate, stats] of Object.entries(state.gatesStatus)) {
      content += `  ${gate}: ${stats.ended}/${stats.started}\n`;
    }
    rightPanel.setContent(content);
  }

  function renderMain() {
    const cfg = state.config;
    if (mainView === "actions") {
      const lines: string[] = [];
      lines.push("Actions (stages & gates):");
      for (const ev of state.events.slice(-80)) {
        if (ev.type === "stage-start" || ev.type === "stage-end") {
          lines.push(
            `${ev.timestamp} stage=${ev.stage} type=${ev.type} success=${"success" in ev ? ev.success : ""}`,
          );
        } else if (ev.type === "gate-start" || ev.type === "gate-end") {
          lines.push(
            `${ev.timestamp} gate=${ev.gate} type=${ev.type} success=${"success" in ev ? ev.success : ""}`,
          );
        } else if (ev.type === "log") {
          const level = ev.data?.level ?? "info";
          const msg = ev.data?.message ?? "";
          lines.push(`${ev.timestamp} [${level}] ${msg}`);
        }
      }
      mainBox.setContent(lines.join("\n") || "No actions yet.");
    } else if (mainView === "usage") {
      const lines: string[] = [];
      lines.push("Recent LLM calls:");
      for (const ev of state.llmEvents.slice(-40)) {
        const d = ev.data ?? {};
        lines.push(
          `${ev.timestamp} agent=${ev.agent ?? "?"} model=${ev.model ?? "?"} in=${d.inputTokens ?? ""} out=${
            d.outputTokens ?? ""
          } tot=${d.totalTokens ?? ""}`,
        );
      }
      mainBox.setContent(lines.join("\n") || "No LLM calls yet.");
    } else if (mainView === "agentsTop") {
      const lines: string[] = [];
      lines.push("Agents (aggregated this run):");
      const entries = Object.entries(state.agentStats).sort(
        (a, b) => b[1].totalTokens - a[1].totalTokens,
      );
      for (const [agent, stats] of entries) {
        lines.push(
          `${agent} calls=${stats.calls} tokens=${stats.totalTokens} in=${stats.inputTokens} out=${stats.outputTokens}`,
        );
      }
      mainBox.setContent(lines.join("\n") || "No agent statistics yet.");
    } else if (mainView === "agentsLog") {
      const lines: string[] = [];
      lines.push("Doc & artifact events:");
      for (const ev of state.events.slice(-60)) {
        if (ev.type === "doc-written") {
          lines.push(`${ev.timestamp} DOC  ${ev.file}`);
        } else if (ev.type === "artifact-written") {
          lines.push(`${ev.timestamp} JSON ${ev.file}`);
        }
      }
      mainBox.setContent(lines.join("\n") || "No doc/artifact events yet.");
    } else if (mainView === "logs") {
      const lines: string[] = [];
      lines.push("Logs (raw console):");
      const logs = state.events.filter((ev) => ev.type === "log").slice(-80);
      for (const ev of logs) {
        const level = ev.data?.level ?? "info";
        const msg = ev.data?.message ?? "";
        lines.push(`${ev.timestamp} [${level}] ${msg}`);
      }
      mainBox.setContent(lines.join("\n") || "No logs yet.");
    } else if (mainView === "progress") {
      const lines: string[] = [];
      lines.push("Progress & artifacts:");
      lines.push(`  running: ${state.running}`);
      lines.push(`  current stage: ${state.currentStage ?? "(none)"}`);
      lines.push("");
      lines.push("Gates:");
      for (const [gate, stats] of Object.entries(state.gatesStatus)) {
        lines.push(`  ${gate}: ${stats.ended}/${stats.started}`);
      }
      lines.push("");
      lines.push("Docs:");
      lines.push(`  ${Array.from(state.docs).join(", ") || "(none)"}`);
      lines.push("");
      lines.push("Artifacts:");
      lines.push(`  ${Array.from(state.artifacts).join(", ") || "(none)"}`);
      mainBox.setContent(lines.join("\n"));
    } else if (mainView === "config") {
      const lines: string[] = [];
      lines.push("Config:");
      lines.push(`  dir: ${cfg.dir}`);
      lines.push(`  profile: ${cfg.profile}`);
      lines.push(`  stage: ${cfg.stage}`);
      lines.push(`  mode: ${cfg.mode}`);
      lines.push(`  gates: ${cfg.gates}`);
      lines.push(`  dryRun: ${cfg.dryRun}`);
      lines.push(`  debug: ${cfg.debug}`);
      lines.push(`  verbose: ${cfg.verbose}`);
      lines.push(`  quiet: ${cfg.quiet}`);
      lines.push("");
      lines.push("Paths:");
      lines.push(`  repoRoot: ${state.repoRoot ?? "(pending)"}`);
      lines.push(`  docsDir: ${state.docsDir ?? "(pending)"}`);
      lines.push(`  evidenceDir: ${state.evidenceDir ?? "(pending)"}`);
      mainBox.setContent(lines.join("\n"));
    } else if (mainView === "flags") {
      const lines: string[] = [];
      lines.push("Flags & toggles (press keys to toggle):");
      lines.push(`  d) dry-run: ${cfg.dryRun}`);
      lines.push(`  b) debug:   ${cfg.debug}`);
      lines.push(`  v) verbose: ${cfg.verbose}`);
      lines.push(`  Q) quiet:   ${cfg.quiet}`);
      lines.push("");
      lines.push(`  P) profile: ${cfg.profile}`);
      lines.push(`  m) mode:    ${cfg.mode}`);
      lines.push(`  s) stage:   ${cfg.stage}`);
      lines.push("");
      lines.push(
        "Note: gates string can be edited via config in a future iteration.",
      );
      mainBox.setContent(lines.join("\n"));
    } else if (mainView === "ideas") {
      const lines: string[] = [];
      lines.push("Ideas (pushIdea tool calls):");
      for (const ev of state.events.slice(-200)) {
        if (ev.type !== "idea-pushed") continue;
        const d = ev.data ?? {};
        const tag = typeof d.tag === "string" && d.tag ? ` [${d.tag}]` : "";
        lines.push(`${ev.timestamp} ${ev.agent ?? ""}${tag}: ${d.note ?? ""}`);
      }
      mainBox.setContent(lines.join("\n") || "No ideas yet.");
    } else if (mainView === "evidence") {
      const lines: string[] = [];
      lines.push("Evidence (saveEvidence tool calls):");
      for (const ev of state.events.slice(-200)) {
        if (ev.type !== "evidence-saved") continue;
        const d = ev.data ?? {};
        const span =
          typeof d.startLine === "number" && typeof d.endLine === "number"
            ? `${d.startLine}-${d.endLine}`
            : "";
        const sha =
          typeof d.sha256 === "string" && d.sha256
            ? ` (${String(d.sha256).slice(0, 8)}…)`
            : "";
        lines.push(
          `${ev.timestamp} ${d.path ?? ""}${span ? ":" + span : ""}${sha}`,
        );
      }
      mainBox.setContent(lines.join("\n") || "No evidence yet.");
    }
  }

  function renderBottom() {
    const viewName =
      mainView === "actions"
        ? "actions"
        : mainView === "usage"
          ? "usage"
          : mainView === "agentsTop"
            ? "agents-top"
            : mainView === "agentsLog"
              ? "agents-log"
              : mainView === "progress"
                ? "progress"
                : mainView === "config"
                  ? "config"
                  : mainView === "ideas"
                    ? "ideas"
                    : mainView === "evidence"
                      ? "evidence"
                      : "flags";
    const left = leftVisible ? "on" : "off";
    const right = rightVisible ? "on" : "off";
    const msg = state.lastError ? ` ERR: ${state.lastError}` : "";
    bottomBar.setContent(
      ` VIEW=${viewName}  left=${left} right=${right}  (F5/Enter=run, Tab=cycle view, a/t/g/l/p/c/f=switch)` +
        msg,
    );
  }

  function redraw() {
    layout();
    renderTop();
    renderLeftPanel();
    renderRightPanel();
    renderMain();
    renderBottom();
    screen.render();
  }

  setEngineEventListener((ev) => {
    updateStateFromEvent(state, ev);
    redraw();
  });

  async function startRun() {
    if (state.running) return;
    state.running = true;
    state.lastError = null;
    state.currentStage = null;
    state.runStartedAt = Date.now();
    state.events = [];
    state.llmEvents = [];
    state.agentStats = {};
    state.docs.clear();
    state.artifacts.clear();
    state.gatesStatus = {};
    state.completedStages.clear();
    redraw();

    try {
      const ctx = await detectAndLoadContext({
        dir: state.config.dir,
        out: undefined,
        dryRun: state.config.dryRun,
        debug: state.config.debug,
        verbose: state.config.verbose,
        quiet: state.config.quiet,
      });
      state.repoRoot = ctx.engine.root;
      state.docsDir = ctx.engine.docsDir;
      state.evidenceDir = ctx.engine.evidenceDir;
      redraw();

      if (state.config.mode === "maestro") {
        await runMaestro(ctx.engine, {
          ...state.config,
        });
      } else {
        await orchestrate(state.config.stage, {
          engine: ctx.engine,
          adapterId: ctx.adapterId,
          seedsDir: ctx.seedsDir,
          profile: state.config.profile,
          gates: state.config.gates,
          dryRun: state.config.dryRun,
          debug: state.config.debug,
          verbose: state.config.verbose,
          quiet: state.config.quiet,
        });
      }
    } catch (err) {
      state.lastError = (err as Error).message ?? String(err);
    } finally {
      if (state.runStartedAt !== null) {
        state.lastRunDurationMs = Date.now() - state.runStartedAt;
      }
      state.runStartedAt = null;
      state.running = false;
      redraw();
    }
  }

  screen.key(["C-c", "q"], () => {
    setEngineEventListener(null);
    console.log = originalLog;
    console.error = originalError;
    screen.destroy();
    process.exit(0);
  });

  screen.key(["tab"], () => {
    const order: MainView[] = [
      "actions",
      "usage",
      "agentsTop",
      "agentsLog",
      "logs",
      "progress",
      "config",
      "flags",
      "ideas",
      "evidence",
    ];
    const idx = order.indexOf(mainView);
    mainView = order[(idx + 1) % order.length];
    redraw();
  });

  screen.key(["S-tab"], () => {
    const order: MainView[] = [
      "actions",
      "usage",
      "agentsTop",
      "agentsLog",
      "logs",
      "progress",
      "config",
      "flags",
      "ideas",
      "evidence",
    ];
    const idx = order.indexOf(mainView);
    mainView = order[(idx - 1 + order.length) % order.length];
    redraw();
  });

  screen.key(["a"], () => {
    mainView = "actions";
    redraw();
  });
  screen.key(["t"], () => {
    mainView = "usage";
    redraw();
  });
  screen.key(["g"], () => {
    mainView = "agentsTop";
    redraw();
  });
  screen.key(["l"], () => {
    mainView = "agentsLog";
    redraw();
  });
  screen.key(["o"], () => {
    mainView = "logs";
    redraw();
  });
  screen.key(["p"], () => {
    mainView = "progress";
    redraw();
  });
  screen.key(["c"], () => {
    mainView = "config";
    redraw();
  });
  screen.key(["f"], () => {
    mainView = "flags";
    redraw();
  });
  screen.key(["i"], () => {
    mainView = "ideas";
    redraw();
  });
  screen.key(["e"], () => {
    mainView = "evidence";
    redraw();
  });

  screen.key(["["], () => {
    leftVisible = !leftVisible;
    redraw();
  });
  screen.key(["]"], () => {
    rightVisible = !rightVisible;
    redraw();
  });

  screen.key(["enter", "f5"], () => {
    void startRun();
  });

  // flag toggles in flags view
  screen.key(["d"], () => {
    if (mainView !== "flags") return;
    state.config.dryRun = !state.config.dryRun;
    redraw();
  });
  screen.key(["b"], () => {
    if (mainView !== "flags") return;
    state.config.debug = !state.config.debug;
    redraw();
  });
  screen.key(["v"], () => {
    if (mainView !== "flags") return;
    state.config.verbose = !state.config.verbose;
    redraw();
  });
  screen.key(["Q"], () => {
    if (mainView !== "flags") return;
    state.config.quiet = !state.config.quiet;
    redraw();
  });

  screen.key(["P"], () => {
    if (mainView !== "flags") return;
    const order: RunConfig["profile"][] = ["dev", "user", "audit", "all"];
    const idx = order.indexOf(state.config.profile);
    state.config.profile = order[(idx + 1) % order.length];
    redraw();
  });

  screen.key(["m"], () => {
    if (mainView !== "flags") return;
    state.config.mode =
      state.config.mode === "scripted" ? "maestro" : "scripted";
    redraw();
  });

  screen.key(["s"], () => {
    if (mainView !== "flags") return;
    const order: RunConfig["stage"][] = ["dev", "user", "audit", "all"];
    const idx = order.indexOf(state.config.stage);
    state.config.stage = order[(idx + 1) % order.length];
    redraw();
  });

  redraw();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

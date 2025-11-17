#!/usr/bin/env node
import blessed from "blessed";
import fs from "fs-extra";
import path from "node:path";
import { detectAndLoadContext } from "../core/context.js";
import { orchestrate } from "../core/orchestrator.js";
import { runMaestro, gatherState } from "../core/maestro.js";
import {
  setEngineEventListener,
  emitEngineEvent,
  type EngineEvent,
} from "../core/events.js";
import { summarizeUsage } from "../core/usage.js";

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
  // Comma-separated doc families (informational; profile+stage drive behavior).
  docs: string;
  gates: string;
  // Model + token controls exposed in the UI (initialised from env but
  // currently informational; engine still uses environment variables).
  writerModel: string;
  maestroModel: string;
  reviewerModel: string;
  translatorModel: string;
  maxOutputTokens: number;
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
      docs: "dev,user,audit",
      gates: "schema,coverage,evidence,build,traceability",
      writerModel: process.env.REDOX_MODEL_WRITER ?? "gpt-5.1",
      maestroModel:
        process.env.REDOX_MODEL_MAESTRO ??
        process.env.REDOX_MODEL_WRITER ??
        "gpt-5.1",
      reviewerModel:
        process.env.REDOX_MODEL_REVIEW ??
        process.env.REDOX_MODEL_WRITER ??
        "gpt-5.1",
      translatorModel:
        process.env.REDOX_MODEL_TRANSLATOR ??
        process.env.REDOX_MODEL_WRITER ??
        "gpt-5.1",
      maxOutputTokens: 10_000,
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
    width: "40%",
    label: "Config",
    border: "line",
    style: { border: { fg: "gray" } },
  });

  const rightPanel = blessed.box({
    top: 1,
    left: "40%",
    bottom: 2,
    width: "60%",
    label: "Progress",
    border: "line",
    style: { border: { fg: "gray" } },
  });

  const mainBox = blessed.box({
    top: 3,
    left: 0,
    right: 0,
    bottom: 2,
    label: "Details",
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
  // Ensure the main details panel is the background layer and
  // side panels sit on top for a true two-pane layout.
  screen.append(mainBox);
  screen.append(leftPanel);
  screen.append(rightPanel);

  async function loadInitialOutDirState() {
    try {
      const ctx = await detectAndLoadContext({
        dir: state.config.dir,
        out: undefined,
        dryRun: false,
        debug: false,
        verbose: false,
        quiet: false,
      });
      state.repoRoot = ctx.engine.root;
      state.docsDir = ctx.engine.docsDir;
      state.evidenceDir = ctx.engine.evidenceDir;

      // Inspect current docs/artifacts state (persisted plan).
      const plan = await gatherState(ctx.engine);
      if (plan.docs.overview) state.docs.add("Overview.md");
      if (plan.docs.architecture) state.docs.add("Architecture Guide.md");
      if (plan.docs.db) state.docs.add("Database Reference.md");
      if (plan.docs.userGuide) state.docs.add("User Guide.md");
      if (plan.docs.fpReport) state.docs.add("Function Point Report.md");

      if (plan.artifacts.apiMap) state.artifacts.add("api-map.json");
      if (plan.artifacts.routes) state.artifacts.add("routes-*.json");
      if (plan.artifacts.useCases) state.artifacts.add("use-cases.json");
      if (plan.artifacts.coverageMatrix)
        state.artifacts.add("coverage-matrix.json");
      if (plan.artifacts.fpAppendix)
        state.artifacts.add("fp-appendix.json");
      if (plan.artifacts.rbac) state.artifacts.add("rbac.json");
      if (plan.artifacts.lgpd) state.artifacts.add("lgpd-map.json");

      // Approximate completed stages based on persisted artifacts.
      const stages = new Set<string>();
      if (plan.artifacts.apiMap) stages.add("extract");
      if (
        plan.docs.overview ||
        plan.docs.architecture ||
        plan.docs.db ||
        plan.docs.userGuide ||
        plan.docs.fpReport
      ) {
        stages.add("synthesize");
      }
      const erdPath = path.join(plan.docsDir, "ERD.md");
      if (await fs.pathExists(erdPath)) {
        stages.add("render");
      }
      if (plan.artifacts.coverageMatrix) {
        stages.add("check");
      }
      state.completedStages = stages;

      // Seed token usage and agent stats from persisted usage.jsonl
      const usage = await summarizeUsage();
      for (const [agent, stats] of Object.entries(usage.byAgent)) {
        state.agentStats[agent] = {
          calls: stats.calls,
          totalTokens: stats.total,
          inputTokens: stats.input,
          outputTokens: stats.output,
        };
      }
    } catch {
      // Best-effort; UI still works without persisted state.
    }
  }

  function layout() {
    leftPanel.hidden = !leftVisible;
    rightPanel.hidden = !rightVisible;
    // Main box always spans full width; side panels overlay the top rows.
    mainBox.left = 0;
    mainBox.right = 0;
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

    const tokens = Object.values(state.agentStats).reduce(
      (acc, s) => acc + s.totalTokens,
      0,
    );

    topBar.setContent(
      ` repo={bold}${repo}{/} profile={cyan-fg}${cfg.profile}{/} stage={yellow-fg}${stage}{/} mode=${mode}` +
        ` gates=${cfg.gates} flags=[${flags}] ${status}` +
        (elapsedSec !== null
          ? ` time={green-fg}${elapsedSec}s{/}` +
            (estSec !== null ? `~${estSec}s` : "") +
            ` progress={green-fg}${progressPct}%{/}`
          : "") +
        ` tokens={magenta-fg}${tokens}{/}`,
    );
  }

  function renderLeftPanel() {
    const cfg = state.config;
    let content = "{bold}Run Configuration{/}\n";
    content += ` dir: ${cfg.dir}\n`;
    content += ` profile: ${cfg.profile} (P to cycle)\n`;
    content += ` stage: ${cfg.stage} (s to cycle)\n`;
    content += ` mode: ${cfg.mode} (m to toggle)\n`;
    content += ` docs: ${cfg.docs}\n`;
    content += ` gates: ${cfg.gates}\n`;
    content += "\n{bold}Models{/}\n";
    content += ` writer: ${cfg.writerModel}\n`;
    content += ` maestro: ${cfg.maestroModel}\n`;
    content += ` reviewer: ${cfg.reviewerModel}\n`;
    content += ` translator: ${cfg.translatorModel}\n`;
    content += ` maxOutputTokens: ${cfg.maxOutputTokens}\n`;
    content += "\n{bold}Flags{/}\n";
    content += ` dryRun: ${cfg.dryRun} (d)\n`;
    content += ` debug: ${cfg.debug} (b)\n`;
    content += ` verbose: ${cfg.verbose} (v)\n`;
    content += ` quiet: ${cfg.quiet} (Q)\n`;
    content += "\n{bold}Keys{/}\n";
    content += " F5/Enter: run\n";
    content += " Tab/S-Tab: cycle view\n";
    content += " a/t/g/l/p/c/f/i/e/o: switch view\n";
    content += " [/]: toggle side panels\n";
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
    let content = "{bold}Progress{/}\n";
    content += ` calls: ${totalCalls}\n`;
    content += ` tokens: ${totalTokens}\n`;
    content += "\nDocs:\n";
    content += ` docs: ${state.docs.size}\n`;
    content += ` json: ${state.artifacts.size}\n`;
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
      lines.push("{bold}Actions (stages & gates){/}");
      for (const ev of state.events.slice(-80)) {
        if (ev.type === "stage-start" || ev.type === "stage-end") {
          const ok =
            "success" in ev && typeof ev.success === "boolean"
              ? ev.success
              : null;
          const color =
            ev.type === "stage-start"
              ? "yellow-fg"
              : ok === true
                ? "green-fg"
                : ok === false
                  ? "red-fg"
                  : "white-fg";
          lines.push(
            `{${color}}stage=${ev.stage} type=${ev.type} success=${ok}{/}`,
          );
        } else if (ev.type === "gate-start" || ev.type === "gate-end") {
          const ok =
            "success" in ev && typeof ev.success === "boolean"
              ? ev.success
              : null;
          const color =
            ev.type === "gate-start"
              ? "yellow-fg"
              : ok === true
                ? "green-fg"
                : ok === false
                  ? "red-fg"
                  : "white-fg";
          lines.push(
            `{${color}}gate=${ev.gate} type=${ev.type} success=${ok}{/}`,
          );
        } else if (ev.type === "log") {
          const level = ev.data?.level ?? "info";
          const msg = ev.data?.message ?? "";
          const color =
            level === "error"
              ? "red-fg"
              : level === "warn"
                ? "yellow-fg"
                : "white-fg";
          lines.push(`{${color}}[${level}] ${msg}{/}`);
        }
      }
      mainBox.setContent(lines.join("\n") || "No actions yet.");
    } else if (mainView === "usage") {
      const lines: string[] = [];
      lines.push("{bold}Recent LLM calls{/}");
      for (const ev of state.llmEvents.slice(-40)) {
        const d = ev.data ?? {};
        lines.push(
          `agent=${ev.agent ?? "?"} model=${ev.model ?? "?"} in=${
            d.inputTokens ?? ""
          } out=${d.outputTokens ?? ""} tot=${d.totalTokens ?? ""}`,
        );
      }
      mainBox.setContent(lines.join("\n") || "No LLM calls yet.");
    } else if (mainView === "agentsTop") {
      const lines: string[] = [];
      lines.push("Agents (aggregated this run):");
      const entries = Object.entries(state.agentStats).sort((a, b) => {
        return b[1].totalTokens - a[1].totalTokens;
      });
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
      lines.push("{bold}Logs (raw console){/}");
      const logs = state.events.filter((ev) => ev.type === "log").slice(-80);
      for (const ev of logs) {
        const level = ev.data?.level ?? "info";
        const msg = ev.data?.message ?? "";
        const color =
          level === "error"
            ? "red-fg"
            : level === "warn"
              ? "yellow-fg"
              : "white-fg";
        lines.push(`{${color}}[${level}] ${msg}{/}`);
      }
      mainBox.setContent(lines.join("\n") || "No logs yet.");
    } else if (mainView === "progress") {
      const lines: string[] = [];
      lines.push("{bold}Progress & artifacts{/}");
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
      lines.push("{bold}Config{/}");
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
      lines.push("{bold}Flags & toggles{/}");
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

  // Load any existing outDir/.redox state so the UI can
  // show which docs/artifacts/stages are already complete
  // before the first run.
  await loadInitialOutDirState();
  redraw();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

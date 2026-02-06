import chalk from "chalk";
import path from "node:path";
import type { EngineEvent } from "../core/events.js";

export type ProgressMode = "live" | "none";

type TaskStatus = "pending" | "running" | "ok" | "fail" | "skip";

type Task = {
  label: string;
  status: TaskStatus;
  detail?: string;
  startedAt?: number;
  endedAt?: number;
  tokens?: number;
  artifact?: string;
};

const icons: Record<TaskStatus, string> = {
  pending: "⏺",
  running: "⏳",
  ok: "✅",
  fail: "❌",
  skip: "⏭",
};

function fmtMs(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m > 0) return `${m}m${sec.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

export class ProgressReporter {
  private readonly mode: ProgressMode;
  private totalTokens = 0;
  private readonly tasks: Map<string, Task> = new Map();
  private readonly phaseStack: string[] = [];

  constructor(mode: ProgressMode) {
    this.mode = mode;
  }

  private printLine(task: Task) {
    if (this.mode === "none") return;
    const elapsed =
      task.startedAt && task.endedAt
        ? fmtMs(task.endedAt - task.startedAt)
        : task.startedAt
          ? fmtMs(Date.now() - task.startedAt)
          : "";
    const statusColor =
      task.status === "ok"
        ? chalk.greenBright
        : task.status === "fail"
          ? chalk.redBright
          : task.status === "skip"
            ? chalk.gray
            : task.status === "running"
              ? chalk.cyanBright
              : chalk.white;
    const parts = [
      statusColor(`${icons[task.status]} ${task.label}`),
      elapsed ? chalk.dim(elapsed) : "",
      task.artifact ? chalk.blue(task.artifact) : "",
      task.tokens ? chalk.green(`tokens:${task.tokens}`) : "",
      task.detail ? chalk.yellow(task.detail) : "",
    ].filter(Boolean);
    console.log(parts.join("  "));
  }

  private upsertTask(key: string, partial: Partial<Task>) {
    const existing = this.tasks.get(key);
    const merged: Task = {
      label: existing?.label ?? partial.label ?? key,
      status: existing?.status ?? "pending",
      detail: partial.detail ?? existing?.detail,
      startedAt: partial.startedAt ?? existing?.startedAt,
      endedAt: partial.endedAt ?? existing?.endedAt,
      tokens: partial.tokens ?? existing?.tokens,
      artifact: partial.artifact ?? existing?.artifact,
    };
    if (partial.status) merged.status = partial.status;
    this.tasks.set(key, merged);
    this.printLine(merged);
  }

  log(event: EngineEvent) {
    if (this.mode === "none") return;

    if (event.type === "llm-call") {
      const total = Number(event.data?.totalTokens ?? 0);
      if (!Number.isNaN(total)) this.totalTokens += total;
      return;
    }

    const baseKey =
      event.file ??
      event.data?.name ??
      event.data?.phase ??
      event.gate ??
      event.stage ??
      "task";
    const key = String(baseKey);

    if (event.type === "stage-start") {
      this.phaseStack.push(event.stage ?? "");
      this.upsertTask(key, {
        label: `Phase: ${event.stage ?? ""}`,
        status: "running",
        startedAt: Date.now(),
      });
      return;
    }
    if (event.type === "stage-end") {
      this.phaseStack.pop();
      this.upsertTask(key, {
        status: event.success === false ? "fail" : "ok",
        endedAt: Date.now(),
        detail: event.success === false ? "stage failed" : undefined,
      });
      return;
    }

    if (event.type === "phase-start" || event.type === "gate-start") {
      const label =
        event.type === "gate-start"
          ? `Gate: ${event.gate}`
          : `Task: ${event.data?.name ?? event.data?.phase ?? key}`;
      this.upsertTask(key, {
        label,
        status: "running",
        startedAt: Date.now(),
        artifact: event.data?.artifact
          ? path.basename(String(event.data.artifact))
          : undefined,
      });
      return;
    }

    if (event.type === "phase-end" || event.type === "gate-end") {
      this.upsertTask(key, {
        status: event.success === false ? "fail" : "ok",
        endedAt: Date.now(),
        detail: event.success === false ? "failed" : undefined,
      });
      return;
    }

    if (event.type === "step-end") {
      const status: TaskStatus =
        event.data?.status === "fail"
          ? "fail"
          : event.data?.status === "skip"
            ? "skip"
            : "ok";
      const label = `Step: ${event.data?.name ?? key}`;
      this.upsertTask(key, {
        label,
        status,
        startedAt: this.tasks.get(key)?.startedAt ?? Date.now(),
        endedAt: Date.now(),
        detail: event.data?.error ? String(event.data.error) : undefined,
      });
      return;
    }

    if (event.type === "artifact-written" || event.type === "doc-written") {
      const label = `Artifact: ${path.basename(event.file ?? key)}`;
      this.upsertTask(key, {
        label,
        status: "ok",
        startedAt: Date.now(),
        endedAt: Date.now(),
        artifact: path.basename(event.file ?? ""),
      });
      return;
    }
  }
}

export function progressModeFromOpts(_opts: Record<string, any>): ProgressMode {
  return "live";
}

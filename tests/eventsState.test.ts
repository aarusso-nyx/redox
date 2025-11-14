import { describe, it, expect } from "vitest";
import type { EngineEvent } from "../src/core/events.js";

type AgentStats = {
  calls: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
};

type UiStateShape = {
  agentStats: Record<string, AgentStats>;
  docs: Set<string>;
  artifacts: Set<string>;
  gatesStatus: Record<string, { started: number; ended: number }>;
};

function updateStateFromEventLite(state: UiStateShape, ev: EngineEvent) {
  if (ev.type === "llm-call") {
    const agent = ev.agent ?? "unknown";
    const inputTokens = Number(ev.data?.inputTokens ?? 0) || 0;
    const outputTokens = Number(ev.data?.outputTokens ?? 0) || 0;
    const totalTokens = Number(ev.data?.totalTokens ?? inputTokens + outputTokens) || 0;
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
    state.docs.add(ev.file);
  }

  if (ev.type === "artifact-written" && ev.file) {
    state.artifacts.add(ev.file);
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
}

describe("event-based state aggregation (UI core)", () => {
  it("aggregates agent stats, docs, artifacts, and gate counts from events", () => {
    const state: UiStateShape = {
      agentStats: {},
      docs: new Set(),
      artifacts: new Set(),
      gatesStatus: {},
    };

    const events: EngineEvent[] = [
      {
        type: "llm-call",
        timestamp: new Date().toISOString(),
        agent: "overview-stack.md",
        model: "gpt-5.1",
        stage: "synthesize",
        data: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      },
      {
        type: "llm-call",
        timestamp: new Date().toISOString(),
        agent: "overview-stack.md",
        model: "gpt-5.1",
        stage: "synthesize",
        data: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      },
      {
        type: "doc-written",
        timestamp: new Date().toISOString(),
        agent: "overview-stack.md",
        file: "Overview.md",
      },
      {
        type: "artifact-written",
        timestamp: new Date().toISOString(),
        agent: "use-cases.md:json",
        file: "use-cases.json",
      },
      {
        type: "gate-start",
        timestamp: new Date().toISOString(),
        gate: "schema",
      },
      {
        type: "gate-end",
        timestamp: new Date().toISOString(),
        gate: "schema",
        success: true,
      },
    ];

    for (const ev of events) {
      updateStateFromEventLite(state, ev);
    }

    const stats = state.agentStats["overview-stack.md"];
    expect(stats.calls).toBe(2);
    expect(stats.totalTokens).toBe(180);
    expect(stats.inputTokens).toBe(120);
    expect(stats.outputTokens).toBe(60);

    expect(state.docs.has("Overview.md")).toBe(true);
    expect(state.artifacts.has("use-cases.json")).toBe(true);
    expect(state.gatesStatus.schema.started).toBe(1);
    expect(state.gatesStatus.schema.ended).toBe(1);
  });
});

import { describe, it, expect } from "vitest";
import { traceabilityGate } from "../src/gates/traceability.js";

describe("traceabilityGate", () => {
  it("passes when stats match and nothing is unmapped", () => {
    const matrix = {
      routes: ["r1"],
      endpoints: ["e1"],
      useCases: [{ id: "uc1", title: "Test" }],
      links: [{ routeId: "r1", endpointId: "e1", useCaseId: "uc1" }],
      unmapped: {
        routes: [],
        endpoints: [],
      },
      stats: {
        routeCount: 1,
        endpointCount: 1,
        useCaseCount: 1,
        linkCount: 1,
      },
    };

    expect(() => traceabilityGate(matrix)).not.toThrow();
  });

  it("fails when there are unmapped routes or endpoints", () => {
    const matrix = {
      routes: ["r1"],
      endpoints: ["e1"],
      useCases: [],
      links: [],
      unmapped: {
        routes: ["r1"],
        endpoints: ["e1"],
      },
      stats: {
        routeCount: 1,
        endpointCount: 1,
        useCaseCount: 0,
        linkCount: 0,
      },
    };

    expect(() => traceabilityGate(matrix)).toThrowError(
      /TraceabilityGate failed: routes=1 endpoints=1/,
    );
  });
});

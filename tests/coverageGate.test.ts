import { describe, it, expect } from "vitest";
import { coverageGate } from "../src/gates/coverage.js";

describe("coverageGate", () => {
  it("passes when all routes and endpoints are covered", () => {
    const routes = [{ id: "r1" }, { id: "r2" }];
    const endpoints = [{ id: "e1" }, { id: "e2" }];
    const links = [
      { routeId: "r1", endpointId: "e1", useCaseId: "uc1" },
      { routeId: "r2", endpointId: "e2", useCaseId: "uc2" },
    ];

    expect(() => coverageGate(routes, endpoints, links)).not.toThrow();
  });

  it("fails when some routes or endpoints are not covered", () => {
    const routes = [{ id: "r1" }, { id: "r2" }];
    const endpoints = [{ id: "e1" }, { id: "e2" }];
    const links = [{ routeId: "r1", endpointId: "e1", useCaseId: "uc1" }];

    expect(() => coverageGate(routes, endpoints, links)).toThrowError(
      /CoverageGate failed: routes=1 endpoints=1/,
    );
  });
});

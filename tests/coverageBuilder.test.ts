import { describe, it, expect } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import { buildCoverageMatrix } from "../src/core/coverageBuilder.js";
import fsExtra from "fs-extra";
import type { EngineContext } from "../src/core/context.js";

function makeEngine(evidenceDir: string): EngineContext {
  return {
    root: process.cwd(),
    docsDir: "",
    diagramsDir: "",
    scriptsDir: "",
    evidenceDir,
    files: [],
    profile: {
      hasNode: false,
      hasPHP: false,
      frameworks: {},
    },
    read: async () => "",
    flags: {
      dryRun: false,
      debug: false,
      verbose: false,
      quiet: false,
    },
  };
}

describe("buildCoverageMatrix", () => {
  it("builds matrix from api-map, routes, and use-cases artifacts", async () => {
    // Ensure fs-extra has a pathExists helper in this test environment
    if (!(fsExtra as any).pathExists) {
      (fsExtra as any).pathExists = async (p: string) =>
        (fsExtra as any).existsSync ? (fsExtra as any).existsSync(p) : false;
    }
    const tmpDir = path.join(process.cwd(), ".tmp-coverage-test");
    const evidenceDir = path.join(tmpDir, ".redox");
    await fs.remove(tmpDir);
    await fs.ensureDir(evidenceDir);

    const apiMap = {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      endpoints: [
        { id: "GET /users", method: "GET", path: "/users", evidence: [] },
        { id: "POST /users", method: "POST", path: "/users", evidence: [] },
      ],
    };
    const routes = {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      framework: "react",
      routes: [
        { id: "route:/users", path: "/users" },
        { id: "route:/users/new", path: "/users/new" },
      ],
    };
    const useCases = {
      schemaVersion: "1.0",
      generatedAt: new Date().toISOString(),
      roles: ["user"],
      cases: [
        {
          id: "UC1",
          title: "List users",
          mainFlow: [
            {
              id: "step1",
              action: "Open users list",
              refs: {
                routeIds: ["route:/users"],
                endpointIds: ["GET /users"],
              },
            },
          ],
        },
      ],
    };

    await fs.writeFile(
      path.join(evidenceDir, "api-map.json"),
      JSON.stringify(apiMap),
      "utf8",
    );
    await fs.writeFile(
      path.join(evidenceDir, "routes-react.json"),
      JSON.stringify(routes),
      "utf8",
    );
    await fs.writeFile(
      path.join(evidenceDir, "use-cases.json"),
      JSON.stringify(useCases),
      "utf8",
    );

    const engine = makeEngine(evidenceDir);
    await buildCoverageMatrix(engine);

    const coveragePath = path.join(evidenceDir, "coverage-matrix.json");
    const matrix = await fs.readJson(coveragePath);

    expect(matrix.routes).toContain("route:/users");
    expect(matrix.routes).toContain("route:/users/new");
    expect(matrix.endpoints).toContain("GET /users");
    expect(matrix.endpoints).toContain("POST /users");
    expect(matrix.useCases).toEqual([{ id: "UC1", title: "List users" }]);
    expect(matrix.links).toContainEqual({
      routeId: "route:/users",
      endpointId: "GET /users",
      useCaseId: "UC1",
    });
    expect(matrix.unmapped.routes).toContain("route:/users/new");
    expect(matrix.unmapped.endpoints).toContain("POST /users");
    expect(matrix.stats.routeCount).toBe(matrix.routes.length);
    expect(matrix.stats.endpointCount).toBe(matrix.endpoints.length);
    expect(matrix.stats.useCaseCount).toBe(matrix.useCases.length);
    expect(matrix.stats.linkCount).toBe(matrix.links.length);

    await fs.remove(tmpDir);
  });
});

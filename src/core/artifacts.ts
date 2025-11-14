import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";

export async function ensurePlaceholderArtifacts(engine: EngineContext) {
  const dir = engine.evidenceDir;
  await fs.ensureDir(dir);
  const now = new Date().toISOString();

  const coveragePath = path.join(dir, "coverage-matrix.json");
  if (!(await fs.pathExists(coveragePath))) {
    const coverage = {
      schemaVersion: "1.0",
      generatedAt: now,
      routes: [] as string[],
      endpoints: [] as string[],
      useCases: [] as { id: string; title?: string }[],
      links: [] as { routeId: string; endpointId: string; useCaseId: string }[],
      unmapped: {
        routes: [] as string[],
        endpoints: [] as string[],
      },
      stats: {
        routeCount: 0,
        endpointCount: 0,
        useCaseCount: 0,
        linkCount: 0,
      },
    };
    await fs.writeJson(coveragePath, coverage, { spaces: 2 });
  }

  const rbacPath = path.join(dir, "rbac.json");
  if (!(await fs.pathExists(rbacPath))) {
    const rbac = {
      schemaVersion: "1.0",
      generatedAt: now,
      sourceRepo: engine.root,
      stack: {},
      rbacIlfTables: [] as string[],
      roles: [
        {
          id: "placeholder-admin",
          name: "Placeholder Admin",
          description: "Placeholder role for initial RBAC gate checks.",
          inherits: [],
          evidence: [],
        },
      ],
      permissions: [
        {
          id: "placeholder-access",
          name: "Placeholder Access",
          description: "Placeholder permission for initial RBAC gate checks.",
          actions: [],
          constraints: [],
          evidence: [],
        },
      ],
      roleBindings: [
        {
          roleId: "placeholder-admin",
          permissionId: "placeholder-access",
          effect: "allow",
          evidence: [
            {
              path: "README.md",
              startLine: 1,
              endLine: 1,
            },
          ],
        },
      ],
      bindings: {
        endpointBindings: [] as any[],
        routeBindings: [] as any[],
        entityBindings: [] as any[],
      },
      defaults: {
        unknownEndpointPolicy: "deny",
        unknownRoutePolicy: "deny",
      },
      unmapped: {
        rolesWithoutPermissions: [] as string[],
        permissionsWithoutBindings: [] as string[],
        endpointsWithoutRole: [] as string[],
        routesWithoutRole: [] as string[],
      },
      stats: {
        roleCount: 1,
        permissionCount: 1,
        endpointBindingCount: 0,
        routeBindingCount: 0,
        entityBindingCount: 0,
      },
    };
    await fs.writeJson(rbacPath, rbac, { spaces: 2 });
  }

  const lgpdPath = path.join(dir, "lgpd-map.json");
  if (!(await fs.pathExists(lgpdPath))) {
    const lgpd: any[] = [];
    await fs.writeJson(lgpdPath, lgpd, { spaces: 2 });
  }

  const fpPath = path.join(dir, "fp-appendix.json");
  if (!(await fs.pathExists(fpPath))) {
    const gscItems = [];
    for (let i = 1; i <= 14; i += 1) {
      gscItems.push({
        id: i,
        name: `GSC ${i}`,
        rating: 0,
        rationale: "Placeholder rating.",
      });
    }
    const fp = {
      schemaVersion: "1.0",
      generatedAt: now,
      policy: "generous",
      items: [] as any[],
      gsc: gscItems,
      ufp: 0,
      vaf: 1.0,
      afp: 0,
      sensitivity: {
        ufpLow: 0,
        ufpHigh: 0,
        afpLow: 0,
        afpHigh: 0,
        notes: "Placeholder FP appendix; replace with real counts.",
      },
    };
    await fs.writeJson(fpPath, fp, { spaces: 2 });
  }
}


import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import type { DbModel } from "../extractors/db.js";

export async function buildRbacArtifact(
  engine: EngineContext,
  model: DbModel | null,
) {
  const dir = engine.evidenceDir;
  await fs.ensureDir(dir);

  if (!model) return;

  const rbacTables = model.tables.filter(
    (t) => /role/i.test(t.name) || /permission/i.test(t.name),
  );
  if (!rbacTables.length) return;

  const now = new Date().toISOString();

  const doc = {
    schemaVersion: "1.0",
    generatedAt: now,
    sourceRepo: engine.root,
    stack: {},
    rbacIlfTables: rbacTables.map((t) => `${t.schema}.${t.name}`),
    roles: [] as any[],
    permissions: [] as any[],
    roleBindings: [] as any[],
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
      roleCount: 0,
      permissionCount: 0,
      endpointBindingCount: 0,
      routeBindingCount: 0,
      entityBindingCount: 0,
    },
  };

  const outPath = path.join(dir, "rbac.json");
  await fs.writeJson(outPath, doc, { spaces: 2 });
}

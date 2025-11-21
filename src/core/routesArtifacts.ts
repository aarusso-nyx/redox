import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import type { RoutesDoc, FrontendRoute } from "./types.js";

export async function writeRoutesArtifacts(
  engine: EngineContext,
  frontend: any,
  logEnabled: boolean,
) {
  await fs.ensureDir(engine.evidenceDir);
  const now = new Date().toISOString();

  const appendRoutes = async (
    framework: string,
    data: any[],
    buildRoute: (r: any, idx: number) => FrontendRoute,
  ) => {
    if (!data.length) return;
    const routes = data.map(buildRoute);
    const byId = new Map(routes.map((r) => [r.id, r]));
    for (const r of routes) {
      if (r.parentId && byId.has(r.parentId)) {
        const parent = byId.get(r.parentId)!;
        parent.children = parent.children ?? [];
        parent.children.push(r.id);
      }
    }
    const doc: RoutesDoc = {
      schemaVersion: "1.0",
      generatedAt: now,
      framework,
      routes,
    };
    const fileName = `routes-${framework}.json`;
    const out = path.join(engine.evidenceDir, fileName);
    await fs.writeJson(out, doc, { spaces: 2 });
    if (logEnabled) {
      console.log("[redox][debug] Routes artifact written", {
        framework,
        path: out,
        routes: routes.length,
      });
    }
    return routes.length;
  };

  const reactRoutes: any[] = frontend?.react?.routes ?? [];
  if (reactRoutes.length) {
    await appendRoutes("react", reactRoutes, (r: any, idx: number) => {
      const id =
        typeof r.id === "string" && r.id.startsWith("react:")
          ? r.id
          : `react:${r.id ?? r.path ?? idx}`;
      const parentId =
        typeof r.parentId === "string"
          ? r.parentId.startsWith("react:")
            ? r.parentId
            : `react:${r.parentId}`
          : undefined;
      const startLine = r.line ?? 1;
      return {
        id,
        path: r.path ?? "/",
        parentId,
        children: [] as string[],
        component: {
          name: r.element ?? undefined,
          file: r.file,
          startLine,
          endLine: startLine,
        },
        lazy: false,
        guards: [] as string[],
        resolvers: [] as string[],
        params: [] as string[],
        dataKeys: [] as string[],
        roles: [] as string[],
        apiCalls: [] as any[],
        evidence: [
          {
            path: r.file,
            startLine,
            endLine: startLine,
          },
        ],
      };
    });
  }

  const angular: any[] = frontend?.angular?.routes ?? [];
  if (angular.length) {
    await appendRoutes("angular", angular, (r: any, idx: number) => {
      const id =
        typeof r.id === "string" && r.id.startsWith("angular:")
          ? r.id
          : `angular:${r.id ?? r.path ?? idx}`;
      const parentId =
        typeof r.parentId === "string"
          ? r.parentId.startsWith("angular:")
            ? r.parentId
            : `angular:${r.parentId}`
          : undefined;
      const startLine = r.line ?? 1;
      return {
        id,
        path: r.path ?? "/",
        parentId,
        children: [] as string[],
        component: r.component
          ? {
              name: r.component ?? undefined,
              file: r.file,
              startLine,
              endLine: startLine,
            }
          : undefined,
        lazy: r.lazy ?? false,
        guards: r.guards ?? [],
        resolvers: r.resolvers ?? [],
        params: [] as string[],
        dataKeys: r.dataKeys ?? [],
        roles: [] as string[],
        apiCalls: [] as any[],
        evidence: [
          {
            path: r.file,
            startLine,
            endLine: startLine,
          },
        ],
      };
    });
  }

  // Blade view relations -> pseudo routes for coverage
  const bladeViews: any[] = frontend?.blade?.relations ?? [];
  if (bladeViews.length) {
    const bladeRoutes = bladeViews.map((rel, idx) => ({
      id: `blade:${rel.route ?? idx}`,
      path: rel.route ?? rel.view ?? `view:${idx}`,
      parentId: undefined,
      children: [] as string[],
      component: {
        name: rel.view ?? "",
        file: rel.file ?? "",
        startLine: rel.line ?? 1,
        endLine: rel.line ?? 1,
      },
      lazy: false,
      guards: [] as string[],
      resolvers: [] as string[],
      params: [] as string[],
      dataKeys: [] as string[],
      roles: [] as string[],
      apiCalls: [] as any[],
      evidence: [
        {
          path: rel.file ?? "",
          startLine: rel.line ?? 1,
          endLine: rel.line ?? 1,
        },
      ],
    }));
    await appendRoutes("blade", bladeRoutes, (r) => r);
  }
}

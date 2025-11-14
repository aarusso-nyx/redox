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

  const reactRoutes: any[] = frontend?.react?.routes ?? [];
  if (reactRoutes.length) {
    const routes: FrontendRoute[] = reactRoutes.map((r: any, idx: number) => ({
      id: `react:${r.path ?? idx}`,
      path: r.path ?? "/",
      parentId: undefined,
      children: [] as string[],
      component: {
        name: r.element ?? undefined,
        file: r.file,
        startLine: 1,
        endLine: 1,
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
          startLine: 1,
          endLine: 1,
        },
      ],
    }));
    const doc: RoutesDoc = {
      schemaVersion: "1.0",
      generatedAt: now,
      framework: "react",
      routes,
    };
    const out = path.join(engine.evidenceDir, "routes-react.json");
    await fs.writeJson(out, doc, { spaces: 2 });
    if (logEnabled) {
      console.log("[redox][debug] Routes artifact written (react)", {
        path: out,
        routes: routes.length,
      });
    }
  }

  const angular: any[] = frontend?.angular?.routes ?? [];
  if (angular.length) {
    const routes: FrontendRoute[] = angular.map((r: any, idx: number) => ({
      id: `angular:${r.path ?? idx}`,
      path: r.path ?? "/",
      parentId: undefined,
      children: [] as string[],
      component: r.component
        ? {
            name: r.component ?? undefined,
            file: r.file,
            startLine: 1,
            endLine: 1,
          }
        : undefined,
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
          startLine: 1,
          endLine: 1,
        },
      ],
    }));
    const doc = {
      schemaVersion: "1.0",
      generatedAt: now,
      framework: "angular",
      routes,
    };
    const out = path.join(engine.evidenceDir, "routes-angular.json");
    await fs.writeJson(out, doc, { spaces: 2 });
    if (logEnabled) {
      console.log("[redox][debug] Routes artifact written (angular)", {
        path: out,
        routes: routes.length,
      });
    }
  }
}

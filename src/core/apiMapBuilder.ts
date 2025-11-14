import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import type { LaravelRoute } from "../extractors/api-laravel.js";
import type { NestRoute } from "../extractors/api-nest.js";
import type { ApiEndpoint, ApiMap, HttpMethod } from "./types.js";

export function buildApiMapFromRoutes(
  routes: LaravelRoute[],
  nestRoutes: NestRoute[],
) {
  const endpoints: ApiEndpoint[] = [];
  const now = new Date().toISOString();

  const normalizePath = (uri: string) => `/${uri.replace(/^\/?/, "")}`;

  for (const r of routes) {
    const rawMethods = String(r.method ?? "GET").split("|");
    for (const raw of rawMethods) {
      const method = raw.trim().toUpperCase() as HttpMethod;
      if (!method) continue;

      const pathStr = normalizePath(r.uri ?? "/");

      let controllerFile = r.file ?? "";
      let controllerClass: string | undefined;
      let methodName: string | undefined;

      if (r.action && r.action.includes("@")) {
        const [classFqn, mName] = r.action.split("@");
        methodName = mName;
        const withoutRoot = classFqn.replace(/^\\?App\\/, "app\\");
        const segments = withoutRoot.split("\\");
        controllerClass = segments[segments.length - 1] ?? undefined;
        controllerFile = `${segments.join("/")}.php`;
      } else if (!controllerFile && r.uri) {
        controllerFile = "routes/web.php";
      }

      if (!controllerFile) continue;

      const id = `${method} ${pathStr}`;
      endpoints.push({
        id,
        method,
        path: pathStr,
        controller: {
          file: controllerFile,
          class: controllerClass,
          methodName,
        },
        source: "routes",
        evidence: [
          {
            path: controllerFile,
            startLine: 1,
            endLine: 1,
          },
        ],
      });
    }
  }

  for (const r of nestRoutes) {
    const base = r.basePath?.startsWith("/")
      ? r.basePath
      : `/${r.basePath ?? ""}`.replace(/\/+$/, "");
    const suffix = r.path ? `/${r.path.replace(/^\/+/, "")}` : "";
    const fullPath = `${base}${suffix || ""}` || "/";
    const id = `${r.httpMethod} ${fullPath}`;
    endpoints.push({
      id,
      method: r.httpMethod as HttpMethod,
      path: fullPath,
      controller: {
        file: r.file,
        class: r.controller,
        methodName: r.methodName,
      },
      source: "routes",
      evidence: [
        {
          path: r.file,
          startLine: 1,
          endLine: 1,
        },
      ],
    });
  }

  if (!endpoints.length) return null;

  const apiMap: ApiMap = {
    schemaVersion: "1.0",
    generatedAt: now,
    endpoints,
  };
  return apiMap;
}

export async function writeApiMapArtifact(
  engine: EngineContext,
  apiMap: any,
  logEnabled: boolean,
) {
  const outPath = path.join(engine.evidenceDir, "api-map.json");
  await fs.ensureDir(engine.evidenceDir);
  await fs.writeJson(outPath, apiMap, { spaces: 2 });
  if (logEnabled) {
    // eslint-disable-next-line no-console
    console.log("[redox][debug] ApiMap artifact written", {
      path: outPath,
      endpointCount: apiMap.endpoints.length,
    });
  }
}

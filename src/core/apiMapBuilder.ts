import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import type { LaravelRoute } from "../extractors/api-laravel.js";
import type { NestRoute } from "../extractors/api-nest.js";
import type { ApiEndpoint, ApiMap, HttpMethod } from "./types.js";
import { sha256 } from "./evidence.js";

type EvidenceRef = {
  path: string;
  startLine: number;
  endLine: number;
  sha256?: string;
};

function fileShaSafe(file: string) {
  try {
    const content = fs.readFileSync(file, "utf8");
    return sha256(content);
  } catch {
    return undefined;
  }
}

function evidenceFromFile(
  file: string,
  start: number,
  end?: number,
): EvidenceRef {
  const abs = path.resolve(file);
  const hash = fileShaSafe(abs);
  return {
    path: file,
    startLine: start,
    endLine: end ?? start,
    sha256: hash,
  };
}

function findPhpMethodLine(file: string, methodName?: string) {
  if (!methodName) return null;
  try {
    const abs = path.resolve(file);
    const content = fs.readFileSync(abs, "utf8");
    const lines = content.split(/\r?\n/);
    const target = new RegExp(`function\\s+${methodName}\\s*\\(`);
    const idx = lines.findIndex((ln: string) => target.test(ln));
    if (idx === -1) return null;
    return idx + 1;
  } catch {
    return null;
  }
}

export function buildApiMapFromRoutes(
  root: string,
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

      const methodLine =
        findPhpMethodLine(path.join(root, controllerFile), methodName) ?? 1;

      const id = `${method} ${pathStr}`;
      endpoints.push({
        id,
        method,
        path: pathStr,
        controller: {
          file: controllerFile,
          class: controllerClass,
          methodName,
          startLine: methodLine,
          endLine: methodLine,
        },
        source: "routes",
        evidence: [
          evidenceFromFile(path.join(root, controllerFile), methodLine),
        ],
        auth: r.middleware?.length
          ? { required: r.middleware.includes("auth"), guards: r.middleware }
          : undefined,
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
        startLine: r.startLine,
        endLine: r.endLine,
      },
      source: "routes",
      params: r.params?.map((p) => ({
        name: p.name,
        in: p.in,
        required: p.in === "path",
      })),
      auth:
        r.guards && r.guards.length
          ? { required: true, guards: r.guards }
          : undefined,
      responses: r.statusCode
        ? [
            {
              status: r.statusCode,
            },
          ]
        : undefined,
      evidence: [
        evidenceFromFile(
          r.file,
          r.startLine ?? 1,
          r.endLine ?? r.startLine ?? 1,
        ),
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
    console.log("[redox][debug] ApiMap artifact written", {
      path: outPath,
      endpointCount: apiMap.endpoints.length,
    });
  }
}

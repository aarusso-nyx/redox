import fs from "fs-extra";
import path from "node:path";
import { schemaGate } from "../gates/schema.js";
import { coverageGate } from "../gates/coverage.js";
import { evidenceFileGate } from "../gates/evidence.js";
import { buildGate } from "../gates/build.js";
import { traceabilityGate } from "../gates/traceability.js";
import { rbacGate } from "../gates/rbac.js";
import { lgpdGate } from "../gates/compliance.js";
import { ensurePlaceholderArtifacts } from "./artifacts.js";
import { buildRbacArtifact } from "./rbacBuilder.js";
import { buildLgpdMap } from "./lgpdBuilder.js";
import { buildStackProfile } from "./stackProfile.js";
import { buildDepGraph } from "./depGraphBuilder.js";
import { emitEngineEvent, type EngineEvent } from "./events.js";
import type { EngineContext } from "./context.js";
import {
  connectByEnv,
  introspect,
  buildDDLFromMigrations,
  type DbModel,
} from "../extractors/db.js";
import { laravelRoutes, type LaravelRoute } from "../extractors/api-laravel.js";
import { detectFrontend } from "../extractors/frontend-detect.js";
import { extractBlade } from "../extractors/blade.js";
import { extractReactRoutes } from "../extractors/react-routes.js";
import { angularRoutes } from "../extractors/fe-angular.js";
import { nestControllers, type NestRoute } from "../extractors/api-nest.js";
import { writeDbAndErdFromModel } from "../writers/dev-docs.js";
import {
  writeDevDocsLLM,
  writeUserDocsLLM,
  writeAuditDocsLLM,
} from "../writers/llm-writers.js";
import {
  architectReview,
  qaReview,
  opsReview,
  securityReview,
  docsReview,
} from "../reviewers/reviewers.js";

type Stage =
  | "dev"
  | "user"
  | "audit"
  | "all"
  | "extract"
  | "synthesize"
  | "render"
  | "check"
  | "review";

type OrchestratorOpts = {
  engine: EngineContext;
  adapterId?: string;
  seedsDir?: string | null;
  profile?: "dev" | "user" | "audit" | "all";
  gates?: string;
  factsOnly?: boolean;
  dryRun?: boolean;
  debug?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  onEvent?: (event: EngineEvent) => void;
};

let dbModelCache: DbModel | null = null;
let routesCache: any[] | null = null;
let frontendCache: any | null = null;
let apiMapCache: any | null = null;
let feRoutesCache: any | null = null;

function logDebug(enabled: boolean, message: string, detail?: unknown) {
  if (!enabled) return;
  console.log(`[redox][debug] ${message}`, detail ?? "");
}

function buildApiMap(routes: LaravelRoute[], nestRoutes: NestRoute[]) {
  const endpoints: any[] = [];
  const now = new Date().toISOString();

  const normalizePath = (uri: string) => `/${uri.replace(/^\/?/, "")}`;

  for (const r of routes) {
    const rawMethods = String(r.method ?? "GET").split("|");
    for (const raw of rawMethods) {
      const method = raw.trim().toUpperCase();
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
      method: r.httpMethod,
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

  return {
    schemaVersion: "1.0",
    generatedAt: now,
    endpoints,
  };
}

async function writeApiMapArtifact(
  engine: EngineContext,
  apiMap: any,
  logEnabled: boolean,
) {
  const outPath = path.join(engine.evidenceDir, "api-map.json");
  await fs.ensureDir(engine.evidenceDir);
  await fs.writeJson(outPath, apiMap, { spaces: 2 });
  logDebug(logEnabled, "ApiMap artifact written", {
    path: outPath,
    endpointCount: apiMap.endpoints.length,
  });
}

async function writeRoutesArtifacts(
  engine: EngineContext,
  frontend: any,
  logEnabled: boolean,
) {
  await fs.ensureDir(engine.evidenceDir);
  const now = new Date().toISOString();

  const reactRoutes = frontend?.react?.routes ?? [];
  if (reactRoutes.length) {
    const routes = reactRoutes.map((r: any, idx: number) => ({
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
    const doc = {
      schemaVersion: "1.0",
      generatedAt: now,
      framework: "react",
      routes,
    };
    const out = path.join(engine.evidenceDir, "routes-react.json");
    await fs.writeJson(out, doc, { spaces: 2 });
    logDebug(logEnabled, "Routes artifact written (react)", {
      path: out,
      routes: routes.length,
    });
  }

  const angular = frontend?.angular?.routes ?? [];
  if (angular.length) {
    const routes = angular.map((r: any, idx: number) => ({
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
    logDebug(logEnabled, "Routes artifact written (angular)", {
      path: out,
      routes: routes.length,
    });
  }
}

async function runExtract(
  engine: EngineContext,
  dryRun: boolean,
  logEnabled: boolean,
) {
  logDebug(logEnabled, "Stage=extract", { root: engine.root });
  // DB introspection via Postgres catalogs (env-based strategy)
  let model: any = { tables: [], fks: [], indexes: [] };
  if (dryRun) {
    logDebug(logEnabled, "DB introspection (dry-run)", {
      strategy: "env",
      note: "Would connect using DATABASE_URL and introspect catalogs",
    });
  } else {
    let client: any;
    try {
      logDebug(logEnabled, "DB introspection: connectByEnv()");
      client = await connectByEnv();
      model = await introspect(client);
      logDebug(logEnabled, "DB introspection: completed", {
        tableCount: model.tables.length,
        fkCount: model.fks.length,
      });
    } catch (err) {
      logDebug(
        logEnabled,
        "DB introspection failed; using empty model",
        String((err as Error)?.message ?? err),
      );
      // fall back to empty model if DATABASE_URL/pg are unavailable
    } finally {
      try {
        await client?.end?.();
      } catch {
        // ignore
      }
    }
  }
  dbModelCache = model;

  // Stack profile (LLM-based repo scanner)
  await buildStackProfile(engine, { dryRun, debug: logEnabled });
  // TS/JS dependency graph + summary doc
  await buildDepGraph(engine, { dryRun, debug: logEnabled });

  // Laravel routes (if applicable)
  let routes: LaravelRoute[] = [];
  let nestRoutes: NestRoute[] = [];
  if (dryRun) {
    logDebug(logEnabled, "Laravel routes (dry-run)", {
      cwd: engine.root,
      note: "Would run php artisan route:list --json with fallback to parsing routes/*.php",
    });
    logDebug(logEnabled, "NestJS routes (dry-run)", {
      cwd: engine.root,
      note: "Would scan NestJS controllers via ts-morph using tsconfig.json",
    });
  } else {
    routes = await laravelRoutes(engine.root).catch(() => []);
    logDebug(logEnabled, "Laravel routes: extracted", { count: routes.length });
    try {
      nestRoutes = nestControllers(engine.root);
      logDebug(logEnabled, "NestJS routes: extracted", {
        count: nestRoutes.length,
      });
    } catch (err) {
      logDebug(
        logEnabled,
        "NestJS routes extraction failed or not applicable",
        String((err as Error)?.message ?? err),
      );
      nestRoutes = [];
    }
  }
  routesCache = routes;

  // Frontend detection + mappings
  let frontendMode = "unknown";
  if (dryRun) {
    logDebug(logEnabled, "Frontend detection (dry-run)", {
      patterns: [
        "resources/views/**/*.blade.php",
        "resources/js/**/*.{tsx,jsx,ts,js}",
        "src/**/*.routing.*",
      ],
    });
  } else {
    frontendMode = await detectFrontend(engine.root);
  }
  frontendCache = {
    mode: frontendMode,
    blade: null as any,
    react: null as any,
    angular: null as any,
  };
  if (!dryRun) {
    if (frontendMode === "blade" || frontendMode === "mixed") {
      logDebug(logEnabled, "Blade extraction", { root: engine.root });
      frontendCache.blade = await extractBlade(engine.root).catch(() => null);
    }
    if (frontendMode === "react" || frontendMode === "mixed") {
      logDebug(logEnabled, "React routes extraction", { root: engine.root });
      frontendCache.react = await extractReactRoutes(engine.root).catch(
        () => null,
      );
    }
    if (frontendMode === "angular" || frontendMode === "mixed") {
      logDebug(logEnabled, "Angular routes extraction", { root: engine.root });
      frontendCache.angular = { routes: angularRoutes(engine.root) };
    }
  }

  // API Map + frontend routes artifacts
  if (dryRun) {
    logDebug(logEnabled, "ApiMap/Routes artifacts (dry-run)", {
      apiRoutes: routes.length,
      nestRoutes: nestRoutes.length,
      frontendMode,
    });
  } else {
    const apiMap = buildApiMap(routes, nestRoutes);
    apiMapCache = apiMap;
    feRoutesCache = {
      react: frontendCache.react,
      angular: frontendCache.angular,
    };
    if (apiMap) {
      await writeApiMapArtifact(engine, apiMap, logEnabled);
    }
    await writeRoutesArtifacts(engine, frontendCache, logEnabled);
  }

  return {
    dbModel: model,
    routes,
    frontend: frontendCache,
  };
}

async function runRender(
  engine: EngineContext,
  dryRun: boolean,
  logEnabled: boolean,
) {
  logDebug(logEnabled, "Stage=render", { hasDbModel: !!dbModelCache });
  if (!dbModelCache) return;

  if (dryRun) {
    logDebug(logEnabled, "Render (dry-run): planned actions", {
      db: "Run migrations if Laravel and pg_dump schema-only to database.sql",
      docs: "Write ERD artifacts under docs/",
      scripts: "Ensure docs/scripts/render-mermaid.sh exists",
      artifacts:
        "Ensure evidence directory exists under docsDir/.redox and write RBAC/LGPD machine artifacts if DB model is available",
    });
    return;
  }

  await buildDDLFromMigrations(engine.root, engine.docsDir);
  await writeDbAndErdFromModel(engine.root, engine.docsDir, dbModelCache);
  await ensurePlaceholderArtifacts(engine);
  await buildRbacArtifact(engine, dbModelCache);
  await buildLgpdMap(engine, dbModelCache);
}

export async function orchestrate(stage: Stage, opts: OrchestratorOpts) {
  const gates = opts.gates ?? "schema,coverage,evidence,build,traceability";
  const dryRun = opts.dryRun ?? opts.engine.flags.dryRun;
  const debug = opts.debug ?? opts.engine.flags.debug;
  const verbose = opts.verbose ?? opts.engine.flags.verbose;
  const logEnabled = debug || verbose;

  const emit = (event: Omit<EngineEvent, "timestamp">) =>
    emitEngineEvent({ stage, profile: opts.profile, ...event }, opts.onEvent);

  emit({ type: "stage-start", data: { gates, dryRun } });

  if (stage === "check") {
    const root = opts.engine.root;
    const docsDir = opts.engine.docsDir;
    const evidenceDir = opts.engine.evidenceDir;

    if (!dryRun) {
      try {
        const { buildCoverageMatrix } = await import("./coverageBuilder.js");
        await buildCoverageMatrix(opts.engine);
      } catch {
        // Coverage matrix build is best-effort; schema/coverage gates will surface issues if critical
      }
    }

    const coveragePath = path.join(evidenceDir, "coverage-matrix.json");
    const apiMapPath = path.join(evidenceDir, "api-map.json");
    const rbacPath = path.join(evidenceDir, "rbac.json");
    const lgpdPath = path.join(evidenceDir, "lgpd-map.json");
    const fpPath = path.join(evidenceDir, "fp-appendix.json");
    const stackProfilePath = path.join(evidenceDir, "stack-profile.json");
    const depGraphPath = path.join(evidenceDir, "dep-graph.json");

    let coverageData: any | null = null;
    if (fs.existsSync(coveragePath)) {
      coverageData = await fs.readJson(coveragePath);
    }

    logDebug(logEnabled, "Stage=check", {
      gates,
      coveragePath: fs.existsSync(coveragePath) ? coveragePath : null,
      apiMapPath: fs.existsSync(apiMapPath) ? apiMapPath : null,
      rbacPath: fs.existsSync(rbacPath) ? rbacPath : null,
      lgpdPath: fs.existsSync(lgpdPath) ? lgpdPath : null,
      fpPath: fs.existsSync(fpPath) ? fpPath : null,
      stackProfilePath: fs.existsSync(stackProfilePath)
        ? stackProfilePath
        : null,
      depGraphPath: fs.existsSync(depGraphPath) ? depGraphPath : null,
    });

    if (gates.includes("schema")) {
      emit({ type: "gate-start", gate: "schema" });
      if (fs.existsSync(apiMapPath)) {
        logDebug(logEnabled, "Gate=schema (api-map.json)");
        if (!dryRun) {
          const { loadSchemaFile } = await import("./schemaLoader.js");
          const apiSchema = await loadSchemaFile("ApiMap.schema.json");
          const apiData = await fs.readJson(apiMapPath);
          schemaGate(apiSchema, apiData);
        }
      }
      // Validate any routes-* JSON artifacts against Routes.schema.json
      try {
        const entries = await fs.readdir(evidenceDir);
        for (const name of entries) {
          if (!name.startsWith("routes-") || !name.endsWith(".json")) continue;
          const routesPath = path.join(evidenceDir, name);
          logDebug(logEnabled, "Gate=schema (routes JSON)", { routesPath });
          if (!dryRun) {
            const { loadSchemaFile } = await import("./schemaLoader.js");
            const routesSchema = await loadSchemaFile("Routes.schema.json");
            const routesData = await fs.readJson(routesPath);
            schemaGate(routesSchema, routesData);
          }
        }
      } catch {
        // ignore directory read errors; other gates will surface issues if needed
      }
      if (coverageData) {
        logDebug(logEnabled, "Gate=schema (coverage-matrix.json)");
        if (!dryRun) {
          const { loadSchemaFile } = await import("./schemaLoader.js");
          const coverageSchema = await loadSchemaFile(
            "CoverageMatrix.schema.json",
          );
          schemaGate(coverageSchema, coverageData);
        }
      }
      if (fs.existsSync(rbacPath)) {
        logDebug(logEnabled, "Gate=schema (rbac.json)");
        if (!dryRun) {
          const { loadSchemaFile } = await import("./schemaLoader.js");
          const rbacSchema = await loadSchemaFile("Rbac.schema.json");
          const rbacData = await fs.readJson(rbacPath);
          schemaGate(rbacSchema, rbacData);
        }
      }
      if (fs.existsSync(fpPath)) {
        logDebug(logEnabled, "Gate=schema (fp-appendix.json)");
        if (!dryRun) {
          const { loadSchemaFile } = await import("./schemaLoader.js");
          const fpSchema = await loadSchemaFile("Fp.schema.json");
          const fpData = await fs.readJson(fpPath);
          schemaGate(fpSchema, fpData);
        }
      }
      if (fs.existsSync(stackProfilePath)) {
        logDebug(logEnabled, "Gate=schema (stack-profile.json)");
        if (!dryRun) {
          const { loadSchemaFile } = await import("./schemaLoader.js");
          const spSchema = await loadSchemaFile("StackProfile.schema.json");
          const spData = await fs.readJson(stackProfilePath);
          schemaGate(spSchema, spData);
        }
      }
      if (fs.existsSync(depGraphPath)) {
        logDebug(logEnabled, "Gate=schema (dep-graph.json)");
        if (!dryRun) {
          const { loadSchemaFile } = await import("./schemaLoader.js");
          const dgSchema = await loadSchemaFile("DepGraph.schema.json");
          const dgData = await fs.readJson(depGraphPath);
          schemaGate(dgSchema, dgData);
        }
      }
      emit({ type: "gate-end", gate: "schema", success: true });
    }

    if (gates.includes("coverage") && coverageData) {
      emit({ type: "gate-start", gate: "coverage" });
      const allRoutes = (coverageData.routes ?? []).map((id: string) => ({
        id,
      }));
      const allEndpoints = (coverageData.endpoints ?? []).map((id: string) => ({
        id,
      }));
      const links = (coverageData.links ?? []).map((l: any) => ({
        routeId: l.routeId,
        endpointId: l.endpointId,
        useCaseId: l.useCaseId,
      }));
      logDebug(logEnabled, "Gate=coverage", {
        routeCount: allRoutes.length,
        endpointCount: allEndpoints.length,
        linkCount: links.length,
      });
      if (!dryRun) {
        coverageGate(allRoutes, allEndpoints, links);
      }
      emit({ type: "gate-end", gate: "coverage", success: true });
    }

    if (gates.includes("traceability") && coverageData) {
      emit({ type: "gate-start", gate: "traceability" });
      logDebug(logEnabled, "Gate=traceability");
      if (!dryRun) {
        traceabilityGate(coverageData);
      }
      emit({ type: "gate-end", gate: "traceability", success: true });
    }

    if (gates.includes("evidence")) {
      emit({ type: "gate-start", gate: "evidence" });
      const evidenceFile = path.join(evidenceDir, "evidence.jsonl");
      logDebug(logEnabled, "Gate=evidence", { evidenceFile });
      if (!dryRun) {
        await evidenceFileGate(root, evidenceFile);
      }
      emit({ type: "gate-end", gate: "evidence", success: true });
    }

    if (gates.includes("build")) {
      emit({ type: "gate-start", gate: "build" });
      logDebug(logEnabled, "Gate=build", { root, docsDir });
      if (!dryRun) {
        await buildGate(root, docsDir);
      }
      emit({ type: "gate-end", gate: "build", success: true });
    }

    if (fs.existsSync(rbacPath)) {
      emit({ type: "gate-start", gate: "rbac" });
      const rbacData = await fs.readJson(rbacPath);
      const matrixRows =
        rbacData.roleBindings?.map((b: any) => ({
          role: b.roleId,
          permission: b.permissionId,
          evidence: (b.evidence ?? []).map(
            (e: any) => `${e.path}:${e.startLine}-${e.endLine}`,
          ),
        })) ?? [];
      logDebug(logEnabled, "Gate=rbac", { rows: matrixRows.length });
      if (!dryRun && matrixRows.length) {
        rbacGate(matrixRows);
      }
      emit({ type: "gate-end", gate: "rbac", success: true });
    }

    if (fs.existsSync(lgpdPath)) {
      emit({ type: "gate-start", gate: "lgpd" });
      const lgpdData = await fs.readJson(lgpdPath);
      if (Array.isArray(lgpdData)) {
        logDebug(logEnabled, "Gate=lgpd", { entries: lgpdData.length });
        const nonEmpty = lgpdData.filter(
          (m: any) =>
            typeof m.legalBasis === "string" &&
            m.legalBasis &&
            typeof m.retention === "string" &&
            m.retention,
        );
        if (!dryRun && nonEmpty.length) {
          lgpdGate(lgpdData);
        }
      }
      emit({ type: "gate-end", gate: "lgpd", success: true });
    }

    emit({ type: "stage-end", success: true });
    return;
  }

  if (stage === "extract") {
    await runExtract(opts.engine, dryRun, logEnabled);
    emit({ type: "stage-end", success: true });
    return;
  }

  if (stage === "render") {
    await runRender(opts.engine, dryRun, logEnabled);
    emit({ type: "stage-end", success: true });
    return;
  }

  if (stage === "synthesize") {
    const evidenceDir = opts.engine.evidenceDir;
    let stackProfile: any = null;
    let depGraph: any = null;
    try {
      const spPath = path.join(evidenceDir, "stack-profile.json");
      if (fs.existsSync(spPath)) {
        stackProfile = await fs.readJson(spPath);
      }
    } catch {
      stackProfile = null;
    }
    try {
      const dgPath = path.join(evidenceDir, "dep-graph.json");
      if (fs.existsSync(dgPath)) {
        depGraph = await fs.readJson(dgPath);
      }
    } catch {
      depGraph = null;
    }

    const facts = {
      dbModel: dbModelCache ?? { tables: [], fks: [], indexes: [] },
      routes: routesCache ?? [],
      frontend: frontendCache ?? {},
      apiMap: apiMapCache ?? null,
      feRoutes: feRoutesCache ?? null,
      stackProfile,
      depGraph,
    };
    const profile = opts.profile ?? "dev";
    if (profile === "dev" || profile === "all") {
      logDebug(logEnabled, "Stage=synthesize profile=dev", { dryRun });
      await writeDevDocsLLM(opts.engine, facts, { dryRun, debug });
    }
    if (profile === "user" || profile === "all") {
      logDebug(logEnabled, "Stage=synthesize profile=user", { dryRun });
      await writeUserDocsLLM(opts.engine, facts, { dryRun, debug });
    }
    if (profile === "audit" || profile === "all") {
      logDebug(logEnabled, "Stage=synthesize profile=audit", { dryRun });
      await writeAuditDocsLLM(opts.engine, facts, { dryRun, debug });
    }
    emit({ type: "stage-end", success: true });
    return;
  }

  if (stage === "review") {
    logDebug(logEnabled, "Stage=review (architect, qa, ops, security, docs)");
    if (!dryRun) {
      const results = {
        architect: await architectReview(opts.engine, { dryRun, debug }),
        qa: await qaReview(opts.engine, { dryRun, debug }),
        ops: await opsReview(opts.engine, { dryRun, debug }),
        security: await securityReview(opts.engine, { dryRun, debug }),
        docs: await docsReview(opts.engine, { dryRun, debug }),
      };

      const docsDir = opts.engine.docsDir;
      const outFiles: { key: keyof typeof results; file: string }[] = [
        { key: "architect", file: "Architecture Review.md" },
        { key: "qa", file: "QA Review.md" },
        { key: "ops", file: "Ops Review.md" },
        { key: "security", file: "Security Review.md" },
        { key: "docs", file: "Docs Review.md" },
      ];

      for (const { key, file } of outFiles) {
        const rr = results[key];
        if (!rr.rawMarkdown) continue;
        const outPath = path.join(docsDir, file);
        await fs.ensureDir(path.dirname(outPath));
        await fs.writeFile(outPath, rr.rawMarkdown, "utf8");
        logDebug(logEnabled, "Review written", {
          reviewer: key,
          path: outPath,
        });
      }
    }
    emit({ type: "stage-end", success: true });
    return;
  }

  if (
    stage === "dev" ||
    stage === "user" ||
    stage === "audit" ||
    stage === "all"
  ) {
    await orchestrate("extract", opts);
    await orchestrate("synthesize", {
      ...opts,
      profile: stage === "all" ? "dev" : stage,
    });
    await orchestrate("render", opts);
    await orchestrate("check", opts);
    emit({ type: "stage-end", success: true });
  }
}

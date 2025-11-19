import fs from "fs-extra";
import path from "node:path";
import { schemaGate } from "../gates/schema.js";
import { coverageGate } from "../gates/coverage.js";
import { evidenceFileGate } from "../gates/evidence.js";
import { buildGate } from "../gates/build.js";
import { traceabilityGate } from "../gates/traceability.js";
import { rbacGate } from "../gates/rbac.js";
import { lgpdGate } from "../gates/compliance.js";
import { runArtifactBuilders } from "./artifactBuilders.js";
import type { ApiMap, RoutesDoc } from "./types.js";
import { emitEngineEvent, type EngineEvent } from "./events.js";
import type { EngineContext } from "./context.js";
import {
  connectByEnv,
  introspect,
  buildDDLFromMigrations,
  buildDbModelFallback,
  type DbModel,
} from "../extractors/db.js";
import { laravelRoutes, type LaravelRoute } from "../extractors/api-laravel.js";
import { detectFrontend } from "../extractors/frontend-detect.js";
import { extractBlade } from "../extractors/blade.js";
import { extractReactRoutes } from "../extractors/react-routes.js";
import { angularRoutes } from "../extractors/fe-angular.js";
import { nestControllers, type NestRoute } from "../extractors/api-nest.js";
import { extractExistingDocs } from "../extractors/docs.js";
import { buildApiMapFromRoutes, writeApiMapArtifact } from "./apiMapBuilder.js";
import { writeRoutesArtifacts } from "./routesArtifacts.js";
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
import { summarizeUsage } from "./usage.js";

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
  resume?: boolean;
  onEvent?: (event: EngineEvent) => void;
};

let dbModelCache: DbModel | null = null;
let routesCache: any[] | null = null;
let frontendCache: any | null = null;
let apiMapCache: ApiMap | null = null;
let feRoutesCache: { react?: RoutesDoc; angular?: RoutesDoc } | null = null;

function logDebug(enabled: boolean, message: string, detail?: unknown) {
  if (!enabled) return;
  console.log(`[redox][debug] ${message}`, detail ?? "");
}

function usageTotals(summary: Awaited<ReturnType<typeof summarizeUsage>>) {
  return {
    input: summary?.totalInput ?? 0,
    output: summary?.totalOutput ?? 0,
    total: summary?.totalTokens ?? 0,
  };
}

async function logUsageDelta(
  stage: string,
  before: Awaited<ReturnType<typeof summarizeUsage>>,
) {
  const usageAfter = await summarizeUsage();
  const beforeTotals = usageTotals(before);
  const afterTotals = usageTotals(usageAfter);
  const delta = {
    input: afterTotals.input - beforeTotals.input,
    output: afterTotals.output - beforeTotals.output,
    total: afterTotals.total - beforeTotals.total,
  };
  console.log(
    `[redox][usage] stage=${stage} input=${delta.input} output=${delta.output} total=${delta.total} (cum: ${afterTotals.total})`,
  );
}

async function runExtract(
  engine: EngineContext,
  dryRun: boolean,
  logEnabled: boolean,
) {
  logDebug(logEnabled, "Stage=extract", { root: engine.root });

  const steps: { name: string; status: "ok" | "fail"; error?: string }[] = [];
  const summary: {
    hydratedEnv: string[];
    dbTables: number;
    dbSchemas: number;
    backendRoutes: number;
    frontendRoutes: number;
    frontendMode: string;
    stackHint: string;
  } = {
    hydratedEnv: [],
    dbTables: 0,
    dbSchemas: 0,
    backendRoutes: 0,
    frontendRoutes: 0,
    frontendMode: "unknown",
    stackHint: "",
  };

  const recordStep = (name: string, status: "ok" | "fail", error?: string) => {
    steps.push({ name, status, error });
    const prefix = status === "ok" ? "[success]" : "[fail]";
    if (status === "ok") {
      console.log(`[redox][extract] ${prefix} ${name}`);
    } else {
      console.error(`[redox][extract] ${prefix} ${name}: ${error ?? "error"}`);
    }
  };

  // DB introspection via Postgres catalogs (env-based strategy)
  let model: any = { tables: [], fks: [], indexes: [] };
  if (dryRun) {
    logDebug(logEnabled, "DB introspection (dry-run)", {
      strategy: "env",
      note: "Would connect using DATABASE_URL and introspect catalogs",
    });
    recordStep("DB:catalog", "ok");
  } else {
    let client: any;
    let hydratedEnv: string[] = [];
    try {
      logDebug(logEnabled, "DB introspection: connectByEnv()");
      const res = await connectByEnv(engine.root);
      client = res.client;
      hydratedEnv = res.hydrated;
      model = await introspect(client);
      summary.hydratedEnv = hydratedEnv;
      recordStep("DB:catalog", "ok");
    } catch (err) {
      recordStep("DB:catalog", "fail", (err as Error)?.message ?? String(err));
    } finally {
      try {
        await client?.end?.();
      } catch {
        // ignore
      }
    }
  }
  if (!model.tables.length) {
    logDebug(logEnabled, "DB model empty; attempting migration fallback");
    try {
      const fallback = await buildDbModelFallback(engine.root);
      model = fallback;
      recordStep("DB:migrations", "ok");
    } catch (err) {
      recordStep(
        "DB:migrations",
        "fail",
        (err as Error)?.message ?? String(err),
      );
    }
  }

  dbModelCache = model;
  summary.dbTables = model.tables.length;
  summary.dbSchemas = new Set(model.tables.map((t: any) => t.schema)).size;

  // Laravel routes (if applicable)
  let routes: LaravelRoute[] = [];
  let nestRoutes: NestRoute[] = [];
  if (dryRun) {
    recordStep("Routes:laravel", "ok");
    recordStep("Routes:nest", "ok");
  } else {
    try {
      routes = await laravelRoutes(engine.root);
      recordStep("Routes:laravel", "ok");
    } catch (err) {
      recordStep(
        "Routes:laravel",
        "fail",
        (err as Error)?.message ?? String(err),
      );
    }
    try {
      nestRoutes = nestControllers(engine.root);
      recordStep("Routes:nest", "ok");
    } catch (err) {
      recordStep("Routes:nest", "fail", (err as Error)?.message ?? String(err));
      nestRoutes = [];
    }
  }
  routesCache = routes;
  summary.backendRoutes = routes.length + nestRoutes.length;

  // Frontend detection + mappings
  let frontendMode = "unknown";
  if (dryRun) {
    recordStep("Frontend:detect", "ok");
  } else {
    try {
      frontendMode = await detectFrontend(engine.root);
      recordStep("Frontend:detect", "ok");
    } catch (err) {
      recordStep(
        "Frontend:detect",
        "fail",
        (err as Error)?.message ?? String(err),
      );
    }
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
      recordStep("Frontend:blade", frontendCache.blade ? "ok" : "fail");
    }
    if (frontendMode === "react" || frontendMode === "mixed") {
      logDebug(logEnabled, "React routes extraction", { root: engine.root });
      frontendCache.react = await extractReactRoutes(engine.root).catch(
        (err) => {
          recordStep(
            "Frontend:react",
            "fail",
            (err as Error)?.message ?? String(err),
          );
          return null;
        },
      );
      if (frontendCache.react) recordStep("Frontend:react", "ok");
    }
    if (frontendMode === "angular" || frontendMode === "mixed") {
      logDebug(logEnabled, "Angular routes extraction", { root: engine.root });
      frontendCache.angular = { routes: angularRoutes(engine.root) };
      recordStep("Frontend:angular", "ok");
    }
  }

  summary.frontendMode = frontendMode;
  summary.frontendRoutes =
    (frontendCache.react?.routes?.length ?? 0) +
    (frontendCache.angular?.routes?.length ?? 0);

  // Existing textual docs
  let existingDocs: any = null;
  if (dryRun) {
    recordStep("Docs:existing", "ok");
  } else {
    try {
      existingDocs = await extractExistingDocs(engine.root);
      recordStep("Docs:existing", "ok");
    } catch (err) {
      recordStep(
        "Docs:existing",
        "fail",
        (err as Error)?.message ?? String(err),
      );
    }
  }

  // API Map + frontend routes artifacts + existing docs artifact
  if (dryRun) {
    logDebug(logEnabled, "ApiMap/Routes artifacts (dry-run)", {
      apiRoutes: routes.length,
      nestRoutes: nestRoutes.length,
      frontendMode,
    });
  } else {
    const apiMap = buildApiMapFromRoutes(engine.root, routes, nestRoutes);
    apiMapCache = apiMap;
    feRoutesCache = {
      react: frontendCache.react,
      angular: frontendCache.angular,
    };
    if (apiMap) {
      await writeApiMapArtifact(engine, apiMap, logEnabled);
    }
    await writeRoutesArtifacts(engine, frontendCache, logEnabled);
    if (existingDocs?.docs) {
      const outPath = path.join(engine.evidenceDir, "existing-docs.json");
      await fs.ensureDir(engine.evidenceDir);
      await fs.writeJson(
        outPath,
        {
          generatedAt: new Date().toISOString(),
          docs: existingDocs.docs,
        },
        { spaces: 2 },
      );
      logDebug(logEnabled, "Existing docs artifact written", {
        path: outPath,
        count: existingDocs.docs.length,
      });
    }
  }

  // Stack hint based on routes/frontend/db
  const backendHint =
    nestRoutes.length > 0
      ? "nestjs"
      : routes.length > 0
        ? "laravel"
        : engine.profile.hasPHP
          ? "php"
          : engine.profile.hasNode
            ? "node"
            : "unknown";
  summary.stackHint = `${backendHint}/${frontendMode}/${model.dialect ?? "db"}`;

  console.log("[redox][extract][summary] Stack:", summary.stackHint);
  console.log(
    "[redox][extract][summary] Hydrated env keys:",
    summary.hydratedEnv.length ? summary.hydratedEnv.join(", ") : "none",
  );
  console.log(
    "[redox][extract][summary] DB tables:",
    summary.dbTables,
    "schemas:",
    summary.dbSchemas,
  );
  console.log(
    "[redox][extract][summary] Backend routes:",
    summary.backendRoutes,
  );
  console.log(
    "[redox][extract][summary] Frontend routes:",
    summary.frontendRoutes,
    "(mode:",
    summary.frontendMode,
    ")",
  );

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
        "Ensure evidence directory exists under docsDir/facts and write RBAC/LGPD machine artifacts if DB model is available",
    });
    return;
  }

  await buildDDLFromMigrations(engine.root, engine.docsDir);
  await writeDbAndErdFromModel(engine.root, engine.docsDir, dbModelCache);
  await runArtifactBuilders("render", engine, {
    dbModel: dbModelCache,
    dryRun,
    debug: logEnabled,
  });
}

export async function orchestrate(stage: Stage, opts: OrchestratorOpts) {
  const usageBefore = await summarizeUsage();
  const gates = opts.gates ?? "schema,coverage,evidence,build,traceability";
  const dryRun = opts.dryRun ?? opts.engine.flags.dryRun;
  const debug = opts.debug ?? opts.engine.flags.debug;
  const verbose = opts.verbose ?? opts.engine.flags.verbose;
  const logEnabled = debug || verbose;

  const emit = (event: Omit<EngineEvent, "timestamp">) =>
    emitEngineEvent({ stage, profile: opts.profile, ...event }, opts.onEvent);

  emit({ type: "stage-start", data: { gates, dryRun } });
  console.log(`[redox][stage] ${stage}`);

  if (stage === "check") {
    const root = opts.engine.root;
    const docsDir = opts.engine.docsDir;
    const evidenceDir = opts.engine.evidenceDir;

    await runArtifactBuilders("check", opts.engine, {
      dbModel: dbModelCache,
      dryRun,
      debug: logEnabled,
    });

    const coveragePath = path.join(evidenceDir, "coverage-matrix.json");
    const apiMapPath = path.join(evidenceDir, "api-map.json");
    const rbacPath = path.join(evidenceDir, "rbac.json");
    const lgpdPath = path.join(evidenceDir, "lgpd-map.json");
    const fpPath = path.join(evidenceDir, "fp-appendix.json");
    const stackProfilePath = path.join(evidenceDir, "stack-profile.json");
    const depGraphPath = path.join(evidenceDir, "dep-graph.json");

    const [
      coverageExists,
      apiMapExists,
      rbacExists,
      lgpdExists,
      fpExists,
      stackProfileExists,
      depGraphExists,
    ] = await Promise.all([
      fs.pathExists(coveragePath),
      fs.pathExists(apiMapPath),
      fs.pathExists(rbacPath),
      fs.pathExists(lgpdPath),
      fs.pathExists(fpPath),
      fs.pathExists(stackProfilePath),
      fs.pathExists(depGraphPath),
    ]);

    let coverageData: any | null = null;
    if (coverageExists) {
      coverageData = await fs.readJson(coveragePath);
    }

    logDebug(logEnabled, "Stage=check", {
      gates,
      coveragePath: coverageExists ? coveragePath : null,
      apiMapPath: apiMapExists ? apiMapPath : null,
      rbacPath: rbacExists ? rbacPath : null,
      lgpdPath: lgpdExists ? lgpdPath : null,
      fpPath: fpExists ? fpPath : null,
      stackProfilePath: stackProfileExists ? stackProfilePath : null,
      depGraphPath: depGraphExists ? depGraphPath : null,
    });

    const failedGates: { gate: string; error: Error }[] = [];

    if (gates.includes("schema")) {
      emit({ type: "gate-start", gate: "schema" });
      try {
        if (apiMapExists) {
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
            if (!name.startsWith("routes-") || !name.endsWith(".json"))
              continue;
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
        if (rbacExists) {
          logDebug(logEnabled, "Gate=schema (rbac.json)");
          if (!dryRun) {
            const { loadSchemaFile } = await import("./schemaLoader.js");
            const rbacSchema = await loadSchemaFile("Rbac.schema.json");
            const rbacData = await fs.readJson(rbacPath);
            schemaGate(rbacSchema, rbacData);
          }
        }
        if (fpExists) {
          logDebug(logEnabled, "Gate=schema (fp-appendix.json)");
          if (!dryRun) {
            const { loadSchemaFile } = await import("./schemaLoader.js");
            const fpSchema = await loadSchemaFile("Fp.schema.json");
            const fpData = await fs.readJson(fpPath);
            schemaGate(fpSchema, fpData);
          }
        }
        if (stackProfileExists) {
          logDebug(logEnabled, "Gate=schema (stack-profile.json)");
          if (!dryRun) {
            const { loadSchemaFile } = await import("./schemaLoader.js");
            const spSchema = await loadSchemaFile("StackProfile.schema.json");
            const spData = await fs.readJson(stackProfilePath);
            schemaGate(spSchema, spData);
          }
        }
        if (depGraphExists) {
          logDebug(logEnabled, "Gate=schema (dep-graph.json)");
          if (!dryRun) {
            const { loadSchemaFile } = await import("./schemaLoader.js");
            const dgSchema = await loadSchemaFile("DepGraph.schema.json");
            const dgData = await fs.readJson(depGraphPath);
            schemaGate(dgSchema, dgData);
          }
        }
        emit({ type: "gate-end", gate: "schema", success: true });
      } catch (err) {
        const message =
          (err as Error).message ?? `Schema gate failed: ${String(err)}`;
        console.error("[redox][gate] schema failed:", message);
        console.error(
          "[redox][hint] Check JSON artifacts in facts/ against the schemas in src/schemas/ (ApiMap, Routes, CoverageMatrix, etc.).",
        );
        failedGates.push({ gate: "schema", error: err as Error });
        emit({ type: "gate-end", gate: "schema", success: false });
      }
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
      try {
        if (!dryRun) {
          coverageGate(allRoutes, allEndpoints, links);
        }
        emit({ type: "gate-end", gate: "coverage", success: true });
      } catch (err) {
        const message =
          (err as Error).message ?? `Coverage gate failed: ${String(err)}`;
        console.error("[redox][gate] coverage failed:", message);
        console.error(
          "[redox][hint] Ensure coverage-matrix.json has non-empty routes/endpoints and links, and that use-cases.json and routes-*.json are wired correctly.",
        );
        failedGates.push({ gate: "coverage", error: err as Error });
        emit({ type: "gate-end", gate: "coverage", success: false });
      }
    }

    if (gates.includes("traceability") && coverageData) {
      emit({ type: "gate-start", gate: "traceability" });
      logDebug(logEnabled, "Gate=traceability");
      try {
        if (!dryRun) {
          traceabilityGate(coverageData);
        }
        emit({ type: "gate-end", gate: "traceability", success: true });
      } catch (err) {
        const message =
          (err as Error).message ?? `Traceability gate failed: ${String(err)}`;
        console.error("[redox][gate] traceability failed:", message);
        console.error(
          "[redox][hint] Check that every route/endpoint in coverage-matrix.json participates in a Route↔Endpoint↔UseCase triad.",
        );
        failedGates.push({ gate: "traceability", error: err as Error });
        emit({ type: "gate-end", gate: "traceability", success: false });
      }
    }

    if (gates.includes("evidence")) {
      emit({ type: "gate-start", gate: "evidence" });
      const evidenceFile = path.join(evidenceDir, "evidence.jsonl");
      logDebug(logEnabled, "Gate=evidence", { evidenceFile });
      try {
        if (!dryRun) {
          await evidenceFileGate(root, evidenceFile);
        }
        emit({ type: "gate-end", gate: "evidence", success: true });
      } catch (err) {
        const message =
          (err as Error).message ?? `Evidence gate failed: ${String(err)}`;
        console.error("[redox][gate] evidence failed:", message);
        console.error(
          "[redox][hint] Verify that evidence.jsonl exists and that tool calls are writing valid JSONL lines.",
        );
        failedGates.push({ gate: "evidence", error: err as Error });
        emit({ type: "gate-end", gate: "evidence", success: false });
      }
    }

    if (gates.includes("build")) {
      emit({ type: "gate-start", gate: "build" });
      logDebug(logEnabled, "Gate=build", { root, docsDir });
      try {
        if (!dryRun) {
          await buildGate(root, docsDir);
        }
        emit({ type: "gate-end", gate: "build", success: true });
      } catch (err) {
        const message =
          (err as Error).message ?? `Build gate failed: ${String(err)}`;
        console.error("[redox][gate] build failed:", message);
        console.error(
          "[redox][hint] Check database.sql and ERD.mmd; ensure psql, mmdc/mermaid CLI, and any other build tools are installed.",
        );
        failedGates.push({ gate: "build", error: err as Error });
        emit({ type: "gate-end", gate: "build", success: false });
      }
    }

    if (rbacExists) {
      emit({ type: "gate-start", gate: "rbac" });
      try {
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
      } catch (err) {
        const message =
          (err as Error).message ?? `RBAC gate failed: ${String(err)}`;
        console.error("[redox][gate] rbac failed:", message);
        console.error(
          "[redox][hint] Inspect rbac.json and ensure roleBindings and permissions match your policy.",
        );
        failedGates.push({ gate: "rbac", error: err as Error });
        emit({ type: "gate-end", gate: "rbac", success: false });
      }
    }

    if (lgpdExists) {
      emit({ type: "gate-start", gate: "lgpd" });
      try {
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
      } catch (err) {
        const message =
          (err as Error).message ?? `LGPD gate failed: ${String(err)}`;
        console.error("[redox][gate] lgpd failed:", message);
        console.error(
          "[redox][hint] Review lgpd-map.json for missing or inconsistent legalBasis/retention entries.",
        );
        failedGates.push({ gate: "lgpd", error: err as Error });
        emit({ type: "gate-end", gate: "lgpd", success: false });
      }
    }

    if (failedGates.length) {
      console.error(
        "[redox][check] One or more gates failed; see messages above for details and hints.",
      );
    }

    emit({
      type: "stage-end",
      success: failedGates.length === 0,
    });
    await logUsageDelta(stage, usageBefore);
    return;
  }

  if (stage === "extract") {
    await runExtract(opts.engine, dryRun, logEnabled);
    emit({ type: "stage-end", success: true });
    await logUsageDelta(stage, usageBefore);
    return;
  }

  if (stage === "render") {
    await runRender(opts.engine, dryRun, logEnabled);
    emit({ type: "stage-end", success: true });
    await logUsageDelta(stage, usageBefore);
    return;
  }

  if (stage === "synthesize") {
    const evidenceDir = opts.engine.evidenceDir;
    let stackProfile: any = null;
    let depGraph: any = null;
    try {
      const spPath = path.join(evidenceDir, "stack-profile.json");
      stackProfile = await fs.readJson(spPath);
    } catch {
      stackProfile = null;
    }
    try {
      const dgPath = path.join(evidenceDir, "dep-graph.json");
      depGraph = await fs.readJson(dgPath);
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
    await logUsageDelta(stage, usageBefore);
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

  if (stage === "dev" || stage === "user" || stage === "audit") {
    const resume = !!opts.resume;
    let shouldExtract = true;
    let shouldSynthesize = true;
    let shouldRender = true;

    if (resume) {
      const docsDir = opts.engine.docsDir;
      const evidenceDir = opts.engine.evidenceDir;
      const hasApiMap = await fs.pathExists(
        path.join(evidenceDir, "api-map.json"),
      );
      const hasDevDocs = await fs.pathExists(
        path.join(docsDir, "Repository Guidelines.md"),
      );
      const hasUserDocs = await fs.pathExists(
        path.join(docsDir, "User Guide.md"),
      );
      const hasAuditDocs = await fs.pathExists(
        path.join(docsDir, "Function Point Report.md"),
      );
      const hasErd = await fs.pathExists(path.join(docsDir, "ERD.md"));

      shouldExtract = !hasApiMap;
      if (stage === "dev") {
        shouldSynthesize = !hasDevDocs;
      } else if (stage === "user") {
        shouldSynthesize = !hasUserDocs;
      } else if (stage === "audit") {
        shouldSynthesize = !hasAuditDocs;
      } else {
        // "all" – treat synth as done only if all families exist
        shouldSynthesize = !(hasDevDocs && hasUserDocs && hasAuditDocs);
      }
      shouldRender = !hasErd;
    }

    if (shouldExtract) {
      await orchestrate("extract", opts);
    }
    if (shouldSynthesize) {
      await orchestrate("synthesize", {
        ...opts,
        profile: stage,
      });
    }
    if (shouldRender) {
      await orchestrate("render", opts);
    }
    await orchestrate("check", opts);
    emit({ type: "stage-end", success: true });
    await logUsageDelta(stage, usageBefore);
    return;
  }

  if (stage === "all") {
    await orchestrate("extract", opts);
    await orchestrate("synthesize", { ...opts, profile: "dev" });
    await orchestrate("synthesize", { ...opts, profile: "user" });
    await orchestrate("synthesize", { ...opts, profile: "audit" });
    await orchestrate("render", opts);
    await orchestrate("check", opts);
    emit({ type: "stage-end", success: true });
    await logUsageDelta(stage, usageBefore);
  }
}

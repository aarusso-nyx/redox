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
import type { EngineContext } from "./context.js";
import { connectByEnv, introspect, buildDDLFromMigrations, type DbModel } from "../extractors/db.js";
import { laravelRoutes } from "../extractors/api-laravel.js";
import { detectFrontend } from "../extractors/frontend-detect.js";
import { extractBlade } from "../extractors/blade.js";
import { extractReactRoutes } from "../extractors/react-routes.js";
import { writeDbAndErdFromModel } from "../writers/dev-docs.js";
import { writeDevDocsLLM, writeUserDocsLLM, writeAuditDocsLLM } from "../writers/llm-writers.js";

type Stage = "dev" | "user" | "audit" | "all" | "extract" | "synthesize" | "render" | "check";

type OrchestratorOpts = {
  engine: EngineContext;
  adapterId?: string;
  seedsDir?: string | null;
  profile?: "dev" | "user" | "audit" | "all";
  gates?: string;
  factsOnly?: boolean;
};

let dbModelCache: DbModel | null = null;
let routesCache: any[] | null = null;
let frontendCache: any | null = null;

async function runExtract(engine: EngineContext) {
  // DB introspection via Postgres catalogs (env-based strategy)
  let model: any = { tables: [], fks: [], indexes: [] };
  let client: any;
  try {
    client = await connectByEnv();
    model = await introspect(client);
  } catch {
    // fall back to empty model if DATABASE_URL/pg are unavailable
  } finally {
    try {
      await client?.end?.();
    } catch {
      // ignore
    }
  }
  dbModelCache = model;

  // Laravel routes (if applicable)
  const routes = await laravelRoutes(engine.root).catch(() => []);
  routesCache = routes;

  // Frontend detection + mappings
  const frontendMode = await detectFrontend(engine.root);
  frontendCache = { mode: frontendMode, blade: null as any, react: null as any };
  if (frontendMode === "blade" || frontendMode === "mixed") {
    frontendCache.blade = await extractBlade(engine.root).catch(() => null);
  }
  if (frontendMode === "react" || frontendMode === "mixed") {
    frontendCache.react = await extractReactRoutes(engine.root).catch(() => null);
  }

  return {
    dbModel: model,
    routes,
    frontend: frontendCache,
  };
}

async function runRender(engine: EngineContext) {
  if (!dbModelCache) return;
  await buildDDLFromMigrations(engine.root);
  await writeDbAndErdFromModel(engine.root, engine.docsDir, dbModelCache);
  await ensurePlaceholderArtifacts(engine);
}

export async function orchestrate(stage: Stage, opts: OrchestratorOpts) {
  const gates = opts.gates ?? "schema,coverage,evidence,build,traceability";

  if (stage === "check") {
    const root = opts.engine.root;
    const docsDir = opts.engine.docsDir;
    const evidenceDir = opts.engine.evidenceDir;

    const coveragePath = path.join(evidenceDir, "coverage-matrix.json");
    const rbacPath = path.join(evidenceDir, "rbac.json");
    const lgpdPath = path.join(evidenceDir, "lgpd-map.json");
    const fpPath = path.join(evidenceDir, "fp-appendix.json");

    let coverageData: any | null = null;
    if (fs.existsSync(coveragePath)) {
      coverageData = await fs.readJson(coveragePath);
    }

    if (gates.includes("schema")) {
      if (coverageData) {
        const { loadSchemaFile } = await import("./schemaLoader.js");
        const coverageSchema = await loadSchemaFile("CoverageMatrix.schema.json");
        schemaGate(coverageSchema, coverageData);
      }
      if (fs.existsSync(rbacPath)) {
        const { loadSchemaFile } = await import("./schemaLoader.js");
        const rbacSchema = await loadSchemaFile("Rbac.schema.json");
        const rbacData = await fs.readJson(rbacPath);
        schemaGate(rbacSchema, rbacData);
      }
      if (fs.existsSync(fpPath)) {
        const { loadSchemaFile } = await import("./schemaLoader.js");
        const fpSchema = await loadSchemaFile("Fp.schema.json");
        const fpData = await fs.readJson(fpPath);
        schemaGate(fpSchema, fpData);
      }
    }

    if (gates.includes("coverage") && coverageData) {
      const allRoutes = (coverageData.routes ?? []).map((id: string) => ({ id }));
      const allEndpoints = (coverageData.endpoints ?? []).map((id: string) => ({ id }));
      const links = (coverageData.links ?? []).map((l: any) => ({
        routeId: l.routeId,
        endpointId: l.endpointId,
        useCaseId: l.useCaseId,
      }));
      coverageGate(allRoutes, allEndpoints, links);
    }

    if (gates.includes("traceability") && coverageData) {
      traceabilityGate(coverageData);
    }

    if (gates.includes("evidence")) {
      const evidenceFile = path.join(evidenceDir, "evidence.jsonl");
      await evidenceFileGate(root, evidenceFile);
    }

    if (gates.includes("build")) {
      await buildGate(root, docsDir);
    }

    if (fs.existsSync(rbacPath)) {
      const rbacData = await fs.readJson(rbacPath);
      const matrixRows =
        rbacData.roleBindings?.map((b: any) => ({
          role: b.roleId,
          permission: b.permissionId,
          evidence: (b.evidence ?? []).map((e: any) => `${e.path}:${e.startLine}-${e.endLine}`),
        })) ?? [];
      rbacGate(matrixRows);
    }

    if (fs.existsSync(lgpdPath)) {
      const lgpdData = await fs.readJson(lgpdPath);
      if (Array.isArray(lgpdData)) {
        lgpdGate(lgpdData);
      }
    }

    return;
  }

  if (stage === "extract") {
    await runExtract(opts.engine);
    return;
  }

  if (stage === "render") {
    await runRender(opts.engine);
    return;
  }

  if (stage === "synthesize") {
    const facts = {
      dbModel: dbModelCache ?? { tables: [], fks: [], indexes: [] },
      routes: routesCache ?? [],
      frontend: frontendCache ?? {},
    };
    const profile = opts.profile ?? "dev";
    if (profile === "dev" || profile === "all") {
      await writeDevDocsLLM(opts.engine, facts);
    }
    if (profile === "user" || profile === "all") {
      await writeUserDocsLLM(opts.engine, facts);
    }
    if (profile === "audit" || profile === "all") {
      await writeAuditDocsLLM(opts.engine, facts);
    }
    return;
  }

  if (stage === "dev" || stage === "user" || stage === "audit" || stage === "all") {
    await orchestrate("extract", opts);
    await orchestrate("synthesize", { ...opts, profile: stage === "all" ? "dev" : stage });
    await orchestrate("render", opts);
    await orchestrate("check", opts);
  }
}

import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";
import type {
  CoverageMatrix,
  CoverageTriad,
  UseCase,
  UseCasesDoc,
} from "./types.js";

function collectRefsFromUseCase(uc: UseCase): {
  routeIds: Set<string>;
  endpointIds: Set<string>;
} {
  const routeIds = new Set<string>();
  const endpointIds = new Set<string>();

  const addRefs = (ref: any) => {
    if (!ref) return;
    if (Array.isArray(ref.routeIds)) {
      for (const id of ref.routeIds) {
        if (typeof id === "string" && id) routeIds.add(id);
      }
    }
    if (Array.isArray(ref.endpointIds)) {
      for (const id of ref.endpointIds) {
        if (typeof id === "string" && id) endpointIds.add(id);
      }
    }
  };

  addRefs(uc.refs);

  const mainFlow = Array.isArray(uc.mainFlow) ? uc.mainFlow : [];
  for (const step of mainFlow) {
    addRefs(step.refs);
  }

  const altFlows = Array.isArray(uc.alternateFlows) ? uc.alternateFlows : [];
  for (const flow of altFlows) {
    const steps = Array.isArray(flow.steps) ? flow.steps : [];
    for (const step of steps) {
      addRefs(step.refs);
    }
  }

  return { routeIds, endpointIds };
}

export async function buildCoverageMatrix(engine: EngineContext) {
  const dir = engine.evidenceDir;
  await fs.ensureDir(dir);

  const coveragePath = path.join(dir, "coverage-matrix.json");
  const now = new Date().toISOString();

  // Collect endpoints from ApiMap (if present)
  const apiMapPath = path.join(dir, "api-map.json");
  const endpointIds = new Set<string>();
  if (await fs.pathExists(apiMapPath)) {
    const apiMap = await fs.readJson(apiMapPath);
    const endpoints = Array.isArray(apiMap.endpoints) ? apiMap.endpoints : [];
    for (const ep of endpoints) {
      const id =
        typeof ep.id === "string" && ep.id
          ? ep.id
          : `${ep.method ?? ""} ${ep.path ?? ""}`.trim();
      if (id) endpointIds.add(id);
    }
  }

  // Collect routes from all routes-* artifacts (if present)
  const routeIds = new Set<string>();
  try {
    const entries = await fs.readdir(dir);
    for (const name of entries) {
      if (!name.startsWith("routes-") || !name.endsWith(".json")) continue;
      const routesPath = path.join(dir, name);
      const routesDoc = await fs.readJson(routesPath);
      const routes = Array.isArray(routesDoc.routes) ? routesDoc.routes : [];
      for (const r of routes) {
        const id =
          typeof r.id === "string" && r.id ? r.id : String(r.path ?? "");
        if (id) routeIds.add(id);
      }
    }
  } catch {
    // ignore directory read errors; other gates will surface issues if needed
  }

  // Collect use cases from machine artifact (if present)
  const useCasesPath = path.join(dir, "use-cases.json");
  const useCasesSummary: { id: string; title?: string }[] = [];
  const triads: CoverageTriad[] = [];

  if (await fs.pathExists(useCasesPath)) {
    const ucDoc = (await fs.readJson(useCasesPath)) as UseCasesDoc;
    const cases = Array.isArray(ucDoc.cases) ? ucDoc.cases : [];
    for (const uc of cases) {
      if (!uc || typeof uc.id !== "string" || !uc.id) continue;
      useCasesSummary.push({
        id: uc.id,
        title: typeof uc.title === "string" ? uc.title : undefined,
      });

      const { routeIds: ucRoutes, endpointIds: ucEndpoints } =
        collectRefsFromUseCase(uc);
      if (ucRoutes.size && ucEndpoints.size) {
        for (const routeId of ucRoutes) {
          for (const endpointId of ucEndpoints) {
            triads.push({ routeId, endpointId, useCaseId: uc.id });
          }
        }
      }
    }
  }

  const routesArr = Array.from(routeIds);
  const endpointsArr = Array.from(endpointIds);

  const unmappedRoutes = new Set(routesArr);
  const unmappedEndpoints = new Set(endpointsArr);

  for (const link of triads) {
    if (link.routeId) unmappedRoutes.delete(link.routeId);
    if (link.endpointId) unmappedEndpoints.delete(link.endpointId);
  }

  const coverage: CoverageMatrix = {
    schemaVersion: "1.0",
    generatedAt: now,
    routes: routesArr,
    endpoints: endpointsArr,
    useCases: useCasesSummary,
    links: triads,
    unmapped: {
      routes: Array.from(unmappedRoutes),
      endpoints: Array.from(unmappedEndpoints),
    },
    stats: {
      routeCount: routesArr.length,
      endpointCount: endpointsArr.length,
      useCaseCount: useCasesSummary.length,
      linkCount: triads.length,
    },
  };

  await fs.writeJson(coveragePath, coverage, { spaces: 2 });
}

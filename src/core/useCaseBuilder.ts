import fs from "fs-extra";
import path from "node:path";
import type { EngineContext } from "./context.js";

type RoutesDoc = { routes?: { id?: string; path?: string }[] };
type ApiMapDoc = {
  endpoints?: { id?: string; path?: string; method?: string }[];
};

export async function buildUseCaseSkeleton(
  engine: EngineContext,
  opts: { dryRun: boolean; debug: boolean },
) {
  const outPath = path.join(engine.evidenceDir, "use-cases.json");
  if (await fs.pathExists(outPath)) {
    if (opts.debug) {
      console.log(
        "[redox][debug] use-cases.json exists; skipping skeleton build",
      );
    }
    return;
  }

  const routesDocs: RoutesDoc[] = [];
  const endpoints: { id: string; path: string; method?: string }[] = [];

  try {
    const entries = await fs.readdir(engine.evidenceDir);
    for (const name of entries) {
      if (!name.startsWith("routes-") || !name.endsWith(".json")) continue;
      const full = path.join(engine.evidenceDir, name);
      const doc = await fs.readJson(full);
      routesDocs.push(doc);
    }
  } catch {
    // ignore
  }

  try {
    const apiPath = path.join(engine.evidenceDir, "api-map.json");
    if (await fs.pathExists(apiPath)) {
      const apiDoc = (await fs.readJson(apiPath)) as ApiMapDoc;
      for (const ep of apiDoc.endpoints ?? []) {
        if (!ep?.id) continue;
        endpoints.push({
          id: ep.id,
          path: ep.path ?? "",
          method: ep.method,
        });
      }
    }
  } catch {
    // ignore
  }

  const routeIds = routesDocs
    .flatMap((r) => r.routes ?? [])
    .map((r) => (r?.id ? String(r.id) : ""))
    .filter(Boolean);

  if (!endpoints.length && !routeIds.length) {
    if (opts.debug) {
      console.log(
        "[redox][debug] No routes/endpoints; skipping use-case skeleton",
      );
    }
    return;
  }

  const roles = ["user"];
  const cases: any[] = [];
  let counter = 1;

  if (endpoints.length) {
    for (const ep of endpoints) {
      const ucId = `UC-${counter.toString().padStart(3, "0")}`;
      counter += 1;
      const matchingRoute = routeIds.find((rid) =>
        rid.toLowerCase().includes(ep.path.toLowerCase()),
      );
      cases.push({
        id: ucId,
        title: `${ep.method ?? ""} ${ep.path}`.trim(),
        actors: ["user"],
        mainFlow: [
          {
            action: `Invoke ${ep.method ?? ""} ${ep.path}`,
            refs: {
              endpointIds: [ep.id],
              routeIds: matchingRoute ? [matchingRoute] : [],
            },
          },
        ],
        inferred: true,
      });
    }
  } else {
    for (const rid of routeIds) {
      const ucId = `UC-${counter.toString().padStart(3, "0")}`;
      counter += 1;
      cases.push({
        id: ucId,
        title: `Navigate ${rid}`,
        actors: ["user"],
        mainFlow: [
          {
            action: `Visit route ${rid}`,
            refs: { routeIds: [rid] },
          },
        ],
        inferred: true,
      });
    }
  }

  const doc = {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    roles,
    cases,
    stats: {
      roleCount: roles.length,
      caseCount: cases.length,
      stepCount: cases.reduce(
        (acc, c) => acc + (Array.isArray(c.mainFlow) ? c.mainFlow.length : 0),
        0,
      ),
    },
  };

  if (opts.dryRun) {
    console.log(
      "[redox][debug] (dry-run) Would write skeleton use-cases to",
      outPath,
    );
    return;
  }

  await fs.ensureDir(engine.evidenceDir);
  await fs.writeJson(outPath, doc, { spaces: 2 });
  if (opts.debug) {
    console.log("[redox][debug] use-cases skeleton written", {
      path: outPath,
      cases: cases.length,
    });
  }
}

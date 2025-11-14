import { cruise } from "dependency-cruiser";

/**
 * dependency-cruiser based dependency graph extractor
 */
export async function tsDepGraph(entry: string) {
  const result = await cruise([entry], {
    exclude: {
      path: ["node_modules", "dist", "\\.revdoc"],
    },
    includeOnly: entry ? [entry] : undefined,
    tsConfig: { fileName: "./tsconfig.json" },
    combinedDependencies: true,
    doNotFollow: {
      path: "node_modules",
    },
    outputType: "json",
  });

  if (result.output) {
    const parsed =
      typeof result.output === "string"
        ? JSON.parse(result.output)
        : result.output;
    const modules = parsed.modules ?? [];

    const graph: Record<string, string[]> = {};
    for (const m of modules) {
      const source = m.source as string;
      const deps = (m.dependencies ?? []).map(
        (d: { resolved: string }) => d.resolved,
      );
      graph[source] = deps;
    }

    return { graph };
  }

  return { graph: {} as Record<string, string[]> };
}

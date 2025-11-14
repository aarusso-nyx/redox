export function traceabilityGate(matrix: any) {
  if (!matrix) {
    throw new Error("TraceabilityGate: coverage matrix is missing");
  }

  const unmapped = matrix.unmapped ?? {};
  const unmappedRoutes: string[] = unmapped.routes ?? [];
  const unmappedEndpoints: string[] = unmapped.endpoints ?? [];

  const missingRoutes = unmappedRoutes.length;
  const missingEndpoints = unmappedEndpoints.length;

  if (missingRoutes || missingEndpoints) {
    throw new Error(
      `TraceabilityGate failed: routes=${missingRoutes} endpoints=${missingEndpoints}`,
    );
  }

  const stats = matrix.stats ?? {};
  if (Array.isArray(matrix.routes) && typeof stats.routeCount === "number") {
    if (stats.routeCount !== matrix.routes.length) {
      throw new Error(
        `TraceabilityGate stats mismatch: routeCount=${stats.routeCount} routes.length=${matrix.routes.length}`,
      );
    }
  }

  if (
    Array.isArray(matrix.endpoints) &&
    typeof stats.endpointCount === "number"
  ) {
    if (stats.endpointCount !== matrix.endpoints.length) {
      throw new Error(
        `TraceabilityGate stats mismatch: endpointCount=${stats.endpointCount} endpoints.length=${matrix.endpoints.length}`,
      );
    }
  }

  if (
    Array.isArray(matrix.useCases) &&
    typeof stats.useCaseCount === "number"
  ) {
    if (stats.useCaseCount !== matrix.useCases.length) {
      throw new Error(
        `TraceabilityGate stats mismatch: useCaseCount=${stats.useCaseCount} useCases.length=${matrix.useCases.length}`,
      );
    }
  }

  if (Array.isArray(matrix.links) && typeof stats.linkCount === "number") {
    if (stats.linkCount !== matrix.links.length) {
      throw new Error(
        `TraceabilityGate stats mismatch: linkCount=${stats.linkCount} links.length=${matrix.links.length}`,
      );
    }
  }
}

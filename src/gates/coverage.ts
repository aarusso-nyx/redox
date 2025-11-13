type Route = { id: string };
type Endpoint = { id: string };
type UseCase = { id: string };
type Link = { routeId: string; endpointId: string; useCaseId: string };

export function coverageGate(allRoutes: Route[], allEndpoints: Endpoint[], links: Link[]) {
  const coveredRoutes = new Set(links.map(l => l.routeId));
  const coveredEndpoints = new Set(links.map(l => l.endpointId));
  const missingRoutes = allRoutes.filter(r => !coveredRoutes.has(r.id));
  const missingEndpoints = allEndpoints.filter(e => !coveredEndpoints.has(e.id));
  if (missingRoutes.length || missingEndpoints.length) {
    throw new Error(`CoverageGate failed: routes=${missingRoutes.length} endpoints=${missingEndpoints.length}`);
  }
}

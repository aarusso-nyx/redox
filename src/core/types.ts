// Shared TypeScript types corresponding to core JSON artifacts.

export type Evidence = {
  path: string;
  startLine: number;
  endLine: number;
  sha256?: string;
  note?: string;
};

export type ApiControllerRef = {
  file: string;
  class?: string;
  methodName?: string;
  startLine?: number;
  endLine?: number;
};

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type ApiEndpoint = {
  id: string;
  method: HttpMethod;
  path: string;
  summary?: string;
  controller: ApiControllerRef;
  source?: "openapi" | "routes" | "inferred";
  evidence: Evidence[];
};

export type ApiMap = {
  schemaVersion: string;
  generatedAt: string;
  sourceRepo?: string;
  stack?: {
    backend: string;
    frontend: string;
    db: string;
  };
  endpoints: ApiEndpoint[];
};

export type RouteComponentRef = {
  name?: string;
  file: string;
  startLine?: number;
  endLine?: number;
};

export type ApiCallRef = {
  method: HttpMethod;
  path: string;
  endpointId?: string;
};

export type FrontendRoute = {
  id: string;
  path: string;
  parentId?: string;
  children?: string[];
  component?: RouteComponentRef;
  lazy?: boolean;
  guards?: string[];
  resolvers?: string[];
  params?: string[];
  dataKeys?: string[];
  roles?: string[];
  apiCalls?: ApiCallRef[];
  evidence: Evidence[];
};

export type RoutesDoc = {
  schemaVersion: string;
  generatedAt: string;
  framework: "angular" | "react" | "angularjs" | "nextjs" | "remix" | string;
  routes: FrontendRoute[];
};

export type CoverageTriad = {
  routeId: string;
  endpointId: string;
  useCaseId: string;
  inferred?: boolean;
  evidence?: Evidence[];
};

export type CoverageUseCaseSummary = {
  id: string;
  title?: string;
};

export type CoverageMatrix = {
  schemaVersion: string;
  generatedAt: string;
  routes: string[];
  endpoints: string[];
  useCases: CoverageUseCaseSummary[];
  links: CoverageTriad[];
  unmapped: {
    routes: string[];
    endpoints: string[];
  };
  stats?: {
    routeCount?: number;
    endpointCount?: number;
    useCaseCount?: number;
    linkCount?: number;
  };
};

export type UseCaseRef = {
  routeIds?: string[];
  endpointIds?: string[];
};

export type UseCaseStep = {
  id?: string;
  action: string;
  actorRole?: string;
  refs?: UseCaseRef;
};

export type UseCaseAltFlow = {
  id?: string;
  when: string;
  steps: UseCaseStep[];
};

export type UseCase = {
  id: string;
  title: string;
  mainFlow: UseCaseStep[];
  alternateFlows?: UseCaseAltFlow[];
  refs?: UseCaseRef;
};

export type UseCasesDoc = {
  schemaVersion: string;
  generatedAt: string;
  roles: string[];
  cases: UseCase[];
};


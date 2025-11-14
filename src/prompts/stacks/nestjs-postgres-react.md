**Stack overlay: NestJS + PostgreSQL + React**

- Backend (NestJS + Postgres):
  - Use the NestJS controller extractor to find `@Controller` classes and HTTP method decorators (`@Get`, `@Post`, etc.); build full paths from controller base path + method path.
  - When `@nestjs/swagger` / OpenAPI is present, treat it as the primary API description and backfill handler evidence from controllers.
  - Capture DTOs with `class-validator` decorators, Guards, Interceptors, and module-level middleware as evidence for each endpoint (include handler file + lines).
  - When ORM metadata (TypeORM/Prisma) or migrations exist, normalize them to canonical PostgreSQL DDL for the DB model and ERD, preferring `jsonb` and `timestamp without time zone` where appropriate.

- Frontend (React):
  - Detect React Router route trees or Next.js file-based routes under `resources/js` or `src`; list each route’s `path` and component/element.
  - For routed components, scan for `fetch` / `axios` (or similar client libraries) and associate calls with backend endpoints by HTTP method + URL.
  - Record component file paths and (where feasible) line ranges as evidence for both the routes inventory and the Coverage Matrix.

- Coverage & traceability:
  - Every React route and NestJS endpoint must map to ≥1 Use Case; maintain a Route ↔ Endpoint ↔ Use Case coverage matrix.
  - Export unmapped routes/endpoints explicitly; these lists should be empty to satisfy the coverage gate.

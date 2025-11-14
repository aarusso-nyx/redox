**Stack overlay: NestJS + PostgreSQL + Angular**

- Backend (NestJS + Postgres):
  - Use the NestJS controller extractor to find `@Controller` classes and HTTP method decorators (`@Get`, `@Post`, etc.); build full paths from controller `basePath` + method `path`.
  - Capture DTOs with `class-validator` decorators, Guards, Interceptors, and module-level middleware as evidence for each endpoint (include file paths and line spans where possible).
  - When ORM metadata (TypeORM/Prisma) or migrations are present, normalize to canonical PostgreSQL DDL for the DB model and ERD, preferring `jsonb` and `timestamp without time zone` where appropriate.

- Frontend (Angular):
  - Use the Angular routes extractor to read `RouterModule.forRoot/forChild` arrays and standalone route configs; capture `path`, `component`, `redirectTo`, `pathMatch`, and any lazy-loaded `loadChildren` modules.
  - For routed components, scan services/effects for `HttpClient` calls and associate them with backend endpoints by HTTP method + URL (relative or absolute).
  - Treat route guards/resolvers as hints for RBAC and preconditions in Use Cases (include them in the routes inventory with evidence).

- Coverage & traceability:
  - Every Angular route and NestJS endpoint must link to ≥1 Use Case in the Coverage Matrix.
  - Emit unmapped routes/endpoints explicitly in `unmapped.routes` / `unmapped.endpoints`; these should be empty lists for the coverage gate to pass.

**Stack overlay: Express + Knex + PostgreSQL + Angular**

- Backend (Express + Knex + Postgres):
  - Discover routes from Express `app` and `Router` instances (`get`, `post`, `put`, `patch`, `delete`, etc.), including mounted routers and middleware chains; record handler files and function names as evidence.
  - Use Knex migration files (e.g., `migrations/**/*.js`/`*.ts`) as evidence for table/column definitions, constraints, and enum-like values; keep them consistent with the introspected PostgreSQL schema.
  - When validation middleware (Joi/Zod/express-validator) is present, extract request/response schema hints and attach them to endpoints in the API Map.

- Database (Postgres via Knex):
  - Prefer the live PostgreSQL schema from introspection for `database.sql` and the DB model; treat Knex migrations as supporting evidence and call out discrepancies explicitly.
  - Ensure RBAC-related tables (roles/permissions) are separated as ILFs in the Database Reference and FP counting.

- Frontend (Angular):
  - Use the Angular routes extractor to collect `RouterModule.forRoot/forChild` configs and any standalone route arrays; record `path`, `component`, redirects, and path-matching rules.
  - Link `HttpClient` calls in services/effects to Express endpoints using method + URL matching (including base API URL configuration), and capture file/line evidence for each call.

- Coverage & traceability:
  - Every Angular route and Express endpoint should map to ≥1 Use Case; export unmapped routes/endpoints in the Coverage Matrix for the coverage gate.
  - Call out backend-only endpoints (no matching frontend route) and frontend-only routes (no matching endpoint) with explicit rationale where they are intentional (e.g., internal APIs, admin-only tools).


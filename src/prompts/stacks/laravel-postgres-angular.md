**Stack overlay: Laravel + PostgreSQL + Angular**

- Backend (Laravel + Postgres):
  - Use `php artisan route:list --json` as the primary source of truth for endpoints; fall back to parsing `routes/*.php` when CLI output is unavailable.
  - Parse controllers under `app/Http/Controllers/**`, Request classes for validation, and Policies/Gates for RBAC; attach these as evidence to endpoints in the API Map.
  - Build the DB model from `database/migrations/**` (and seeders/factories when present), preferring PostgreSQL types such as `jsonb` and `timestamp without time zone`.

- Frontend (Angular):
  - Use the Angular routes extractor to parse `RouterModule.forRoot/forChild` route arrays; capture `path`, `component`, `redirectTo`, `pathMatch`, and any lazy `loadChildren` modules.
  - Link `HttpClient` calls in services/effects used by routed components to API endpoints (match by method + path/base URL).
  - Treat route guards/resolvers as hints for role-based access and preconditions in Use Cases and Requirements.

- Docs & coverage:
  - Ensure every Angular route and Laravel endpoint maps to ≥1 Use Case; generate the Route ↔ Endpoint ↔ Use Case traceability matrix.
  - Export unmapped routes/endpoints explicitly and surface them in coverage/assurance docs so gaps are visible and auditable.

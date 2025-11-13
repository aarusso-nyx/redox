**Stack overlay: Laravel + PostgreSQL + Angular**

- Back end:
  - Use `php artisan route:list --json` as source of truth for endpoints.
  - Parse controllers under `app/Http/Controllers/**`, Requests for validation, Policies/Gates for RBAC.
  - Reverse DB from `database/migrations/**`; prefer Postgres types (`jsonb`, `timestamp without time zone`).

- Front end (Angular):
  - Parse RouterModule (forRoot/forChild); collect guards/resolvers.
  - Link `HttpClient` calls in services to API endpoints (method, path).

- Docs & coverage:
  - Ensure every endpoint and route maps to ≥1 user case; generate the traceability matrix.
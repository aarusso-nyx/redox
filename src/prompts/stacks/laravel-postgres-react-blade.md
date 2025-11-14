**Stack overlay: Laravel + PostgreSQL + React + Blade**

- Backend (Laravel + Postgres):
  - Same backend strategy as for `laravel-postgres-blade`: prefer `php artisan route:list --json`, map controllers/Requests/Policies, and normalize migrations to PostgreSQL DDL for the DB model and ERD.
  - Distinguish API routes (typically `routes/api.php`) from web routes (`routes/web.php`); both contribute endpoints to the API Map, with middleware and Policies as RBAC hints.

- Frontend (mixed React + Blade):
  - Use the React routes extractor to list SPA routes from `resources/js/**/*.{tsx,jsx,ts,js}`; capture `path` and component for each `<Route>` (including nested routes).
  - Use the Blade extractor to map Blade views, `route()` usages, and form `action` URLs back to Laravel routes.
  - Treat React SPA paths and Blade-rendered pages as frontend routes of different types; both must appear in the routes inventory with evidence (component/view file + lines).

- Coverage & traceability:
  - Include both SPA routes and Blade entry points in the Coverage Matrix and ensure each maps to ≥1 API endpoint and Use Case wherever the UX genuinely calls the backend.
  - Highlight gaps: SPA calls that hit endpoints not present in `route:list`, Blade views whose routes are missing or ambiguous, and endpoints with no visible UI surface.


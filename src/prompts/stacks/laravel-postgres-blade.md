**Stack overlay: Laravel + PostgreSQL + Blade**

- Backend (Laravel + Postgres):
  - Prefer `php artisan route:list --json` as the source of truth for routes; fall back to parsing `routes/*.php` when CLI output is unavailable.
  - Map each route to its controller action, middleware stack, and name; use Requests and Policies/Gates as RBAC evidence for endpoints.
  - Build the DB model from `database/migrations/**` (plus seeders/factories when present), choosing PostgreSQL-friendly types like `jsonb` and `timestamp without time zone`.

- Frontend (Blade):
  - Use the Blade extractor to enumerate `resources/views/**/*.blade.php` templates, their `@extends` / `@include` relations, and `<form>` actions.
  - Treat each `route('name')` call and each `<form>` `action` URL as a frontend entry point tied to a Laravel route; record the Blade view, route name/URI, and method as evidence.
  - When Blade hosts React/Alpine components, still record the Blade view as the primary UI surface for coverage and use-case mapping.

- Coverage & traceability:
  - Ensure every HTTP route and Blade-driven page is covered by ≥1 Use Case; treat server-rendered pages as frontend routes in the Coverage Matrix.
  - Explicitly list routes without Blade views (pure API) and Blade views whose routes cannot be resolved; these gaps should show up in `unmapped` lists and be called out in docs.

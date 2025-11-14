**Stack overlay: Java 8 / Spring + Oracle + AngularJS (legacy)**

- Backend (Spring + Oracle):
  - Detect Spring MVC/REST controllers via `@Controller` / `@RestController` and `@RequestMapping` / `@GetMapping` / `@PostMapping` methods; if an OpenAPI/Swagger spec is present, treat it as the primary API description and cross-check handlers against it.
  - For Oracle DDL (tables, sequences, triggers, synonyms), normalize to a canonical schema JSON and optionally translate to PostgreSQL for `database.sql`, preserving fidelity notes where translation is lossy (e.g., NUMBER precision, identity vs sequence+trigger).
  - Capture security annotations, interceptors/filters, and transaction boundaries as RBAC and reliability evidence for endpoints.

- Frontend (AngularJS 1.x):
  - Scan for `$routeProvider.when(...)` and `$stateProvider.state(...)` definitions to build the routes inventory; record URL, template, controller, and resolve functions.
  - Treat legacy patterns such as inline controllers, `ng-include`, and form posts as UI surfaces; connect them to backend endpoints when URLs or named routes match.

- Legacy cautions & coverage:
  - Assume Java 8 language level and older Spring/AngularJS idioms; describe current behavior rather than proposing framework upgrades.
  - Be explicit about Oracle-specific behaviors (case sensitivity, date/number handling) and any limitations when projecting them into Postgres-centric documentation and ERD.
  - Ensure AngularJS routes and Spring endpoints are mapped into the Coverage Matrix with ≥1 Use Case each, and surface unmapped items as risk in audit docs.

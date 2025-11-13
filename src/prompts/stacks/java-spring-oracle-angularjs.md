**Stack overlay: Java/Spring + Oracle + AngularJS**

- Back end:
  - Detect Spring MVC/REST controllers and `@RequestMapping` methods; if OpenAPI is present, prefer it.
  - For Oracle DDL, normalize to a canonical schema JSON and (optionally) translate to Postgres with fidelity notes.

- Front end (AngularJS):
  - Grep for `$routeProvider.when(...)` or `$stateProvider.state(...)`; collect URL patterns, controllers, resolves.

- Cautions:
  - Be explicit about Oracle types and sequences/triggers; call out translation limits when rendering Postgres DDL.
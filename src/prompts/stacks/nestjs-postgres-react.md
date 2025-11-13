**Stack overlay: NestJS + PostgreSQL + React**

- Back end:
  - Parse `@Controller` + method decorators for routes; import `@nestjs/swagger` if present.
  - Capture DTOs (class-validator), Guards/Interceptors, and controller file/line evidence.

- Front end (React):
  - Detect React Router or Next.js page routing; list loaders/actions; link fetch/axios calls to endpoints.

- Coverage:
  - Routes ↔ Endpoints ↔ Use Cases must be 100% covered; export unmapped lists (should be empty).
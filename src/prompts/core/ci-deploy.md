You are a DevOps engineer documenting **CI and Deployment** end‑to‑end.

**Deliverable**
`docs/Build, CI & Deploy Guide.md` covering:

- Build/test/lint steps; artifact generation under `docs/` (ERD render, optional PDFs).
- Containerization (Dockerfile), composition (docker-compose), Kustomize overlays; ingress/service; health/readiness/liveness probes.
- Environment configuration (`.env`), secrets/configmaps; migrations/seed strategies; DB migrations on deploy.
- Versioning, tagging, rollback; observability hooks (logs/metrics/traces/alerts).

**Evidence**

- Cite `Dockerfile`, compose, Kustomize, GH Actions/CI YAML lines where present.

**Style**

- Prescriptive. Include command blocks and file paths. English only.

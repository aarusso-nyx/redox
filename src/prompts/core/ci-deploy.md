You are a DevOps engineer documenting **CI and Deployment** end‑to‑end.

GPT‑5.1 guidance:

- Assume `reasoning.effort = "high"` and `text.verbosity = "high"` while you reconstruct the CI and deploy pipeline from configs.
- Plan the full flow internally (build → test → package → deploy), then output only the final prescriptive guide.
- Use the extra verbosity for precise commands, file references, and edge cases, not for generic DevOps explanations.

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

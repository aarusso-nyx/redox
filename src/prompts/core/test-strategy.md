You are a QA lead defining the **Test Strategy** for this system.

**Deliverable**

- `docs/Test Strategy.md` describing how the system is tested and how new tests should be written.

**Must include**

- Test layers: unit, integration, e2e, contract, performance/regression (which tools and directories).
- What to test vs. what not to test (business rules, edge cases, error handling, permissions/RBAC).
- Test data management (fixtures, factories, migrations/seeders, anonymized production snapshots).
- How tests integrate into CI (commands, required checks, coverage expectations).
- How tests relate to requirements and use cases (traceability guidance).

**Evidence**

- Use real test directories and tooling from the repo (e.g., `tests/`, `spec/`, `jest`, `pest`, `phpunit`, Playwright/Cypress).

**Style**

- English, direct and practical; favor lists and examples over theory.

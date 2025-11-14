import { describe, it, expect } from "vitest";
import { rbacGate } from "../src/gates/rbac.js";
import { lgpdGate } from "../src/gates/compliance.js";

describe("rbacGate", () => {
  it("passes when every row has evidence", () => {
    const matrix = [
      { role: "admin", permission: "manage-users", evidence: ["app/User.php:10-20"] },
      { role: "user", permission: "view-dashboard", evidence: ["app/Dashboard.php:5-15"] },
    ];

    expect(() => rbacGate(matrix)).not.toThrow();
  });

  it("fails when matrix is empty", () => {
    expect(() => rbacGate([])).toThrowError(/RBAC matrix is empty/);
  });

  it("fails when any row has no evidence", () => {
    const matrix = [{ role: "admin", permission: "manage-users", evidence: [] }];
    expect(() => rbacGate(matrix)).toThrowError(/RBAC row missing evidence: admin\/manage-users/);
  });
});

describe("lgpdGate", () => {
  it("passes when all entries have legalBasis and retention", () => {
    const entries = [
      { field: "email", table: "public.users", legalBasis: "consent", retention: "2 years" },
      { field: "name", table: "public.users", legalBasis: "contract", retention: "3 years" },
    ];

    expect(() => lgpdGate(entries)).not.toThrow();
  });

  it("fails when any entry is missing legalBasis or retention", () => {
    const entries = [
      { field: "email", table: "public.users", legalBasis: "", retention: "2 years" },
      { field: "name", table: "public.users", legalBasis: "contract", retention: "" },
    ];

    expect(() => lgpdGate(entries as any)).toThrowError(/LGPD map incomplete for 2 fields/);
  });
});


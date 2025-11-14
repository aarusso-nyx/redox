export function rbacGate(
  matrix: { role: string; permission: string; evidence: string[] }[],
) {
  if (!matrix.length) throw new Error("RBAC matrix is empty");
  for (const row of matrix)
    if (!row.evidence?.length)
      throw new Error(
        `RBAC row missing evidence: ${row.role}/${row.permission}`,
      );
}

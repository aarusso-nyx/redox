import fs from "fs";
import path from "node:path";
import { execa } from "execa";

export async function buildGate(root: string, docsDir: string) {
  const errors: string[] = [];

  const ddlPath = path.join(root, "database.sql");
  if (fs.existsSync(ddlPath)) {
    try {
      await execa("psql", ["-q", "-f", ddlPath], { cwd: root });
    } catch (err: any) {
      errors.push(`DDL validation failed (psql): ${err?.shortMessage ?? err?.message ?? String(err)}`);
    }
  }

  const erdPath = path.join(docsDir, "diagrams", "erd.mmd");
  if (fs.existsSync(erdPath)) {
    const tmpOut = path.join(docsDir, "diagrams", ".erd-build.png");
    try {
      await execa("mmdc", ["-i", erdPath, "-o", tmpOut], { cwd: root });
    } catch (err: any) {
      errors.push(`ERD render failed (mmdc): ${err?.shortMessage ?? err?.message ?? String(err)}`);
    } finally {
      try {
        if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  if (errors.length) {
    throw new Error(`BuildGate failed:\n${errors.join("\n")}`);
  }
}

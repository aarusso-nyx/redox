import { execa } from "execa";
import fs from "fs";
export async function buildDDLFromMigrations(root=".") {
  // Placeholder: run migrations and dump schema if available
  if (fs.existsSync(`${root}/artisan`)) {
    await execa("php", ["artisan", "migrate", "--force"], { cwd: root });
  }
  // If Postgres available, dump
  try {
    const { stdout } = await execa("pg_dump", ["--schema-only", process.env.PGDATABASE ?? ""], { cwd: root });
    fs.writeFileSync("database.sql", stdout);
  } catch { /* ignore in scaffold */ }
}

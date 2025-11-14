import fs from "fs-extra";
import path from "node:path";
import { execa } from "execa";
import type { DbModel } from "../extractors/db.js";

export function renderDatabaseMd(model: DbModel, provenance: string[]): string {
  const lines: string[] = [];
  lines.push("# Database Reference");
  lines.push("");
  const schemaCount = new Set(model.tables.map((t) => t.schema)).size;
  lines.push(`**Schemas**: ${schemaCount}  `);
  lines.push(`**Tables**: ${model.tables.length}`);
  lines.push("");

  for (const t of model.tables.sort((a, b) => (a.schema + a.name).localeCompare(b.schema + b.name))) {
    lines.push(`## ${t.schema}.${t.name}`);
    lines.push("");
    if (!t.columns.length) {
      lines.push("_Columns unknown (no live DB columns found)._");
      lines.push("");
      continue;
    }
    lines.push("| Column | Type | Nullable | Default |");
    lines.push("|---|---|:---:|---|");
    for (const c of t.columns) {
      lines.push(
        `| \`${c.name}\` | \`${c.type}\` | ${c.nullable ? "Yes" : "No"} | ${
          c.default ? `\`${c.default}\`` : ""
        } |`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(`_Provenance: ${provenance.join(", ")}_`);
  return lines.join("\n");
}

export function buildMermaidFromModel(model: DbModel): string {
  const lines: string[] = ["erDiagram"];
  for (const t of model.tables) {
    const name = `${t.schema}_${t.name}`.replace(/[^\w]/g, "_");
    lines.push(`  ${name} {`);
    for (const c of t.columns) {
      lines.push(`    ${c.type.replace(/\s+/g, "_")} ${c.name}`);
    }
    lines.push("  }");
  }
  for (const fk of model.fks) {
    const from = `${fk.from.schema}_${fk.from.table}`.replace(/[^\w]/g, "_");
    const to = `${fk.to.schema}_${fk.to.table}`.replace(/[^\w]/g, "_");
    lines.push(`  ${from} }o--|| ${to} : "FK"`);
  }
  return lines.join("\n");
}

export function renderErdNarrative(model: DbModel, paths: { mmd: string; img: string }): string {
  const out: string[] = [];
  out.push("# Entity–Relationship Diagram");
  out.push("");
  out.push(`- Mermaid source: [${paths.mmd}](${paths.mmd})`);
  out.push(`- Rendered diagram: ![](${paths.img})`);
  out.push("");
  out.push("## Relationship Catalog");
  if (!model.fks.length) out.push("_No foreign keys detected._");
  for (const fk of model.fks) {
    out.push(
      `- **${fk.from.schema}.${fk.from.table}(${fk.from.columns.join(", ")}) → ` +
        `${fk.to.schema}.${fk.to.table}(${fk.to.columns.join(", ")})** — ` +
        `Cardinality **N:1**, ON DELETE **${fk.onDelete ?? "NO ACTION"}**, ON UPDATE **${
          fk.onUpdate ?? "NO ACTION"
        }**.`,
    );
  }
  out.push("");
  out.push("---");
  out.push("_Generated from live PostgreSQL catalogs; see `database.sql` for authoritative DDL._");
  return out.join("\n");
}

export async function writeDbAndErdDocs(root: string, docsDir: string, model: DbModel) {
  const diagramsDir = path.join(docsDir, "diagrams");
  const scriptsDir = path.join(docsDir, "scripts");
  await fs.ensureDir(docsDir);
  await fs.ensureDir(diagramsDir);
  await fs.ensureDir(scriptsDir);

  const dbMd = renderDatabaseMd(model, ["PostgreSQL catalogs"]);
  await fs.writeFile(path.join(docsDir, "Database Reference.md"), dbMd, "utf8");

  const mmdPath = path.join(diagramsDir, "erd.mmd");
  const pngPath = path.join(docsDir, "erd.png");
  const mmd = buildMermaidFromModel(model);
  await fs.writeFile(mmdPath, mmd, "utf8");

  const renderScriptPath = path.join(scriptsDir, "render-mermaid.sh");
  await fs.writeFile(
    renderScriptPath,
    `#!/usr/bin/env bash
set -euo pipefail
mmdc -i "${path.relative(root, mmdPath)}" -o "${path.relative(root, pngPath)}"
echo "Rendered ${path.relative(root, pngPath)}"
`,
    { mode: 0o755 },
  );

  try {
    await execa("bash", [renderScriptPath], { stdio: "inherit", cwd: root });
  } catch {
    // Mermaid CLI or Chromium missing; rendering is best-effort
  }

  const erdMd = renderErdNarrative(model, {
    mmd: path.relative(root, mmdPath),
    img: path.relative(root, pngPath),
  });
  await fs.writeFile(path.join(docsDir, "ERD.md"), erdMd, "utf8");
}


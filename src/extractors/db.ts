import { execa } from "execa";
import fs from "fs-extra";
import path from "node:path";
import fg from "fast-glob";
import dotenv from "dotenv";
import { sha256 } from "../core/evidence.js";

export type DbModel = {
  tables: {
    schema: string;
    name: string;
    columns: {
      name: string;
      type: string;
      nullable: boolean;
      default?: string;
      evidence?: EvidenceRef[];
    }[];
    evidence?: EvidenceRef[];
  }[];
  fks: {
    from: { schema: string; table: string; columns: string[] };
    to: { schema: string; table: string; columns: string[] };
    onDelete?: string;
    onUpdate?: string;
  }[];
  indexes: {
    schema: string;
    table: string;
    name: string;
    columns: string[];
    unique: boolean;
    primary: boolean;
  }[];
  sqlDump?: string;
  dialect?: "postgres" | "mysql" | "sqlite" | "unknown";
  source?: "catalog" | "migrations" | "unknown";
};

type EvidenceRef = {
  path: string;
  startLine: number;
  endLine: number;
  sha256?: string;
};

const actionMap: Record<string, string> = {
  a: "NO ACTION",
  c: "CASCADE",
  d: "SET DEFAULT",
  n: "SET NULL",
  r: "RESTRICT",
};

export function hydrateEnvFromFile(root = "."): string[] {
  const envPath = path.join(root, ".env");
  const hydrated: string[] = [];
  try {
    const raw = fs.readFileSync(envPath, "utf8");
    const parsed = dotenv.parse(raw);
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
        hydrated.push(key);
      }
    }
  } catch {
    // no .env found; ignore
  }
  return hydrated;
}

function detectDialect(url?: string, driver?: string) {
  const lowered = `${url ?? ""} ${driver ?? ""}`.toLowerCase();
  if (lowered.includes("postgres") || lowered.includes("pgsql"))
    return "postgres";
  if (lowered.includes("mysql")) return "mysql";
  if (lowered.includes("sqlite")) return "sqlite";
  return "unknown";
}

function buildPgUrlFromEnv(env: Record<string, string | undefined>) {
  const db =
    env.DATABASE_URL ??
    env.PGURL ??
    (env.DB_CONNECTION?.startsWith("pgsql") || env.DB_CONNECTION === "postgres"
      ? `postgresql://${env.DB_USER ?? env.PGUSER ?? "postgres"}:${env.DB_PASSWORD ?? env.PGPASSWORD ?? ""}@${
          env.DB_HOST ?? env.PGHOST ?? "localhost"
        }:${env.DB_PORT ?? env.PGPORT ?? "5432"}/${env.DB_DATABASE ?? env.PGDATABASE ?? ""}`
      : undefined);
  return db;
}

export async function connectByEnv(
  root = ".",
): Promise<{ client: any; hydrated: string[] }> {
  const hydrated = hydrateEnvFromFile(root);
  const url = buildPgUrlFromEnv(process.env);
  const dialect = detectDialect(url, process.env.DB_CONNECTION);
  if (dialect && dialect !== "postgres") {
    throw new Error(
      `Unsupported dialect for catalog introspection: ${dialect}`,
    );
  }
  if (!url) throw new Error("DATABASE_URL not set");
  const { Client } = await import("pg");
  const client = new Client({ connectionString: url });
  await client.connect();
  if (process.env.DB_DATABASE && !process.env.PGDATABASE) {
    process.env.PGDATABASE = process.env.DB_DATABASE;
  }
  return { client, hydrated };
}

export async function introspect(client: any): Promise<DbModel> {
  const tables = await client.query(`
    SELECT n.nspname AS schema, c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY 1,2;
  `);

  const cols = await client.query(`
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
           NOT a.attnotnull AS nullable,
           pg_get_expr(d.adbin, d.adrelid) AS default
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid=c.oid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p')
      AND n.nspname NOT IN ('pg_catalog','information_schema')
    ORDER BY 1,2,a.attnum;
  `);

  const idx = await client.query(`
    SELECT n.nspname AS schema, c.relname AS table, i.relname AS index_name,
           ix.indisprimary AS primary, ix.indisunique AS unique,
           array_agg(a.attname ORDER BY k.ord) AS columns
    FROM pg_index ix
    JOIN pg_class i ON i.oid=ix.indexrelid
    JOIN pg_class c ON c.oid=ix.indrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
    WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    GROUP BY 1,2,3,4,5
    ORDER BY 1,2,3;
  `);

  const fks = await client.query(`
    SELECT n1.nspname AS schema_from, c1.relname AS table_from, con.conname,
           array_agg(a1.attname ORDER BY u.ord) AS cols_from,
           n2.nspname AS schema_to, c2.relname AS table_to,
           array_agg(a2.attname ORDER BY f.ord) AS cols_to,
           con.confdeltype, con.confupdtype
    FROM pg_constraint con
    JOIN pg_class c1 ON c1.oid=con.conrelid
    JOIN pg_namespace n1 ON n1.oid=c1.relnamespace
    JOIN pg_class c2 ON c2.oid=con.confrelid
    JOIN pg_namespace n2 ON n2.oid=c2.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY u(attnum, ord) ON true
    JOIN pg_attribute a1 ON a1.attrelid=c1.oid AND a1.attnum=u.attnum
    JOIN unnest(con.confkey) WITH ORDINALITY f(attnum, ord) ON true
    JOIN pg_attribute a2 ON a2.attrelid=c2.oid AND a2.attnum=f.attnum
    WHERE con.contype='f'
    GROUP BY 1,2,3,5,6,8,9
    ORDER BY 1,2,3;
  `);

  const tableMap = new Map<
    string,
    { schema: string; name: string; columns: any[] }
  >();
  for (const t of tables.rows)
    tableMap.set(`${t.schema}.${t.name}`, {
      schema: t.schema,
      name: t.name,
      columns: [],
    });

  for (const c of cols.rows) {
    const key = `${c.schema}.${c.table}`;
    const t = tableMap.get(key);
    if (t)
      t.columns.push({
        name: c.column,
        type: c.type,
        nullable: c.nullable,
        default: c.default ?? undefined,
      });
  }

  const fkList = fks.rows.map((r: any) => ({
    from: { schema: r.schema_from, table: r.table_from, columns: r.cols_from },
    to: { schema: r.schema_to, table: r.table_to, columns: r.cols_to },
    onDelete: actionMap[r.confdeltype] ?? "NO ACTION",
    onUpdate: actionMap[r.confupdtype] ?? "NO ACTION",
  }));

  const idxList = idx.rows.map((r: any) => ({
    schema: r.schema,
    table: r.table,
    name: r.index_name,
    columns: r.columns,
    unique: r.unique,
    primary: r.primary,
  }));

  return {
    tables: [...tableMap.values()],
    fks: fkList,
    indexes: idxList,
    dialect: "postgres",
    source: "catalog",
  };
}

function mapLaravelColumnType(method: string) {
  const map: Record<string, string> = {
    string: "varchar",
    varchar: "varchar",
    text: "text",
    integer: "integer",
    bigInteger: "bigint",
    unsignedBigInteger: "bigint",
    uuid: "uuid",
    boolean: "boolean",
    dateTime: "timestamp",
    timestamp: "timestamp",
    json: "json",
    jsonb: "jsonb",
    decimal: "decimal",
    float: "float",
  };
  return map[method] ?? method;
}

function lineNumberOf(text: string, index: number) {
  return text.slice(0, index).split(/\r?\n/).length;
}

async function modelFromLaravelMigrations(root = "."): Promise<DbModel | null> {
  const files = await fg("database/migrations/*.php", { cwd: root });
  if (!files.length) return null;

  const tables: DbModel["tables"] = [];
  for (const rel of files) {
    const f = rel;
    const fullPath = path.join(root, f);
    const content = await fs.readFile(fullPath, "utf8");
    const fileHash = sha256(content);

    const createRe =
      /Schema::create\(\s*['"]([^'"]+)['"][^,]*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\)\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(content))) {
      const [, tableName, body] = m;
      const startLine = lineNumberOf(content, m.index);
      const cols: DbModel["tables"][number]["columns"] = [];
      const colRe =
        /\$table->([A-Za-z_][A-Za-z0-9_]*)\(\s*['"]([^'"]+)['"][^)]*\)([^;]*);/g;
      let cm: RegExpExecArray | null;
      while ((cm = colRe.exec(body))) {
        const method = cm[1];
        const colName = cm[2];
        const tail = cm[3] ?? "";
        const nullable = /nullable/i.test(tail);
        const colStart = lineNumberOf(content, m.index + cm.index);
        cols.push({
          name: colName,
          type: mapLaravelColumnType(method),
          nullable,
          evidence: [
            {
              path: f,
              startLine: colStart,
              endLine: colStart,
              sha256: fileHash,
            },
          ],
        });
      }

      tables.push({
        schema: "public",
        name: tableName,
        columns: cols,
        evidence: [
          {
            path: f,
            startLine,
            endLine: startLine,
            sha256: fileHash,
          },
        ],
      });
    }
  }

  if (!tables.length) return null;

  return {
    tables,
    fks: [],
    indexes: [],
    dialect: detectDialect(process.env.DB_CONNECTION ?? ""),
    source: "migrations",
  };
}

export async function buildDDLFromMigrations(root = ".", outDir = ".") {
  hydrateEnvFromFile(root);
  // Run Laravel migrations if a Laravel app is present
  if (await fs.pathExists(`${root}/artisan`)) {
    try {
      await execa("php", ["artisan", "migrate", "--force"], { cwd: root });
    } catch {
      // ignore migration errors in generic engine; DB introspection may still work
    }
  }

  // If Postgres is available, dump schema
  try {
    const dbName = process.env.PGDATABASE ?? process.env.DB_DATABASE ?? "";
    const { stdout } = await execa("pg_dump", ["--schema-only", dbName], {
      cwd: root,
    });
    const ddlPath = outDir ? `${outDir}/database.sql` : "database.sql";
    await fs.writeFile(ddlPath, stdout, "utf8");
  } catch {
    // pg_dump not available or failed; caller can proceed with DbModel only
  }
}

export async function buildDbModelFallback(root = ".") {
  const laravel = await modelFromLaravelMigrations(root);
  if (laravel) return laravel;
  return {
    tables: [],
    fks: [],
    indexes: [],
    dialect: detectDialect(process.env.DB_CONNECTION ?? ""),
    source: "unknown",
  } satisfies DbModel;
}

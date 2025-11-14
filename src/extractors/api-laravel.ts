import { execa } from "execa";
import fs from "fs-extra";
import fg from "fast-glob";

export type LaravelRoute = {
  method: string;
  uri: string;
  name?: string;
  action?: string;
  middleware?: string[];
  file?: string;
};

export async function laravelRoutesViaArtisan(
  root = ".",
): Promise<LaravelRoute[] | null> {
  try {
    const { stdout } = await execa("php", ["artisan", "route:list", "--json"], {
      cwd: root,
    });
    const parsed = JSON.parse(stdout) as any[];
    return parsed.map((r) => ({
      method: r.method,
      uri: r.uri,
      name: r.name,
      action: r.action,
      middleware: Array.isArray(r.middleware) ? r.middleware : [],
    }));
  } catch {
    return null;
  }
}

export async function laravelRoutesFallback(
  root = ".",
): Promise<LaravelRoute[]> {
  const files = await fg(["routes/*.php"], { cwd: root, dot: false });
  const routes: LaravelRoute[] = [];
  for (const rel of files) {
    const f = rel;
    const txt = await fs.readFile(f, "utf8");
    const re = /Route::(get|post|put|patch|delete)\(['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt))) {
      routes.push({ method: m[1].toUpperCase(), uri: m[2], file: f });
    }
  }
  return routes;
}

export async function laravelRoutes(root = "."): Promise<LaravelRoute[]> {
  const viaArtisan = await laravelRoutesViaArtisan(root);
  if (viaArtisan) return viaArtisan;
  return laravelRoutesFallback(root);
}

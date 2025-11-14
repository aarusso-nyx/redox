import fg from "fast-glob";
import fs from "node:fs/promises";

export type FrontendMode = "blade" | "react" | "angular" | "mixed" | "unknown";

export async function detectFrontend(root = "."): Promise<FrontendMode> {
  const blade = (await fg("resources/views/**/*.blade.php", { cwd: root })).length > 0;
  const reactFiles = await fg(["resources/js/**/*.{tsx,jsx,ts,js}"], { cwd: root });
  let react = reactFiles.length > 0;
  try {
    const pkgRaw = await fs.readFile(`${root}/package.json`, "utf8");
    const pkg = JSON.parse(pkgRaw) as any;
    react ||= !!(pkg.dependencies?.react || pkg.devDependencies?.react);
  } catch {
    // ignore missing package.json
  }

  const angularFiles = await fg(["src/**/*.routing.{ts,tsx}", "src/app/**/*.module.ts"], { cwd: root });
  const angular = angularFiles.length > 0;

  const modes = [blade && "blade", react && "react", angular && "angular"].filter(Boolean) as string[];
  if (modes.length === 0) return "unknown";
  if (modes.length === 1) return modes[0] as FrontendMode;
  return "mixed";
}


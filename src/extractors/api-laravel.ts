import { execa } from "execa";
export async function laravelRoutes(root=".") {
  try {
    const { stdout } = await execa("php", ["artisan", "route:list", "--json"], { cwd: root });
    return JSON.parse(stdout);
  } catch { return []; }
}

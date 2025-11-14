import fg from "fast-glob";
import fs from "fs-extra";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";

export type ReactRoute = {
  file: string;
  path: string;
  element: string | null;
};

export async function extractReactRoutes(root = ".") {
  const files = await fg(["resources/js/**/*.{tsx,jsx,ts,js}"], { cwd: root, dot: false });
  const routes: ReactRoute[] = [];

  for (const rel of files) {
    const f = rel;
    const src = await fs.readFile(f, "utf8");
    let ast: any;
    try {
      ast = parser.parse(src, { sourceType: "module", plugins: ["jsx", "typescript"] });
    } catch {
      continue;
    }

    traverse(ast, {
      JSXOpeningElement(path: any) {
        const name = path.node.name?.name;
        if (name === "Route") {
          const attrs = Object.fromEntries(
            path.node.attributes
              .filter((a: any) => a.type === "JSXAttribute" && a.name?.name)
              .map((a: any) => [a.name.name, a.value?.value ?? a.value?.expression?.value]),
          );
          if (attrs.path) {
            routes.push({
              file: f,
              path: String(attrs.path),
              element: attrs.element ? String(attrs.element) : null,
            });
          }
        }
      },
    });
  }

  return { routes };
}


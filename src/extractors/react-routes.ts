import fg from "fast-glob";
import fs from "fs-extra";
import * as parser from "@babel/parser";
import traverse from "@babel/traverse";
import path from "node:path";

export type ReactRoute = {
  file: string;
  path: string;
  element: string | null;
  parentId?: string;
  id?: string;
  line?: number;
};

export async function extractReactRoutes(root = ".") {
  const files = await fg(["resources/js/**/*.{tsx,jsx,ts,js}"], {
    cwd: root,
    dot: false,
  });
  const routes: ReactRoute[] = [];
  let idx = 0;

  const addRoute = (route: ReactRoute) => {
    const id = route.id ?? `react:${route.path ?? idx}`;
    routes.push({ ...route, id });
    idx += 1;
  };

  function readObjectRoutes(file: string, obj: any, parentId?: string): void {
    if (!obj || obj.type !== "ObjectExpression") return;
    const props: Record<string, any> = {};
    for (const prop of obj.properties ?? []) {
      if (prop.type !== "ObjectProperty" || !prop.key) continue;
      const key =
        prop.key.type === "Identifier"
          ? prop.key.name
          : prop.key.type === "StringLiteral"
            ? prop.key.value
            : undefined;
      if (!key) continue;
      props[key] = prop.value;
    }
    const pathVal = props.path;
    const elementVal = props.element;
    const childrenVal = props.children;
    const path =
      pathVal && pathVal.type === "StringLiteral"
        ? String(pathVal.value)
        : pathVal && pathVal.type === "TemplateLiteral"
          ? pathVal.quasis.map((q: any) => q.value.raw).join("")
          : undefined;
    const element =
      elementVal && elementVal.type === "JSXElement"
        ? (elementVal.openingElement.name?.name ?? null)
        : elementVal && elementVal.type === "Identifier"
          ? elementVal.name
          : elementVal && elementVal.type === "CallExpression"
            ? (elementVal.callee?.name ?? null)
            : null;
    const locLine = obj.loc?.start?.line;
    const localId =
      obj.properties?.find(
        (p: any) => p.type === "ObjectProperty" && p.key.name === "id",
      )?.value?.value ?? undefined;
    const id = localId ? `react:${localId}` : undefined;

    addRoute({
      id,
      file,
      path: path ?? "/",
      element,
      parentId,
      line: locLine,
    });

    if (childrenVal && childrenVal.type === "ArrayExpression") {
      const parent =
        id ??
        `react:${path ?? `${file}:${obj.loc?.start?.line ?? childrenVal.start}`}`;
      for (const child of childrenVal.elements ?? []) {
        if (child && child.type === "ObjectExpression") {
          readObjectRoutes(file, child, parent);
        }
      }
    }
  }

  for (const rel of files) {
    const f = rel;
    const abs = path.join(root, rel);
    const src = await fs.readFile(abs, "utf8");
    let ast: any;
    try {
      ast = parser.parse(src, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
        errorRecovery: true,
        sourceFilename: f,
        allowReturnOutsideFunction: true,
      });
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
              .map((a: any) => [
                a.name.name,
                a.value?.value ?? a.value?.expression?.value,
              ]),
          );
          if (attrs.path) {
            addRoute({
              file: f,
              path: String(attrs.path),
              element: attrs.element ? String(attrs.element) : null,
              line: path.node.loc?.start?.line,
              parentId: attrs.parentId ? String(attrs.parentId) : undefined,
            });
          }
        }
      },
      CallExpression(path: any) {
        const callee = path.node.callee;
        const calleeName =
          callee?.name ??
          (callee?.property && callee.property.type === "Identifier"
            ? callee.property.name
            : undefined);
        if (
          calleeName === "createBrowserRouter" ||
          calleeName === "createRoutesFromElements" ||
          calleeName === "useRoutes"
        ) {
          const args = path.node.arguments ?? [];
          for (const arg of args) {
            if (arg.type === "ArrayExpression") {
              for (const el of arg.elements ?? []) {
                if (el && el.type === "ObjectExpression") {
                  readObjectRoutes(f, el, undefined);
                }
              }
            }
          }
        }
      },
    });
  }

  return { routes };
}

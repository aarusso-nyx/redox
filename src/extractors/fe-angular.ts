import { Project, SyntaxKind } from "ts-morph";

export type AngularRoute = {
  id?: string;
  file: string;
  path: string;
  component?: string | null;
  redirectTo?: string | null;
  pathMatch?: string | null;
  parentId?: string;
  guards?: string[];
  resolvers?: string[];
  dataKeys?: string[];
  lazy?: boolean;
  line?: number;
};

function extractRoutesFromArrayLiteral(
  filePath: string,
  arrayExpr: import("ts-morph").ArrayLiteralExpression,
  parentId?: string,
): AngularRoute[] {
  const routes: AngularRoute[] = [];

  for (const el of arrayExpr.getElements()) {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const obj = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

    const pathProp = obj.getProperty("path");
    if (!pathProp || !pathProp.isKind(SyntaxKind.PropertyAssignment)) continue;

    const initializer = pathProp.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.StringLiteral)
      continue;
    const pathText = initializer.getText().slice(1, -1);

    const route: AngularRoute = {
      file: filePath,
      path: pathText,
      parentId,
      id: `${filePath}:${pathText || obj.getStartLineNumber()}`,
      line: obj.getStartLineNumber(),
    };

    const componentProp = obj.getProperty("component");
    if (componentProp && componentProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = componentProp.getInitializer();
      route.component = init ? init.getText() : null;
    }

    const redirectProp = obj.getProperty("redirectTo");
    if (redirectProp && redirectProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = redirectProp.getInitializer();
      route.redirectTo =
        init && init.getKind() === SyntaxKind.StringLiteral
          ? init.getText().slice(1, -1)
          : null;
    }

    const pathMatchProp = obj.getProperty("pathMatch");
    if (pathMatchProp && pathMatchProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = pathMatchProp.getInitializer();
      route.pathMatch =
        init && init.getKind() === SyntaxKind.StringLiteral
          ? init.getText().slice(1, -1)
          : null;
    }

    const guardProp = obj.getProperty("canActivate");
    if (guardProp && guardProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = guardProp.getInitializer();
      if (init && init.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
        route.guards = arr
          .getElements()
          .map((e) => e.getText().trim())
          .filter(Boolean);
      }
    }

    const resolverProp = obj.getProperty("resolve");
    if (resolverProp && resolverProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = resolverProp.getInitializer();
      if (init && init.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const objInit = init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        route.resolvers = objInit
          .getProperties()
          .map(
            (p) =>
              (p as any).getName?.() ??
              (p as any).getText?.() ??
              p.getFirstChildByKind?.(SyntaxKind.Identifier)?.getText?.() ??
              "",
          )
          .filter(Boolean);
      }
    }

    const dataProp = obj.getProperty("data");
    if (dataProp && dataProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = dataProp.getInitializer();
      if (init && init.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const objInit = init.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
        route.dataKeys = objInit
          .getProperties()
          .map(
            (p) =>
              (p as any).getName?.() ??
              (p as any).getText?.() ??
              p.getFirstChildByKind?.(SyntaxKind.Identifier)?.getText?.() ??
              "",
          )
          .filter(Boolean);
      }
    }

    const loadChildrenProp = obj.getProperty("loadChildren");
    if (
      loadChildrenProp &&
      loadChildrenProp.isKind(SyntaxKind.PropertyAssignment)
    ) {
      route.lazy = true;
    }

    routes.push(route);

    const childrenProp = obj.getProperty("children");
    if (childrenProp && childrenProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = childrenProp.getInitializer();
      if (init && init.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
        routes.push(...extractRoutesFromArrayLiteral(filePath, arr, route.id));
      }
    }
  }

  return routes;
}

export function angularRoutes(root = "."): AngularRoute[] {
  let project: Project;
  try {
    project = new Project({
      tsConfigFilePath: `${root}/tsconfig.json`,
      skipFileDependencyResolution: true,
    });
  } catch {
    // If there's no tsconfig or ts-morph can't initialize, assume no Angular routes.
    return [];
  }

  const routes: AngularRoute[] = [];

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    const fileName = sf.getBaseName();
    if (!/(routing\.module\.ts|routes\.ts)$/i.test(fileName)) continue;

    for (const v of sf.getVariableDeclarations()) {
      const init = v.getInitializer();
      if (init && init.getKind() === SyntaxKind.ArrayLiteralExpression) {
        const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
        routes.push(...extractRoutesFromArrayLiteral(filePath, arr));
      }
    }

    sf.forEachChild((node) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return;
      const call = node.asKindOrThrow(SyntaxKind.CallExpression);
      const expressionText = call.getExpression().getText();
      if (!/RouterModule\.for(Root|Child)/.test(expressionText)) return;
      const args = call.getArguments();
      for (const arg of args) {
        if (arg.getKind() === SyntaxKind.ArrayLiteralExpression) {
          const arr = arg.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
          routes.push(...extractRoutesFromArrayLiteral(filePath, arr));
        }
      }
    });
  }

  return routes;
}

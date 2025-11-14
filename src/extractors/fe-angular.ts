import { Project, SyntaxKind } from "ts-morph";

export type AngularRoute = {
  file: string;
  path: string;
  component?: string | null;
  redirectTo?: string | null;
  pathMatch?: string | null;
};

function extractRoutesFromArrayLiteral(
  filePath: string,
  arrayExpr: import("ts-morph").ArrayLiteralExpression,
): AngularRoute[] {
  const routes: AngularRoute[] = [];

  for (const el of arrayExpr.getElements()) {
    if (el.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
    const obj = el.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);

    const pathProp = obj.getProperty("path");
    if (!pathProp || !pathProp.isKind(SyntaxKind.PropertyAssignment)) continue;

    const initializer = pathProp.getInitializer();
    if (!initializer || initializer.getKind() !== SyntaxKind.StringLiteral) continue;
    const pathText = initializer.getText().slice(1, -1);

    const route: AngularRoute = { file: filePath, path: pathText };

    const componentProp = obj.getProperty("component");
    if (componentProp && componentProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = componentProp.getInitializer();
      route.component = init ? init.getText() : null;
    }

    const redirectProp = obj.getProperty("redirectTo");
    if (redirectProp && redirectProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = redirectProp.getInitializer();
      route.redirectTo = init && init.getKind() === SyntaxKind.StringLiteral ? init.getText().slice(1, -1) : null;
    }

    const pathMatchProp = obj.getProperty("pathMatch");
    if (pathMatchProp && pathMatchProp.isKind(SyntaxKind.PropertyAssignment)) {
      const init = pathMatchProp.getInitializer();
      route.pathMatch = init && init.getKind() === SyntaxKind.StringLiteral ? init.getText().slice(1, -1) : null;
    }

    routes.push(route);
  }

  return routes;
}

export function angularRoutes(root = "."): AngularRoute[] {
  const project = new Project({
    tsConfigFilePath: `${root}/tsconfig.json`,
    skipFileDependencyResolution: true,
  });

  const routes: AngularRoute[] = [];

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    const fileName = sf.getBaseName();
    if (!/(routing\.module\.ts|routes\.ts)$/i.test(fileName)) continue;

    for (const v of sf.getVariableDeclarations()) {
      const init = v.getInitializer();
      if (!init || init.getKind() !== SyntaxKind.ArrayLiteralExpression) continue;
      const arr = init.asKindOrThrow(SyntaxKind.ArrayLiteralExpression);
      routes.push(...extractRoutesFromArrayLiteral(filePath, arr));
    }
  }

  return routes;
}

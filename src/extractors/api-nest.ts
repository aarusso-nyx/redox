import { Project, SyntaxKind } from "ts-morph";

export type NestRoute = {
  file: string;
  controller: string;
  basePath: string;
  methodName: string;
  httpMethod: string;
  path: string;
};

const NEST_HTTP_DECORATORS: Record<string, string> = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
  Options: "OPTIONS",
  Head: "HEAD",
  All: "ALL",
};

export function nestControllers(root = "."): NestRoute[] {
  const project = new Project({
    tsConfigFilePath: `${root}/tsconfig.json`,
    skipFileDependencyResolution: true,
  });

  const routes: NestRoute[] = [];

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    for (const cls of sf.getClasses()) {
      const controllerDec = cls.getDecorator("Controller");
      if (!controllerDec) continue;

      let basePath = "/";
      const args = controllerDec.getArguments();
      if (args.length > 0) {
        const text = args[0].getText();
        if (text && args[0].getKind() === SyntaxKind.StringLiteral) {
          basePath = text.slice(1, -1);
        }
      }

      for (const method of cls.getMethods()) {
        for (const dec of method.getDecorators()) {
          const decName = dec.getName();
          const httpMethod = NEST_HTTP_DECORATORS[decName];
          if (!httpMethod) continue;

          let path = "";
          const dArgs = dec.getArguments();
          if (
            dArgs.length > 0 &&
            dArgs[0].getKind() === SyntaxKind.StringLiteral
          ) {
            const txt = dArgs[0].getText();
            path = txt.slice(1, -1);
          }

          routes.push({
            file: filePath,
            controller: cls.getName() ?? "AnonymousController",
            basePath,
            methodName: method.getName(),
            httpMethod,
            path,
          });
        }
      }
    }
  }

  return routes;
}

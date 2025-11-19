import { Project, SyntaxKind } from "ts-morph";

export type NestRoute = {
  file: string;
  controller: string;
  basePath: string;
  methodName: string;
  httpMethod: string;
  path: string;
  startLine?: number;
  endLine?: number;
  guards?: string[];
  params?: { name: string; in: "path" | "query" | "body" | "header" }[];
  statusCode?: number;
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

          const guards =
            method
              .getDecorators()
              .filter((d) => d.getName() === "UseGuards")
              .flatMap((d) =>
                d
                  .getArguments()
                  .map((a) => a.getText().replace(/[\s`'"]+/g, "")),
              ) ?? [];

          const params = method
            .getParameters()
            .map((p) => {
              const decorators = p.getDecorators();
              for (const pd of decorators) {
                const name = pd.getName();
                const arg = pd
                  .getArguments()[0]
                  ?.getText()
                  ?.replace(/['"]/g, "");
                if (name === "Param")
                  return { name: arg ?? p.getName(), in: "path" as const };
                if (name === "Query")
                  return { name: arg ?? p.getName(), in: "query" as const };
                if (name === "Body")
                  return { name: arg ?? p.getName(), in: "body" as const };
                if (name === "Headers" || name === "Header")
                  return { name: arg ?? p.getName(), in: "header" as const };
              }
              return null;
            })
            .filter(Boolean) as {
            name: string;
            in: "path" | "query" | "body" | "header";
          }[];

          const statusDecorator = method.getDecorator("HttpCode");
          const statusCodeArg = statusDecorator?.getArguments()?.[0];
          const statusCode =
            statusCodeArg &&
            statusCodeArg.getKind() === SyntaxKind.NumericLiteral
              ? Number(statusCodeArg.getText())
              : undefined;

          routes.push({
            file: filePath,
            controller: cls.getName() ?? "AnonymousController",
            basePath,
            methodName: method.getName(),
            httpMethod,
            path,
            startLine: method.getStartLineNumber(),
            endLine: method.getEndLineNumber(),
            guards,
            params,
            statusCode,
          });
        }
      }
    }
  }

  return routes;
}

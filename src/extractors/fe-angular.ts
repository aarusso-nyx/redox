import { Project } from "ts-morph";
export function angularRoutes(root=".") {
  const p = new Project({ tsConfigFilePath: `${root}/tsconfig.json`, skipFileDependencyResolution: true });
  return [];
}

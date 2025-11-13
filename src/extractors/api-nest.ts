import { Project } from "ts-morph";
export function nestControllers(root=".") {
  const project = new Project({ tsConfigFilePath: `${root}/tsconfig.json`, skipFileDependencyResolution: true });
  // In scaffold, we just return empty; implement later
  return [];
}

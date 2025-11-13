import fg from "fast-glob";
import fs from "fs";
export async function scanRepo(root = ".") {
  const files = await fg(["**/*"], { cwd: root, dot: true, ignore:["node_modules/**","dist/**"] });
  const profile = {
    hasNode: fs.existsSync(`${root}/package.json`),
    hasPHP: fs.existsSync(`${root}/composer.json`),
    frameworks: {}
  };
  return { files, profile };
}

import fg from "fast-glob";
import fs from "node:fs";

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.promises.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function scanRepo(root = ".") {
  const files = await fg(["**/*"], {
    cwd: root,
    dot: true,
    ignore: ["node_modules/**", "dist/**"],
  });
  const [hasNode, hasPHP] = await Promise.all([
    fileExists(`${root}/package.json`),
    fileExists(`${root}/composer.json`),
  ]);
  const profile = {
    hasNode,
    hasPHP,
    frameworks: {},
  };
  return { files, profile };
}

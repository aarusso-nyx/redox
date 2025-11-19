import fg from "fast-glob";
import fs from "fs-extra";
import path from "node:path";

export type ExistingDoc = {
  path: string;
  kind: string;
  size: number;
  preview?: string;
};

export async function extractExistingDocs(root = "."): Promise<{
  docs: ExistingDoc[];
}> {
  const patterns = ["**/*.{md,txt,doc,docx,pdf}"];
  const ignore = ["node_modules/**", "dist/**", ".git/**", "redox/facts/**"];
  const files = await fg(patterns, { cwd: root, dot: false, ignore });
  const docs: ExistingDoc[] = [];

  for (const rel of files) {
    const full = path.join(root, rel);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    const ext = path.extname(rel).toLowerCase().replace(/^\./, "");
    const kind = ext || "unknown";

    let preview: string | undefined;
    if (["md", "txt"].includes(ext)) {
      try {
        const content = await fs.readFile(full, "utf8");
        preview = content.slice(0, 500);
      } catch {
        // binary or unreadable; skip preview
      }
    }

    docs.push({
      path: rel,
      kind,
      size: stat.size,
      preview,
    });
  }

  return { docs };
}

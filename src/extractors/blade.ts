import fs from "fs-extra";
import fg from "fast-glob";

type BladeView = {
  name: string;
  file: string;
  extends?: string;
  includes: string[];
};

type BladeForm = {
  view: string;
  method: string;
  action: string;
  file: string;
};

type BladeRelation = {
  view: string;
  route: string;
  file: string;
  line?: number;
};

export type BladeExtraction = {
  views: BladeView[];
  forms: BladeForm[];
  relations: BladeRelation[];
};

export async function extractBlade(root = "."): Promise<BladeExtraction> {
  const views = await fg("resources/views/**/*.blade.php", { cwd: root });
  const data: BladeExtraction = { views: [], forms: [], relations: [] };

  for (const rel of views) {
    const f = rel;
    const txt = await fs.readFile(f, "utf8");
    const name = f
      .replace(/^resources\/views\//, "")
      .replace(/\.blade\.php$/, "")
      .replace(/\//g, ".");
    data.views.push({
      name,
      file: f,
      extends: match1(txt, /@extends\(['"]([^'"]+)['"]\)/),
      includes: [...txt.matchAll(/@include\(['"]([^'"]+)['"]\)/g)].map(
        (m) => m[1],
      ),
    });

    for (const fm of txt.matchAll(
      /<form[^>]*method=["']?([A-Za-z]+)["']?[^>]*action=["']([^"']+)["'][^>]*>/g,
    )) {
      data.forms.push({
        view: name,
        method: fm[1].toUpperCase(),
        action: fm[2],
        file: f,
      });
    }
    for (const rm of txt.matchAll(/route\(['"]([^'"]+)['"]\)/g)) {
      const line = lineOf(txt, rm.index ?? 0);
      data.relations.push({ view: name, route: rm[1], file: f, line });
    }
  }
  return data;
}

function match1(s: string, re: RegExp) {
  const m = s.match(re);
  return m ? m[1] : undefined;
}

function lineOf(txt: string, idx: number) {
  return txt.slice(0, idx).split(/\r?\n/).length;
}

import fg from "fast-glob";
import fs from "fs-extra";
import path from "node:path";
import { askLLM } from "./llm.js";
import { loadPrompt } from "./promptLoader.js";
import type { EngineContext } from "./context.js";

export type TranslateOptions = {
  engine: EngineContext;
  lang: string;
  srcDir?: string;
  outDir?: string;
  include?: string;
  exclude?: string;
  dryRun?: boolean;
  debug?: boolean;
};

export async function translateDocs(opts: TranslateOptions) {
  const {
    engine,
    lang,
    srcDir = "docs",
    outDir,
    include = "*.md",
    exclude,
    dryRun = false,
    debug = false,
  } = opts;

  const root = engine.root;
  const absSrc = path.resolve(root, srcDir);
  const absOut = path.resolve(root, outDir ?? path.join(srcDir, lang));

  const patterns = [include];
  const ignore = exclude ? [exclude] : [];

  const files = await fg(patterns, {
    cwd: absSrc,
    dot: false,
    ignore,
  });

  if (!files.length) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[redox][translate] no files matched", { srcDir: absSrc, include, exclude });
    }
    return;
  }

  const promptText = await loadPrompt("translator.md");

  for (const rel of files) {
    const inPath = path.join(absSrc, rel);
    const outPath = path.join(absOut, rel);

    const src = await fs.readFile(inPath, "utf8");

    if (dryRun) {
      // eslint-disable-next-line no-console
      console.log("[redox][translate][dry-run]", { in: inPath, out: outPath, lang });
      continue;
    }

    const userPrompt = `${promptText}

Target language: ${lang}

<FILE>
${src}
</FILE>`;

    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[redox][debug] translate file", { in: inPath, out: outPath, lang });
    }

    const res = await askLLM(userPrompt, {
      model: process.env.REDOX_MODEL_TRANSLATOR ?? process.env.REDOX_MODEL_WRITER ?? "gpt-4.1-mini",
      temperature: 0.1,
      agent: `translator/${lang}`,
      stage: "translate",
      profile: undefined,
      meta: {
        file: path.relative(root, inPath),
        outFile: path.relative(root, outPath),
      },
    });

    const anyR: any = res as any;
    const text =
      anyR.output_text ?? anyR.output?.[0]?.content?.[0]?.text ?? JSON.stringify(anyR, null, 2);

    await fs.ensureDir(path.dirname(outPath));
    await fs.writeFile(outPath, text, "utf8");

    if (debug) {
      // eslint-disable-next-line no-console
      console.log("[redox][translate] wrote file", {
        in: inPath,
        out: outPath,
        length: text.length,
      });
    }
  }
}


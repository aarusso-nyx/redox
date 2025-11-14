import fg from "fast-glob";
import fs from "fs-extra";
import path from "node:path";
import MarkdownIt from "markdown-it";
import { execa } from "execa";
import type { EngineContext } from "./context.js";

type ExportFormat = "pdf" | "html" | "docx";

export type ExportOptions = {
  engine: EngineContext;
  formats?: string;
  srcDir?: string;
  outDir?: string;
  include?: string;
  exclude?: string;
  css?: string;
  referenceDoc?: string;
  dryRun?: boolean;
  debug?: boolean;
};

function parseFormats(formats?: string): ExportFormat[] {
  if (!formats || !formats.trim()) return ["pdf"];
  const parts = formats
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const out: ExportFormat[] = [];
  for (const p of parts) {
    if (p === "pdf" || p === "html" || p === "docx") out.push(p);
  }
  return out.length ? out : ["pdf"];
}

function buildHtml(markdown: string, title: string, cssHref?: string) {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
  const body = md.render(markdown);
  const cssLink = cssHref
    ? `  <link rel="stylesheet" href="${cssHref}">\n`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
${cssLink}</head>
<body>
${body}
</body>
</html>
`;
}

async function ensurePdfFromMarkdown(
  markdown: string,
  dest: string,
  cssPath: string | undefined,
) {
  const { mdToPdf } = await import("md-to-pdf");

  const options: any = {
    dest,
  };

  if (cssPath) {
    options.stylesheet = cssPath;
  }

  await mdToPdf({ content: markdown }, options);
}

export async function exportDocs(opts: ExportOptions) {
  const {
    engine,
    formats: formatsCsv,
    srcDir,
    outDir,
    include = "*.md",
    exclude,
    css,
    referenceDoc,
    dryRun = false,
    debug = false,
  } = opts;

  const root = engine.root;
  // Default convention: export from ./redox when --src is omitted.
  const effectiveSrcDir = srcDir ?? "redox";
  const formats = parseFormats(formatsCsv);
  const absSrc = path.resolve(root, effectiveSrcDir);
  const absOut = path.resolve(root, outDir ?? effectiveSrcDir);

  const patterns = [include];
  const ignore = exclude ? [exclude] : [];

  const files = await fg(patterns, {
    cwd: absSrc,
    dot: false,
    ignore,
  });

  if (!files.length) {
    if (debug) {
      console.log("[redox][export] no files matched", {
        srcDir: absSrc,
        include,
        exclude,
      });
    }
    return;
  }

  const absCss = css ? path.resolve(root, css) : undefined;

  for (const rel of files) {
    const inPath = path.join(absSrc, rel);
    const baseName = path.basename(rel, path.extname(rel));
    const outDirForFile = path.join(absOut, path.dirname(rel));

    const markdown = await fs.readFile(inPath, "utf8");

    if (dryRun) {
      console.log("[redox][export][dry-run]", {
        in: inPath,
        outDir: outDirForFile,
        formats,
      });
      continue;
    }

    await fs.ensureDir(outDirForFile);

    // Precompute HTML for HTML/PDF targets
    let html: string | null = null;

    if (formats.includes("html") || formats.includes("pdf")) {
      let cssHref: string | undefined;
      if (absCss) {
        cssHref = path.relative(outDirForFile, absCss);
      }
      html = buildHtml(markdown, baseName, cssHref);
    }

    for (const fmt of formats) {
      if (fmt === "html") {
        const outHtml = path.join(outDirForFile, `${baseName}.html`);
        if (debug) {
          console.log("[redox][export] write HTML", {
            in: inPath,
            out: outHtml,
          });
        }
        await fs.writeFile(outHtml, html ?? "", "utf8");
      } else if (fmt === "pdf") {
        const outPdf = path.join(outDirForFile, `${baseName}.pdf`);
        if (debug) {
          console.log("[redox][export] write PDF", { in: inPath, out: outPdf });
        }
        await ensurePdfFromMarkdown(markdown, outPdf, absCss);
      } else if (fmt === "docx") {
        const outDocx = path.join(outDirForFile, `${baseName}.docx`);
        const args = [inPath, "-o", outDocx];
        if (referenceDoc) {
          args.push("--reference-doc", path.resolve(root, referenceDoc));
        }
        if (debug) {
          console.log("[redox][export] pandoc docx", { cmd: "pandoc", args });
        }
        try {
          await execa("pandoc", args, { cwd: root });
        } catch (err: any) {
          console.error(
            "[redox][export] pandoc failed for docx",
            err?.shortMessage ?? err?.message ?? String(err),
          );
          throw err;
        }
      }
    }
  }
}

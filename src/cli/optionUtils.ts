export function resolveOutDir(opts: Record<string, any>): string | undefined {
  return opts.outDir ?? opts["out-dir"];
}


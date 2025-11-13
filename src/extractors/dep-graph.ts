import madge from "madge";
export async function tsDepGraph(entry: string) {
  const res = await madge(entry, { tsConfig: "./tsconfig.json" });
  return { graph: await res.obj() };
}

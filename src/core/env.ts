import { execa } from "execa";

type CheckResult = { name: string; pass: boolean; info?: string };

function pad(name: string, width: number) {
  return (name + " ".repeat(width)).slice(0, width);
}

function ok(pass: boolean) {
  return pass ? "✓" : "✗";
}

async function hasCmd(cmd: string) {
  try {
    await execa(process.platform === "win32" ? "where" : "which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

export async function checkEnvironment(log: Console = console) {
  const results: CheckResult[] = [];
  const add = (name: string, pass: boolean, info?: string) => results.push({ name, pass, info });

  // Node version
  const nodeOk = (() => {
    try {
      const [maj] = process.versions.node.split(".").map(Number);
      return maj >= 20;
    } catch {
      return false;
    }
  })();
  add("Node >= 20", nodeOk, process.versions.node);

  // OpenAI key (support alias)
  const hasOpenAI = !!(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY);
  add("OPENAI_API_KEY/OPENAI_KEY present", hasOpenAI);

  // Mermaid CLI
  const mmdc = await hasCmd("mmdc");
  add("mermaid-cli (mmdc)", mmdc);

  // Docker
  const dockerCmd = await hasCmd("docker");
  add("docker in PATH", dockerCmd);
  let dockerInfo = false;
  let composeOk = false;
  if (dockerCmd) {
    try {
      await execa("docker", ["version"]);
      dockerInfo = true;
    } catch {
      // ignore
    }
    try {
      await execa("docker", ["compose", "version"]);
      composeOk = true;
    } catch {
      // ignore
    }
  }
  add("docker daemon reachable", dockerInfo);
  add("docker compose available", composeOk);

  // Optional: Postgres client tools
  const psql = await hasCmd("psql");
  add("psql available (optional)", psql);
  const pgDump = await hasCmd("pg_dump");
  add("pg_dump available (optional)", pgDump);

  const width = 32;
  log.info("Environment check:");
  for (const r of results) {
    log.info(`  ${ok(r.pass)} ${pad(`${r.name}:`, width)}${r.info ?? ""}`);
  }
  const allPass = results.every((r) => r.pass || r.name.includes("(optional)"));
  if (!allPass) {
    log.warn("Some requirements not met. The pipeline will skip or soft-fail where possible.");
  }
  return allPass;
}


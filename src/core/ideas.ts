import fs from "node:fs";
import path from "node:path";

export type Idea = {
  note: string;
  tag?: string;
  agent?: string;
  stage?: string;
  profile?: string;
  meta?: Record<string, unknown>;
  timestamp: string;
};

function getIdeaDir() {
  return process.env.REDOX_IDEA_DIR || path.join("redox", "facts");
}

export async function saveIdea(idea: Omit<Idea, "timestamp">): Promise<void> {
  const dir = getIdeaDir();
  const file = path.join(dir, "ideas.jsonl");
  await fs.promises.mkdir(dir, { recursive: true });
  const entry: Idea = { ...idea, timestamp: new Date().toISOString() };
  await fs.promises.appendFile(file, JSON.stringify(entry) + "\n");
}

import OpenAI from "openai";
import { config } from "dotenv";
import { recordUsage } from "./usage.js";
import { emitEngineEvent } from "./events.js";

config();

let client: OpenAI | null = null;

export function ensureOpenAIKey() {
  if (!process.env.OPENAI_API_KEY && process.env.OPENAI_KEY) {
    process.env.OPENAI_API_KEY = process.env.OPENAI_KEY;
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY (alias: OPENAI_KEY)");
  }
}

function getClient() {
  ensureOpenAIKey();
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export type LLMOpts = {
  model: string;
  temperature?: number;
  jsonSchema?: Record<string, unknown>;
  tools?: any[];
  agent?: string;
  stage?: string;
  profile?: string;
  meta?: Record<string, unknown>;
};

export async function askLLM(prompt: string, opts: LLMOpts) {
  const { model, temperature = 0.1, jsonSchema, tools } = opts;
  const body: any = {
    model,
    input: [{ role: "user", content: prompt }],
    temperature,
    tools,
  };

  if (jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "redox", schema: jsonSchema, strict: true },
    };
  }

  const res = await getClient().responses.create(body);

  const anyR: any = res as any;
  const usageRaw = (anyR.usage ?? anyR.output?.[0]?.usage ?? {}) as any;
  const inputTokens = usageRaw.input_tokens ?? usageRaw.prompt_tokens;
  const outputTokens = usageRaw.output_tokens ?? usageRaw.completion_tokens;
  const totalTokens =
    usageRaw.total_tokens ??
    (typeof inputTokens === "number" && typeof outputTokens === "number"
      ? inputTokens + outputTokens
      : undefined);

  try {
    await recordUsage({
      model,
      inputTokens: typeof inputTokens === "number" ? inputTokens : undefined,
      outputTokens: typeof outputTokens === "number" ? outputTokens : undefined,
      totalTokens: typeof totalTokens === "number" ? totalTokens : undefined,
      agent: opts.agent,
      stage: opts.stage,
      profile: opts.profile,
      meta: opts.meta,
    });
  } catch {
    // usage recording is best-effort; ignore errors
  }

  emitEngineEvent({
    type: "llm-call",
    model,
    agent: opts.agent,
    stage: opts.stage,
    profile: opts.profile,
    data: {
      inputTokens,
      outputTokens,
      totalTokens,
      meta: opts.meta ?? {},
    },
  });

  return res;
}

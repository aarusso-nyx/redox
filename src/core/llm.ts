import OpenAI from "openai";
import { config } from "dotenv";

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
};

export async function askLLM(prompt: string, opts: LLMOpts) {
  const { model, temperature = 0.1, jsonSchema, tools } = opts;
  return getClient().responses.create({
    model,
    input: [{ role: "user", content: prompt }],
    temperature,
    response_format: jsonSchema
      ? { type: "json_schema", json_schema: { name: "revdoc", schema: jsonSchema, strict: true } }
      : undefined,
    tools,
  });
}

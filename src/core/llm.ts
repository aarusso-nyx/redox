import OpenAI from "openai";
import { config } from "dotenv"; config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type LLMOpts = {
  model: string;
  temperature?: number;
  jsonSchema?: Record<string, unknown>;
  tools?: any[];
};
export async function askLLM(prompt: string, opts: LLMOpts) {
  const { model, temperature = 0.1, jsonSchema, tools } = opts;
  return openai.responses.create({
    model,
    input: [{ role: "user", content: prompt }],
    temperature,
    response_format: jsonSchema
      ? { type: "json_schema", json_schema: { name: "revdoc", schema: jsonSchema, strict: true } }
      : undefined,
    tools,
  });
}

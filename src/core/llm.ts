import OpenAI from "openai";
import { config } from "dotenv";
import { recordUsage } from "./usage.js";
import { emitEngineEvent } from "./events.js";
import { saveEvidence } from "./evidence.js";
import { saveIdea } from "./ideas.js";

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
  jsonSchema?: Record<string, unknown>;
  tools?: any[];
  allowedTools?: { type: "function" | "custom" | "shell"; name: string }[];
  toolMode?: "auto" | "required";
  reasoningEffort?: "none" | "low" | "medium" | "high";
  verbosity?: "low" | "medium" | "high";
  maxOutputTokens?: number;
  previousResponseId?: string;
  agent?: string;
  stage?: string;
  profile?: string;
  meta?: Record<string, unknown>;
};

export async function askLLM(prompt: string, opts: LLMOpts) {
  const {
    model,
    jsonSchema,
    tools,
    allowedTools,
    toolMode,
    reasoningEffort,
    verbosity,
    maxOutputTokens,
    // NOTE: previousResponseId is currently unused for Responses API calls
    // because chaining responses that involved tool calls without also
    // providing tool_outputs can trigger 400 errors like:
    // "No tool output found for function call ...".
    // It is kept in the opts type for future compatibility.
    // previousResponseId,
  } = opts;
  const body: any = {
    model,
    input: [{ role: "user", content: prompt }],
    tools,
  };

  // GPT-5 family: prefer balanced reasoning/verbosity by default
  if (model.startsWith("gpt-5")) {
    body.reasoning = {
      effort: reasoningEffort ?? "medium",
    };
    body.text = {
      verbosity: verbosity ?? "medium",
    };

    // Apply a global max_output_tokens cap of 10k; if callers
    // specify a higher value, clamp it down, otherwise default
    // to 10k to avoid unbounded responses.
    const cap = 10_000;
    if (typeof maxOutputTokens === "number") {
      body.max_output_tokens = maxOutputTokens > cap ? cap : maxOutputTokens;
    } else {
      body.max_output_tokens = cap;
    }
  }

  if (
    model.startsWith("gpt-5") &&
    Array.isArray(tools) &&
    tools.length > 0 &&
    Array.isArray(allowedTools) &&
    allowedTools.length > 0
  ) {
    body.tool_choice = {
      type: "allowed_tools",
      mode: toolMode ?? "auto",
      tools: allowedTools,
    };
  }

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

  // Best-effort execution of recognized tool calls (saveEvidence, pushIdea)
  try {
    const toolCalls: { name: string; args: any }[] = [];
    const out = (anyR.output ?? []) as any[];
    for (const item of out) {
      const contents = (item && item.content) || [];
      for (const c of contents) {
        const type = c?.type;
        if (type !== "tool_call" && type !== "output_tool_call") continue;
        const name = c.tool_name ?? c.name ?? c.tool?.name ?? c.function?.name;
        if (!name || typeof name !== "string") continue;
        let rawArgs =
          c.arguments ?? c.args ?? c.tool?.arguments ?? c.function?.arguments;
        let args: any = rawArgs;
        if (typeof rawArgs === "string") {
          try {
            args = JSON.parse(rawArgs);
          } catch {
            // leave as string if parsing fails
          }
        }
        toolCalls.push({ name, args });
      }
    }

    for (const call of toolCalls) {
      if (call.name === "saveEvidence" && call.args) {
        const { path: evPath, startLine, endLine, sha256, note } = call.args;
        if (
          typeof evPath === "string" &&
          typeof startLine === "number" &&
          typeof endLine === "number"
        ) {
          await saveEvidence({
            path: evPath,
            startLine,
            endLine,
            sha256: typeof sha256 === "string" ? sha256 : "",
            note: typeof note === "string" ? note : undefined,
          });
          emitEngineEvent({
            type: "evidence-saved",
            agent: opts.agent,
            stage: opts.stage,
            profile: opts.profile,
            data: {
              path: evPath,
              startLine,
              endLine,
              sha256: typeof sha256 === "string" ? sha256 : "",
              note: typeof note === "string" ? note : undefined,
            },
          });
        }
      } else if (call.name === "pushIdea" && call.args) {
        const { note, tag } = call.args;
        if (typeof note === "string" && note.trim()) {
          await saveIdea({
            note,
            tag: typeof tag === "string" ? tag : undefined,
            agent: opts.agent,
            stage: opts.stage,
            profile: opts.profile,
            meta: opts.meta,
          });
          emitEngineEvent({
            type: "idea-pushed",
            agent: opts.agent,
            stage: opts.stage,
            profile: opts.profile,
            data: {
              note,
              tag: typeof tag === "string" ? tag : undefined,
            },
          });
        }
      }
    }
  } catch {
    // Tool execution is best-effort; ignore errors so they don't affect main flow.
  }

  return res;
}

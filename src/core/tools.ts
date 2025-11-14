import { z } from "zod";
import { zodResponsesFunction } from "openai/helpers/zod";

export const RevdocTools = [
  zodResponsesFunction({
    name: "saveEvidence",
    description: "Persist evidence (path + line span + sha) to the ledger",
    parameters: z.object({
      path: z.string(),
      startLine: z.number().int(),
      endLine: z.number().int(),
      sha256: z.string().nullable(),
      note: z.string().nullable(),
    }),
  }),
  zodResponsesFunction({
    name: "pushIdea",
    description: "Record a stray suggestion for later tasks",
    parameters: z.object({
      note: z.string(),
      tag: z.string().nullable(),
    }),
  }),
];

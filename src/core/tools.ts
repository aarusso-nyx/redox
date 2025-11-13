export const RevdocTools = [
  {
    type: "function",
    function: {
      name: "saveEvidence",
      description: "Persist evidence (path + line span + sha) to the ledger",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          startLine: { type: "integer" },
          endLine: { type: "integer" },
          sha256: { type: "string" },
          note: { type: "string" }
        },
        required: ["path", "startLine", "endLine"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "pushIdea",
      description: "Record a stray suggestion for later tasks",
      parameters: { type: "object", properties: { note: { type: "string" }, tag: { type: "string" } }, required: ["note"] }
    }
  }
];

export const MODELS = {
  maestro: process.env.REVDOC_MODEL_MAESTRO ?? "gpt-5.1-large",
  coder:   process.env.REVDOC_MODEL_CODE    ?? "gpt-5.1-code-medium",
  writer:  process.env.REVDOC_MODEL_WRITER  ?? "gpt-5.1-medium",
};
export const TEMPS = { extract: 0.1, tabulate: 0.0, prose: 0.3 };

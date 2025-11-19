import { summarizeUsage } from "../core/usage.js";

export async function printUsageReport() {
  const summary = await summarizeUsage();
  if (!summary.entries) {
    console.log(
      "No usage data recorded yet (facts/usage.jsonl is empty or missing).",
    );
    return;
  }

  console.log("Token usage summary:");
  console.log(`  Runs:          ${summary.runs}`);
  console.log(`  Calls:         ${summary.entries}`);
  console.log(`  Input tokens:  ${summary.totalInput}`);
  console.log(`  Output tokens: ${summary.totalOutput}`);
  console.log(`  Total tokens:  ${summary.totalTokens}`);

  console.log("\nBy model:");
  for (const [model, stats] of Object.entries(summary.byModel)) {
    console.log(
      `  ${model}: calls=${stats.calls} input=${stats.input} output=${stats.output} total=${stats.total}`,
    );
  }

  console.log("\nBy agent:");
  for (const [agent, stats] of Object.entries(summary.byAgent)) {
    console.log(
      `  ${agent}: calls=${stats.calls} input=${stats.input} output=${stats.output} total=${stats.total}`,
    );
  }
}

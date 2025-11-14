import { summarizeUsage } from "../core/usage.js";

export async function printUsageReport() {
  const summary = await summarizeUsage();
  if (!summary.entries) {
    // eslint-disable-next-line no-console
    console.log("No usage data recorded yet (.redox/usage.jsonl is empty or missing).");
    return;
  }

  // eslint-disable-next-line no-console
  console.log("Token usage summary:");
  // eslint-disable-next-line no-console
  console.log(`  Runs:          ${summary.runs}`);
  // eslint-disable-next-line no-console
  console.log(`  Calls:         ${summary.entries}`);
  // eslint-disable-next-line no-console
  console.log(`  Input tokens:  ${summary.totalInput}`);
  // eslint-disable-next-line no-console
  console.log(`  Output tokens: ${summary.totalOutput}`);
  // eslint-disable-next-line no-console
  console.log(`  Total tokens:  ${summary.totalTokens}`);

  // eslint-disable-next-line no-console
  console.log("\nBy model:");
  for (const [model, stats] of Object.entries(summary.byModel)) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${model}: calls=${stats.calls} input=${stats.input} output=${stats.output} total=${stats.total}`,
    );
  }

  // eslint-disable-next-line no-console
  console.log("\nBy agent:");
  for (const [agent, stats] of Object.entries(summary.byAgent)) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${agent}: calls=${stats.calls} input=${stats.input} output=${stats.output} total=${stats.total}`,
    );
  }
}


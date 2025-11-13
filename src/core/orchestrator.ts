import { schemaGate } from "../gates/schema.js";
import { coverageGate } from "../gates/coverage.js";

export async function orchestrate(stage: "dev"|"user"|"audit"|"all"|"extract"|"synthesize"|"render"|"check", opts: any) {
  // This is a stub orchestrator: wire tasks, respect opts.profile, opts.gates
  // TODO: implement task DAG and closed-loop.
  if (stage === "check") {
    if ((opts.gates ?? "").includes("schema")) schemaGate({}, {});
    if ((opts.gates ?? "").includes("coverage")) coverageGate([], [], []);
  }
}

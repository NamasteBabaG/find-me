/** The deploy command supplies fresh runs from this repository's quality workflow. */
export function passingQaCiRun(runs, commit) {
  if (!Array.isArray(runs)) throw Error("Invalid QA CI evidence");
  const latest = runs.find(run => run.headSha === commit && run.workflowName === "Quality gate");
  if (!latest || latest.status !== "completed" || latest.conclusion !== "success") {
    throw Error("Refusing QA deployment without a completed passing Quality gate for this exact commit");
  }
  if (!Number.isSafeInteger(latest.databaseId) || latest.databaseId <= 0) throw Error("Invalid QA CI run identifier");
  return latest.databaseId;
}

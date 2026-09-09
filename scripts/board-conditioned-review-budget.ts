import path from "node:path";

/** Parsing only: the existing GenerationBudget validates the immutable receipt,
 * retains the unknown reserve and enforces the unchanged ledger/cumulative caps. */
export function finalReviewBudgetOptions(argv: readonly string[]): { continuationApprovalFile?: string } {
  const flags = argv.filter(value => value === "--continuation-approval" || value.startsWith("--continuation-approval="));
  if (!flags.length) return {};
  if (flags.length !== 1 || !flags[0]!.startsWith("--continuation-approval=")) throw new Error("FINAL_REVIEW: one explicit --continuation-approval=receipt.json is required");
  const file = flags[0]!.slice("--continuation-approval=".length);
  if (!file.trim()) throw new Error("FINAL_REVIEW: continuation approval path cannot be empty");
  return { continuationApprovalFile: path.resolve(file) };
}

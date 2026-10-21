/** Explicit completion authority for an existing QA source revision; default lean releases retain four dollars. */
export const LEAN_COMPLETION_BUDGET_VERSION = "explicit-lean-source-completion-six-dollar/v1" as const;
export const LEAN_COMPLETION_BUDGET_CAP = 6_000_000 as const;
export const LEAN_COMPLETION_BUDGET_ACTION = "local-patch:lean-completion-budget-authorized";
export const LEAN_COMPLETION_BUDGET_CONFIRMATION = "owner-authorized-six-dollars-cumulative-for-this-source-revision-v1";

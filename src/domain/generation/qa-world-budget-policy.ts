/** Standing owner authorization, 2026-10-14. Only NEW qualified QA drafts enroll.
 * Existing worlds and the generic/production five-dollar ceiling are unchanged. */
export const NEW_QA_WORLD_BUDGET_POLICY = "local-patch:new-qa-world-six-dollar/v1";
export const NEW_QA_WORLD_CAP_MICRO_USD = 6_000_000 as const;
export const NEW_QA_WORLD_BUDGET_AUTHORIZATION = "2026-10-14: מאשר עד $6 לעולם למשחקי QA חדשים";
export function newQaWorldBudgetEnabled(input: { appEnv: string | undefined; storageId: string; promptRelease: string | undefined; reviewRelease: string | undefined }) {
  return input.appEnv === "qa" && input.storageId === "db" && input.promptRelease === "v19"
    && input.reviewRelease === "local-patch-dual-high/v3";
}

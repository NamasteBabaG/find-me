/** Standing owner authorization, 2026-10-14. Only NEW qualified QA drafts enroll.
 * Existing worlds and the generic/production five-dollar ceiling are unchanged. */
export const NEW_QA_WORLD_BUDGET_POLICY = "local-patch:new-qa-world-six-dollar/v1";
export const NEW_QA_WORLD_CAP_MICRO_USD = 6_000_000 as const;
export const NEW_QA_WORLD_BUDGET_AUTHORIZATION = "2026-10-14: מאשר עד $6 לעולם למשחקי QA חדשים";
export function newQaWorldBudgetEnabled(input: { appEnv: string | undefined; storageId: string; promptRelease: string | undefined; reviewRelease: string | undefined }) {
  return input.appEnv === "qa" && input.storageId === "db" && input.promptRelease === "v19"
    && input.reviewRelease === "local-patch-dual-high/v3";
}

/**
 * local-patch:qa-pilot-completion/v1. Owner authorization of 18 October 2026, for the named QA pilot
 * world only: a larger budget if needed to complete that world and the engine correction it exposed.
 * The owner named no figure; USD12 cumulative is the working frame proposed with the brief, inclusive
 * of everything already settled and every unknown reservation. Beyond it, the engine stops and the
 * calculation goes back to the owner. It applies only to a world that already carries the verified
 * six-dollar pin; it grants nothing to any other world, game or environment.
 */
export const QA_PILOT_COMPLETION_POLICY = "local-patch:qa-pilot-completion/v1";
export const QA_PILOT_COMPLETION_CAP_MICRO_USD = 12_000_000 as const;
export const QA_PILOT_COMPLETION_AUTHORIZATION = "2026-10-18: the owner approved a larger budget if needed to complete this QA pilot world; working frame USD12 cumulative, history and unknown reservations included";
export const QA_PILOT_COMPLETION_WORLDS: ReadonlySet<string> = new Set(["game_j9mpft6aemfij36zegjk:board-wizard"]);

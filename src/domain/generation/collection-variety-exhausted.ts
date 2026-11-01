import { selfRepairProgress } from "../scene/local-patch-progress";

/**
 * collection-variety-exhausted/v1 (1 November 2026): variety is a goal of the
 * world, never a reason to leave an appearance out of it. While an appearance
 * still has an automatic repair cycle, a painting whose look already covers a
 * third of the world is repainted for variety, as before. On its last automatic
 * chance (its subject repair cycles are spent) a painting that passes every
 * check is accepted even though its look repeats.
 */
export const COLLECTION_VARIETY_EXHAUSTED_VERSION = "collection-variety-exhausted/v1" as const;

/** Whether the collection's variety rule may still refuse this appearance's current painting. */
export function collectionVarietyApplies(row: { readonly attempts: number; readonly judgeJson: string | null }): boolean {
  try { return !selfRepairProgress(JSON.parse(row.judgeJson ?? "null")?.selfRepair, row.attempts).exhausted; } catch { return true; }
}

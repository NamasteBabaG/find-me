/**
 * kingdom-image-interruption/v1 (kingdom-generation/v6 only), closing the image half of review finding P0-2.
 *
 * Under earlier pins an interrupted painting (a transport failure, timeout, 408/429/5xx with no image) was replaced
 * automatically only for a first attempt and on at most two hides per world; anything beyond that parked the world for a
 * person. A v6 world instead admits a replacement for an interrupted first attempt on ANY hide, while its ledger has
 * room. The interrupted charge stays UNKNOWN and fully reserved forever: nothing is released, settled or forgiven, so
 * every interruption spends real headroom and the $7 ceiling (close and refund) is the outer bound.
 * From the third interruption in a world on, each replacement waits out a growing backoff (1, 2, 4, 8, 16, 30, 30...
 * minutes after its interruption), so a provider outage slows the world down instead of buying through the ceiling.
 * An interrupted SECOND attempt still goes to a person: its replacement would be the hide's final attempt, a Sunburst
 * self-repair whose diagnosis needs judged pixels, and that path is not proven for an attempt with no image.
 */
export const KINGDOM_IMAGE_INTERRUPTION_POLICY = "kingdom-image-interruption/v1" as const;
/** The last attempt whose interruption may be replaced automatically: a replacement is always the next attempt. */
export const KINGDOM_IMAGE_INTERRUPTION_MAX_ATTEMPT = 1;
/** Structural bound: one first-attempt interruption per hide. The ledger ceiling binds long before it in practice. */
export const KINGDOM_IMAGE_INTERRUPTION_LIMIT = 27;

/** The wait between the `interruption`-th interruption in a world (counted from 1) and its replacement. Pure. */
export function kingdomImageInterruptionBackoffMs(interruption: number): number {
  if (!Number.isSafeInteger(interruption) || interruption <= 2) return 0;
  return Math.min(30, 2 ** (interruption - 3)) * 60_000;
}

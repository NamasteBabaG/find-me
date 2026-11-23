/**
 * The approved offering: what any surface may sell, in every environment and engine (pilot QA, 2026-11-23, P1-3).
 *
 * The home page, the wizard, checkout and the family area all read the catalog through `purchasableWorlds`, which
 * applies this. Before it, what was sold depended on the environment: QA sold one world of two, while the production
 * defaults sold three worlds (time travel with no qualified engine) in packages of one, two or three that the wizard
 * could not even build. A world outside this list may be shown as coming soon, never sold.
 */
export const OFFERED_WORLD_SLUGS = ["journey", "kingdom"] as const;

/** One world per order. The next world for the same child is its own order, at the continuation price. */
export const WORLDS_PER_ORDER = 1;

export function isOfferedWorld(slug: string): boolean {
  return (OFFERED_WORLD_SLUGS as readonly string[]).includes(slug);
}

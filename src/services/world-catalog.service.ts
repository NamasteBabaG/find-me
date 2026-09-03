import { activeWorlds, findWorld, worldOfBoard } from "../../content/worlds";
import { boardSlugs, type WorldDefinition } from "@/domain/world";
import type { Container } from "./container";
import { activeSceneSlugs } from "./scene-catalog.service";

/**
 * Worlds, filtered by what is actually playable.
 *
 * A world is only offered when every one of its nine boards is active: half a
 * journey is not a journey, and a parent must never buy a map with a hole in it.
 */
export async function purchasableWorlds(c: Container): Promise<WorldDefinition[]> {
  const active = new Set(await activeSceneSlugs(c));
  return activeWorlds().filter((w) => w.purchasable && boardSlugs(w).every((slug) => active.has(slug)));
}

export async function purchasableWorldSlugs(c: Container): Promise<string[]> {
  return (await purchasableWorlds(c)).map((w) => w.slug);
}

export function worldBySlug(slug: string): WorldDefinition {
  const world = findWorld(slug);
  if (!world) throw new Error(`Unknown world "${slug}"`);
  return world;
}

/** Every board of these worlds, in journey order, worlds in their own order. */
export function boardsOfWorlds(worldSlugs: readonly string[]): string[] {
  return worldSlugs.flatMap((slug) => boardSlugs(worldBySlug(slug)));
}

/**
 * Which worlds a game owns.
 *
 * Derived from the boards the game actually has, so it stays true without a
 * migration: a game owns a world when it holds all nine of its boards. Upgrades
 * add boards, which is what grants the world.
 */
export function worldsOwned(boardSlugsInGame: readonly string[]): WorldDefinition[] {
  const held = new Set(boardSlugsInGame);
  return activeWorlds().filter((w) => boardSlugs(w).every((slug) => held.has(slug)));
}

/** The world a board belongs to, for progress and the map. */
export function worldForBoard(boardSlug: string): WorldDefinition | undefined {
  return worldOfBoard(boardSlug);
}

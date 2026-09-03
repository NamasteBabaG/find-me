import { z } from "zod";
import { BOARDS_PER_WORLD } from "./package";
import { LocalizedTextSchema, Unit } from "./scene/schema";

/**
 * A world is a journey: nine boards, in a fixed order, on one illustrated map.
 *
 * It is also the unit a parent buys. Everything above a board lives here —
 * grouping, order, map geometry, progression — and none of it knows about
 * React, the database or a payment provider.
 *
 *   World → 9 boards → 3 missions each
 */

// Lives in ./package with the other product-shape constants: scene/schema imports
// package, so world importing package (and not the other way round) has no cycle.
export { BOARDS_PER_WORLD };

/** How the marker moves along a route segment. Presentation only. */
export const TravelStyle = z.enum(["walk", "hop", "sail", "float", "rocket"]);
export type TravelStyle = z.infer<typeof TravelStyle>;

export const MapNodeSchema = z.object({
  boardSlug: z.string().min(1),
  /** 1..9 — the order of the journey, which is also the keyboard focus order. */
  routeIndex: z.number().int().min(1).max(BOARDS_PER_WORLD),
  /** Normalized against the map art, like every other coordinate in the project. */
  x: Unit,
  y: Unit,
  /** A medallion belonging to the world's own visual language — never an emoji. */
  iconAsset: z.string().min(1),
  labelAnchor: z.enum(["top", "bottom", "start", "end"]).default("bottom"),
  markerScale: z.number().positive().max(1).default(0.09),
  travelStyle: TravelStyle.default("walk"),
});
export type MapNode = z.infer<typeof MapNodeSchema>;

export const WorldDefinitionSchema = z.object({
  slug: z.string().min(1),
  /** Display order in the hub, and the order worlds are offered in. */
  order: z.number().int().min(1),
  name: LocalizedTextSchema,
  tagline: LocalizedTextSchema,
  /** One short line shown once, when the child first arrives. */
  intro: LocalizedTextSchema,
  map: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** The painted map, route and all. Nodes and labels are runtime layers. */
    art: z.string().min(1),
    /** A narrower crop for phones that still contains all nine nodes. */
    artPortrait: z.string().optional(),
    palette: z.object({ sky: z.string(), ground: z.string(), accent: z.string() }),
  }),
  nodes: z.array(MapNodeSchema).length(BOARDS_PER_WORLD),
  /** What a child collects here: one piece per board, nine to complete the set. */
  collectible: z.object({
    id: z.string().min(1),
    name: LocalizedTextSchema,
    /** The single piece — a stamp, a jewel, a cog. */
    piece: LocalizedTextSchema,
    icon: z.string().min(1),
  }),
  completion: z.object({
    title: LocalizedTextSchema,
    text: LocalizedTextSchema,
    icon: z.string().min(1),
  }),
  active: z.boolean().default(true),
  /** A world can be finished but not yet for sale. */
  purchasable: z.boolean().default(true),
  version: z.number().int().positive(),
});
export type WorldDefinition = z.infer<typeof WorldDefinitionSchema>;

/** The board slugs of a world, in journey order. */
export function boardSlugs(world: WorldDefinition): string[] {
  return [...world.nodes].sort((a, b) => a.routeIndex - b.routeIndex).map((n) => n.boardSlug);
}

export function nodeFor(world: WorldDefinition, boardSlug: string): MapNode | undefined {
  return world.nodes.find((n) => n.boardSlug === boardSlug);
}

// ─── Progression ─────────────────────────────────────────────

/**
 * What the child has done in one world. Derived from saved board progress —
 * never from an animation, which is only a presentation of this.
 */
export interface WorldProgress {
  /** Board slugs completed at least once, in any order. */
  completedBoards: readonly string[];
  lastPlayedBoardSlug?: string;
}

export const EMPTY_PROGRESS: WorldProgress = { completedBoards: [] };

/**
 * `completed` — done at least once, always replayable.
 * `current`   — where the marker stands: the first destination not yet done.
 * `next`      — the one after it, so it can wake up when the marker arrives.
 * `future`    — visible, quieter, never presented as a punishment.
 */
export type NodeState = "completed" | "current" | "next" | "future";

export function nodeStates(world: WorldDefinition, progress: WorldProgress): Record<string, NodeState> {
  const done = new Set(progress.completedBoards);
  const order = boardSlugs(world);
  const states: Record<string, NodeState> = {};
  let seenIncomplete = 0;
  for (const slug of order) {
    if (done.has(slug)) {
      states[slug] = "completed";
      continue;
    }
    seenIncomplete += 1;
    states[slug] = seenIncomplete === 1 ? "current" : seenIncomplete === 2 ? "next" : "future";
  }
  return states;
}

/** Where the marker stands. A finished world puts it on the last destination. */
export function currentBoard(world: WorldDefinition, progress: WorldProgress): string {
  const order = boardSlugs(world);
  const done = new Set(progress.completedBoards);
  return order.find((slug) => !done.has(slug)) ?? order[order.length - 1]!;
}

/** Where the marker travels after finishing `boardSlug`, or null at the end of the journey. */
export function nextBoard(world: WorldDefinition, progress: WorldProgress): string | null {
  const order = boardSlugs(world);
  const done = new Set(progress.completedBoards);
  const remaining = order.filter((slug) => !done.has(slug));
  return remaining[0] ?? null;
}

export function isWorldComplete(world: WorldDefinition, progress: WorldProgress): boolean {
  const done = new Set(progress.completedBoards);
  return boardSlugs(world).every((slug) => done.has(slug));
}

/**
 * Soft-linear: the journey guides without locking people out of what they have
 * done. Everything finished stays open, the current destination is open, and a
 * finished world opens completely.
 */
export function isBoardPlayable(world: WorldDefinition, progress: WorldProgress, boardSlug: string): boolean {
  if (!nodeFor(world, boardSlug)) return false;
  if (isWorldComplete(world, progress)) return true;
  if (progress.completedBoards.includes(boardSlug)) return true;
  return currentBoard(world, progress) === boardSlug;
}

/** How many of the world's nine pieces the child holds. */
export function collectedPieces(world: WorldDefinition, progress: WorldProgress): number {
  const inWorld = new Set(boardSlugs(world));
  return progress.completedBoards.filter((slug) => inWorld.has(slug)).length;
}

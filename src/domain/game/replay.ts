import { seededRng, shuffle } from "@/lib/random";
import type { SceneConfig } from "./config";

/**
 * Replay engine.
 *
 * Each target has two hiding spots (A/B). Across plays we:
 *  • alternate the spot of every target away from the one used last time,
 *  • shuffle the mission order (first play is easy → hard),
 *  • rotate the success lines.
 *
 * 3 targets × 2 spots = 8 layouts per scene without any new art.
 * Everything is derived from a seed so it is reproducible.
 */

export type SlotVariant = "A" | "B";

export interface ScenePlayPlan {
  playIndex: number;
  /** Target ids in mission order. */
  order: string[];
  variants: Record<string, SlotVariant>;
  /** Which success line each target will say this play. */
  successIndex: Record<string, number>;
  bonusVariant: SlotVariant;
}

export interface ScenePlayHistory {
  /** How many times this scene has been completed before. */
  plays: number;
  lastVariants?: Record<string, SlotVariant>;
  lastOrder?: string[];
}

export function planScenePlay(scene: SceneConfig, history: ScenePlayHistory, seedBase: string): ScenePlayPlan {
  const playIndex = history.plays;
  const rng = seededRng(`${seedBase}:${scene.slug}:${playIndex}`);
  const ids = scene.targets.map((t) => t.id);

  // Order: canonical (by difficulty) first, shuffled afterwards — and never
  // identical to the previous order when the rng allows.
  let order: string[];
  if (playIndex === 0) {
    order = [...scene.targets].sort((a, b) => a.difficulty - b.difficulty).map((t) => t.id);
  } else {
    order = shuffle(ids, rng);
    if (history.lastOrder && sameOrder(order, history.lastOrder) && ids.length > 1) {
      order = [...order.slice(1), order[0] as string];
    }
  }

  const variants: Record<string, SlotVariant> = {};
  for (const target of scene.targets) {
    const id = target.id;
    const usable = usableVariants(target);
    if (usable.length === 1) {
      // Only one hiding spot was generated for this child: always use it, or the
      // renderer would draw her at spot A while the hints point at spot B.
      variants[id] = usable[0]!;
      continue;
    }
    if (playIndex === 0) {
      variants[id] = "A";
    } else {
      const last = history.lastVariants?.[id];
      variants[id] = last === "A" ? "B" : last === "B" ? "A" : rng() < 0.5 ? "A" : "B";
    }
  }

  const successIndex: Record<string, number> = {};
  for (const t of scene.targets) {
    successIndex[t.id] = t.success.length === 0 ? 0 : playIndex % t.success.length;
  }

  return {
    playIndex,
    order,
    variants,
    successIndex,
    bonusVariant: playIndex % 2 === 0 ? "A" : "B",
  };
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The hiding spots this target can actually be played at.
 *
 * A slot patch belongs to one spot, and a game may have been generated with
 * only spot A (the default: half the cost, still a complete game). A procedural
 * sprite works at either spot, so it keeps both.
 */
export function usableVariants(target: SceneConfig["targets"][number]): SlotVariant[] {
  const byVariant = target.spriteByVariant;
  if (!byVariant) return ["A", "B"];
  const usable = (["A", "B"] as const).filter((v) => byVariant[v]);
  return usable.length > 0 ? [...usable] : ["A", "B"];
}

export function slotFor(scene: SceneConfig, targetId: string, variant: SlotVariant) {
  const target = scene.targets.find((t) => t.id === targetId);
  if (!target) throw new Error(`slotFor: unknown target ${targetId}`);
  return variant === "A" ? target.slots[0] : target.slots[1];
}

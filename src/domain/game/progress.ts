import { z } from "zod";
import type { SlotVariant } from "./replay";

/**
 * Player progress. Stored in the player's browser (guests never touch the
 * owner's progress) and mirrored as aggregate events for product analytics.
 */
export const SceneProgressSchema = z.object({
  plays: z.number().int().min(0).default(0),
  completed: z.boolean().default(false),
  lastVariants: z.record(z.enum(["A", "B"])).default({}),
  lastOrder: z.array(z.string()).default([]),
  noHintClear: z.boolean().default(false),
  collectible: z.boolean().default(false),
  bonusFound: z.boolean().default(false),
});
export type SceneProgress = z.infer<typeof SceneProgressSchema>;

export const GameProgressSchema = z.object({
  v: z.literal(1),
  gameId: z.string(),
  openedAt: z.string().optional(),
  revealed: z.boolean().default(false),
  completedAt: z.string().optional(),
  scenes: z.record(SceneProgressSchema).default({}),
});
export type GameProgress = z.infer<typeof GameProgressSchema>;

export function emptyProgress(gameId: string): GameProgress {
  return { v: 1, gameId, revealed: false, scenes: {} };
}

export function parseProgress(raw: string | null | undefined, gameId: string): GameProgress {
  if (!raw) return emptyProgress(gameId);
  try {
    const parsed = GameProgressSchema.safeParse(JSON.parse(raw));
    if (parsed.success && parsed.data.gameId === gameId) return parsed.data;
  } catch {
    /* corrupted storage → start fresh */
  }
  return emptyProgress(gameId);
}

export function sceneProgress(progress: GameProgress, slug: string): SceneProgress {
  return progress.scenes[slug] ?? SceneProgressSchema.parse({});
}

export function recordSceneCompleted(
  progress: GameProgress,
  slug: string,
  result: { variants: Record<string, SlotVariant>; order: string[]; noHints: boolean; bonusFound: boolean },
  totalScenes: number,
  now: Date = new Date(),
): GameProgress {
  const prev = sceneProgress(progress, slug);
  const next: SceneProgress = {
    plays: prev.plays + 1,
    completed: true,
    lastVariants: result.variants,
    lastOrder: result.order,
    noHintClear: prev.noHintClear || result.noHints,
    collectible: true,
    bonusFound: prev.bonusFound || result.bonusFound,
  };
  const scenes = { ...progress.scenes, [slug]: next };
  const completedCount = Object.values(scenes).filter((s) => s.completed).length;
  return {
    ...progress,
    scenes,
    completedAt: progress.completedAt ?? (completedCount >= totalScenes ? now.toISOString() : undefined),
  };
}

export function completedScenes(progress: GameProgress): number {
  return Object.values(progress.scenes).filter((s) => s.completed).length;
}

export function collectibles(progress: GameProgress): string[] {
  return Object.entries(progress.scenes)
    .filter(([, s]) => s.collectible)
    .map(([slug]) => slug);
}

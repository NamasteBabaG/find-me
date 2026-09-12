import { z } from "zod";
import type { SlotVariant } from "./replay";
import { scenesOfWorld, worldOfScene, type GameConfig, type SceneConfig } from "./config";
import type { MissionState } from "./mission";

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
  sceneVersion: z.number().int().optional(),
  foundTargetIds: z.array(z.string()).optional(),
  foundRecords: z.record(z.object({ hintsUsed: z.number().nonnegative(), misses: z.number().nonnegative(), elapsedMs: z.number().nonnegative() })).optional(),
});
export type SceneProgress = z.infer<typeof SceneProgressSchema>;

export const GameProgressSchema = z.object({
  v: z.literal(1),
  gameId: z.string(),
  openedAt: z.string().optional(),
  revealed: z.boolean().default(false),
  completedAt: z.string().optional(),
  journeyFinishedAt: z.string().optional(),
  scenes: z.record(SceneProgressSchema).default({}),
  /** Legacy serial searches restart; versioned find-any boards also retain partial finds. */
  lastWorld: z.string().optional(),
  lastScene: z.string().optional(),
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

/** Never count stale-version, unknown or duplicated IDs as stars. */
export function sceneFoundIds(progress: GameProgress, scene: SceneConfig): string[] {
  const saved = sceneProgress(progress, scene.slug);
  if (scene.playMode !== "find-any") return saved.completed ? scene.targets.map(target => target.id) : [];
  if (saved.sceneVersion !== scene.version) return [];
  const found = new Set(saved.foundTargetIds ?? []);
  return scene.targets.filter(target => found.has(target.id)).map(target => target.id);
}

export function sceneCanAdvance(progress: GameProgress, scene: SceneConfig): boolean {
  return scene.playMode === "find-any" ? sceneFoundIds(progress, scene).length >= (scene.findsRequiredToAdvance ?? 3) : sceneProgress(progress, scene.slug).completed;
}

export function sceneIsComplete(progress: GameProgress, scene: SceneConfig): boolean {
  return scene.playMode === "find-any" ? sceneFoundIds(progress, scene).length === scene.targets.length : sceneProgress(progress, scene.slug).completed;
}

export function gameStars(progress: GameProgress, scenes: readonly SceneConfig[]): { found: number; total: number } {
  return { found: scenes.reduce((n, scene) => n + sceneFoundIds(progress, scene).length, 0), total: scenes.reduce((n, scene) => n + scene.targets.length, 0) };
}

/** Strictly gated only for new games; do not change the old soft-linear route. */
export function sceneIsPlayable(progress: GameProgress, config: GameConfig, scene: SceneConfig): boolean {
  if (scene.playMode !== "find-any") return true;
  const world = worldOfScene(config, scene.slug);
  const ordered = world ? scenesOfWorld(config, world.slug) : config.scenes;
  const index = ordered.findIndex(item => item.slug === scene.slug);
  return index >= 0 && ordered.slice(0, index).every(item => sceneCanAdvance(progress, item));
}

/** Called synchronously on a distinct hit, before any animation or navigation. */
export function recordFindAny(progress: GameProgress, scene: SceneConfig, mission: MissionState, scenes: readonly SceneConfig[], now = new Date()): GameProgress {
  const prev = sceneProgress(progress, scene.slug);
  const ids = scene.targets.filter(target => mission.found[target.id]).map(target => target.id);
  const completed = ids.length === scene.targets.length;
  const next: SceneProgress = {
    ...prev, sceneVersion: scene.version, foundTargetIds: ids,
    foundRecords: Object.fromEntries(ids.map(id => [id, mission.found[id]!])),
    lastVariants: mission.plan.variants, lastOrder: mission.plan.order,
    completed, collectible: completed, plays: completed ? Math.max(1, prev.plays) : prev.plays,
    noHintClear: completed && ids.every(id => mission.found[id]!.hintsUsed === 0), bonusFound: mission.bonusFound,
  };
  const updated = { ...progress, scenes: { ...progress.scenes, [scene.slug]: next }, lastScene: scene.slug };
  return { ...updated,
    journeyFinishedAt: progress.journeyFinishedAt ?? (scenes.every(item => sceneCanAdvance(updated, item)) ? now.toISOString() : undefined),
    completedAt: progress.completedAt ?? (scenes.every(item => sceneIsComplete(updated, item)) ? now.toISOString() : undefined),
  };
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

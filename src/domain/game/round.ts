import { z } from "zod";
import { gameWorlds, scenesOfWorld, type GameConfig } from "./config";
import { emptyProgress, GameProgressSchema, sceneCanAdvance, type GameProgress } from "./progress";

/** A new search has its own score and cursor. Earned progress is never reset. */
export const PlayRoundSchema = z.object({
  v: z.literal(1),
  gameId: z.string(),
  active: z.boolean(),
  route: z.array(z.string()).min(1),
  progress: GameProgressSchema,
  discoveries: z.record(z.array(z.string())).default({}),
});
export type PlayRound = z.infer<typeof PlayRoundSchema>;

export function gameRoute(config: GameConfig): string[] {
  const ordered = gameWorlds(config).flatMap(world => scenesOfWorld(config, world.slug).map(scene => scene.slug));
  return [...new Set([...ordered, ...config.scenes.map(scene => scene.slug)])];
}

export function newRound(config: GameConfig, start = gameRoute(config)[0]): PlayRound | null {
  if (!start) return null;
  const route = gameRoute(config), index = route.indexOf(start);
  if (index < 0) return null;
  return { v: 1, gameId: config.gameId, active: true, route: route.slice(index),
    progress: { ...emptyProgress(config.gameId), revealed: true, lastScene: start }, discoveries: {} };
}

export function parseRound(raw: string | null, config: GameConfig): PlayRound | null {
  try {
    const parsed = PlayRoundSchema.safeParse(JSON.parse(raw ?? "null"));
    if (!parsed.success || parsed.data.gameId !== config.gameId || parsed.data.progress.gameId !== config.gameId) return null;
    const round = parsed.data, route = gameRoute(config), index = route.indexOf(round.route[0]!);
    if (index < 0 || JSON.stringify(round.route) !== JSON.stringify(route.slice(index))) return null;
    if (round.progress.lastScene && !round.route.includes(round.progress.lastScene)) return null;
    return round;
  } catch { return null; }
}

export function roundCanOpen(round: PlayRound, config: GameConfig, slug: string): boolean {
  const index = round.route.indexOf(slug);
  return index >= 0 && round.route.slice(0, index).every(before => {
    const scene = config.scenes.find(s => s.slug === before);
    return !!scene && sceneCanAdvance(round.progress, scene);
  });
}

/** Presentation score for the active search; the passport always uses earned progress. */
export function searchProgress(round: PlayRound | null, earned: GameProgress): GameProgress {
  return round?.active ? round.progress : earned;
}

import type { SceneConfig } from "@/domain/game/config";
import { sceneFoundIds, sceneProgress, type GameProgress } from "@/domain/game/progress";
import { planScenePlay } from "@/domain/game/replay";

/** Speculation only: use the saved layout the actual entry will resume, and
 * never change progress or decide whether a board is available. */
export function sceneWarmupUrls(scene: SceneConfig, progress: GameProgress, gameId: string, baseUrl: string): string[] {
  const history = sceneProgress(progress, scene.slug);
  let plan = planScenePlay(scene, history, gameId);
  const resumable = scene.playMode === "find-any" && history.sceneVersion === scene.version
    && history.lastOrder.length === scene.targets.length && new Set(history.lastOrder).size === scene.targets.length
    && history.lastOrder.every(id => scene.targets.some(target => target.id === id));
  if (resumable) plan = { ...plan, order: history.lastOrder,
    variants: Object.fromEntries(scene.targets.map(target => [target.id, history.lastVariants[target.id] ?? "A"])) };
  const found = sceneFoundIds(progress, scene);
  const first = scene.targets.find(target => target.id === plan.order.find(id => !found.includes(id)));
  const sprite = first ? first.spriteByVariant?.[plan.variants[first.id] ?? "A"] ?? first.sprite : null;
  return [...new Set([baseUrl, ...(sprite ? [sprite.kind === "image" ? sprite.url : sprite.faceUrl] : [])])];
}

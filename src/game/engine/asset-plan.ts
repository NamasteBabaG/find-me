/**
 * Which pictures a board cannot open without, and which it can.
 *
 * The board and the child currently painted into it are the game: without them there
 * is nothing to find, and opening anyway hands a four-year-old an impossible
 * mission. The foreground layer and the bonus sprite are decoration; a missing
 * one costs a detail, not the game.
 */
export interface AssetPlan {
  essential: string[];
  /** One following hide, warmed only once the current pictures can be shown. */
  warmup: string[];
  decorative: string[];
}

export function assetPlan(scene: { art: { base: string; foreground?: string | null }; bonus?: { sprite?: string | null } | null }, currentTargetUrl?: string | null, nextTargetUrl?: string | null): AssetPlan {
  const essential = new Set<string>([scene.art.base, ...(currentTargetUrl ? [currentTargetUrl] : [])]);
  const warmup = new Set<string>(nextTargetUrl ? [nextTargetUrl] : []);
  const decorative = new Set<string>();
  if (scene.art.foreground) decorative.add(scene.art.foreground);
  if (scene.bonus?.sprite) decorative.add(scene.bonus.sprite);
  for (const url of essential) { warmup.delete(url); decorative.delete(url); }
  for (const url of warmup) decorative.delete(url);
  return { essential: [...essential], warmup: [...warmup], decorative: [...decorative] };
}

export interface LoadResult {
  url: string;
  ok: boolean;
}

/** "ready" unless something the game cannot do without failed to load. */
export function preloadVerdict(plan: AssetPlan, results: readonly LoadResult[]): "ready" | "failed" {
  const failed = new Set(results.filter((r) => !r.ok).map((r) => r.url));
  return plan.essential.some((url) => failed.has(url)) ? "failed" : "ready";
}

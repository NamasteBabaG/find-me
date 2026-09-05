/**
 * Which pictures a board cannot open without, and which it can.
 *
 * The board and the children painted into it are the game: without them there
 * is nothing to find, and opening anyway hands a four-year-old an impossible
 * mission. The foreground layer and the bonus sprite are decoration; a missing
 * one costs a detail, not the game.
 */
export interface AssetPlan {
  essential: string[];
  decorative: string[];
}

export function assetPlan(scene: { art: { base: string; foreground?: string | null }; bonus?: { sprite?: string | null } | null }, targetUrls: readonly string[]): AssetPlan {
  const essential = new Set<string>([scene.art.base, ...targetUrls]);
  const decorative = new Set<string>();
  if (scene.art.foreground) decorative.add(scene.art.foreground);
  if (scene.bonus?.sprite) decorative.add(scene.bonus.sprite);
  for (const url of essential) decorative.delete(url);
  return { essential: [...essential], decorative: [...decorative] };
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

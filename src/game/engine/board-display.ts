import displayArt from "../../../content/board-display-art.json";
import type { SceneConfig } from "@/domain/game/config";

/** Delivery only. Immutable canonical art/configs still govern painting and review.
 * A new filename binds both source and display bytes; old/unbound boards retain
 * their original URL. Preload and the mounted image must use this same resolver.
 */
export function resolveDisplayBoardUrl(scene: SceneConfig, board?: { artSha256: string; art?: { base: string } }): string {
  if (!board || (board.art && board.art.base !== scene.art.base)) return scene.art.base;
  const match = displayArt.find(entry => entry.source === scene.art.base
    && entry.sourceSha256 === board.artSha256 && entry.width === scene.art.width
    && entry.height === scene.art.height && entry.recipe === "webp-near60/v1");
  return match?.display ?? scene.art.base;
}

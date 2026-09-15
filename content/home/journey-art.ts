import { ADVENTURE_DENSITY_BOARDS } from "../adventures/density-boards";

/** Approved presentation art, never a replacement for a saved game's scene.
 * Personal sprites and postcard crops must stay pinned to that game's base. */
export function journeyPresentation(slug: string) {
  const board = ADVENTURE_DENSITY_BOARDS.boards.find(b => b.boardSlug === `adventure-${slug}`);
  if (!board || board.status !== "ready") return undefined;
  return {
    base: board.art.base,
    sha256: board.art.sha256,
    version: board.sceneVersion,
    thumbnail: `${board.art.base.replace("base.webp", "thumb.webp")}?v=${board.art.sha256.slice(0, 16)}`,
    discoveries: board.discoveries,
  };
}

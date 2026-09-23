import { boardPresentation } from "./board-presentation";

/** Approved presentation art, never a replacement for a saved game's scene.
 * Personal sprites and postcard crops must stay pinned to that game's base. */
export function journeyPresentation(slug: string) {
  const board = boardPresentation(slug);
  return board?.world === "journey" ? board : undefined;
}

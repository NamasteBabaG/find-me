import boards from "./board-presentation.json";

/** Public display only. NEVER rebind a saved game's art, target or postcard
 * geometry through this resolver. The manifest contains no personal assets. */
export function boardPresentation(slug: string) {
  return boards.find(board => board.route === slug || board.board === slug);
}

/** The first actual approved board represents a world in the creation picker.
 * World maps remain maps, and unrefreshed worlds keep their existing cover. */
export function worldPresentation(world: string) {
  return boards.find(board => board.world === world);
}

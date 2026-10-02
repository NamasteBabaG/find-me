import previews from "../../../content/home/board-presentation.json";

/** Display only: match the saved board's immutable pixels, never its name or route.
 * The original board remains the source for play, zoom, generation and keepsakes.
 */
export function boardThumbnail(scene: { slug: string; art: { base: string; thumbnail: string } }, book?: { boards: readonly { boardSlug: string; art: { base: string }; artSha256?: string }[] }): string {
  const binding = book?.boards.find(b => b.boardSlug === scene.slug && b.art.base === scene.art.base);
  const prepared = binding?.artSha256 && previews.find(p => p.base === scene.art.base && p.sha256 === binding.artSha256);
  return prepared ? prepared.thumbnail : scene.art.thumbnail;
}

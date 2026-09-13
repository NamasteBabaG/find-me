import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { GameConfig } from "@/domain/game/config";
import { AdventureCatalogSchema, type AdventureCatalog } from "@/domain/adventure/content";
import { AdventureError, attachAdventureBook } from "@/domain/adventure/compose";

/** Read-only authoring gate; never generates art or changes live catalogs. */
export async function validateAdventureAssets(raw: AdventureCatalog, publicRoot: string) {
  const catalog = AdventureCatalogSchema.parse(raw);
  const ready = catalog.boards.filter(b => b.status === "ready");
  // A planned-only catalog does not require any art or even a public directory.
  if (!ready.length) return { planned: catalog.boards.length, ready: 0 };
  const root = await realpath(publicRoot);
  for (const board of ready) {
    const assetPath = await realpath(path.join(root, board.art.base.slice(1)));
    const relative = path.relative(root, assetPath);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new AdventureError("content-mismatch", board.boardSlug);
    const bytes = await readFile(assetPath);
    if (createHash("sha256").update(bytes).digest("hex") !== board.art.sha256) throw new AdventureError("content-mismatch", `${board.boardSlug}:art-hash`);
    const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (metadata.width !== board.art.width || metadata.height !== board.art.height || (metadata.pages ?? 1) !== 1) throw new AdventureError("content-mismatch", `${board.boardSlug}:art-dimensions`);
  }
  return { planned: catalog.boards.length - ready.length, ready: ready.length };
}

/** Future publication calls this AFTER the personal targets exist. Existing
 * publication is not redirected here. Structural checks cannot certify faces,
 * similarity, invisible seams or visual object recognition.
 */
export async function prepareAdventureConfig(config: GameConfig, catalog: AdventureCatalog, boardSlugs: readonly string[], publicRoot: string): Promise<GameConfig> {
  const selected = { ...catalog, boards: catalog.boards.filter(b => boardSlugs.includes(b.boardSlug)) };
  const result = attachAdventureBook(config, selected, boardSlugs);
  await validateAdventureAssets(selected, publicRoot);
  return result;
}

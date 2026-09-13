import { z } from "zod";
import { AdventureRect } from "./content";

export const AssetId = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const BookImageSchema = z.object({ assetId: AssetId, rect: AdventureRect, hitRect: AdventureRect }).strict();
export type BookImage = z.infer<typeof BookImageSchema>;

/** Published GAME asset identity, without expiring signatures or private URLs.
 * Asset IDs must remain immutable at the asset service; this is not a byte hash.
 */
export function gameAssetId(url: string): string | null {
  return /^\/api\/assets\/([A-Za-z0-9_-]{1,160})(?:\?[^#]*)?$/.exec(url)?.[1] ?? null;
}

export function bindBookImage(sprite: { kind: string; url?: string; rect?: AdventureRect; hitRect?: AdventureRect }): BookImage | null {
  const assetId = sprite.kind === "image" && sprite.url ? gameAssetId(sprite.url) : null;
  if (!assetId || !sprite.rect || !sprite.hitRect) return null;
  const parsed = BookImageSchema.safeParse({ assetId, rect: sprite.rect, hitRect: sprite.hitRect });
  return parsed.success ? parsed.data : null;
}

export function sameBookImage(a: BookImage | null, b: BookImage): boolean {
  const rectEqual = (x: AdventureRect, y: AdventureRect) => x.x === y.x && x.y === y.y && x.w === y.w && x.h === y.h;
  return a !== null && a.assetId === b.assetId && rectEqual(a.rect, b.rect) && rectEqual(a.hitRect, b.hitRect);
}

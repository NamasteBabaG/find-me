import type { AdventureBook } from "./book-schema";
import { AdventureRect } from "./content";

/** Exact art-coordinate hit, independent of portrait/landscape pixel size.
 * The viewport owns screen→art conversion and touch padding. Ambiguity never
 * picks the first scanned object. Does not enable any new live hit targets.
 */
export function discoveryAt(board: AdventureBook["boards"][number], x: number, y: number): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  const hits = board.discoveries.filter(d => x >= d.hitRect.x && x <= d.hitRect.x + d.hitRect.w && y >= d.hitRect.y && y <= d.hitRect.y + d.hitRect.h);
  return hits.length === 1 ? hits[0]!.id : null;
}

/** Match the pixel rounding used when cutting shared cards or postcard crops. */
export function cropPixels(rect: AdventureRect, width: number, height: number) {
  rect = AdventureRect.parse(rect);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("Invalid art dimensions");
  const left = Math.floor(rect.x * width), top = Math.floor(rect.y * height);
  // Avoid growing a crop one pixel because 0.1 + 0.2 is 0.30000000000000004.
  const right = Math.min(width, Math.max(left + 1, Math.ceil((rect.x + rect.w) * width - 1e-9)));
  const bottom = Math.min(height, Math.max(top + 1, Math.ceil((rect.y + rect.h) * height - 1e-9)));
  return { left, top, width: right - left, height: bottom - top };
}

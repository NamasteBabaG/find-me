import type { AdventureRect } from "./content";

export type DiscoveryHintLevel = 0 | 1 | 2 | 3;
export const nextDiscoveryHint = (level: DiscoveryHintLevel): DiscoveryHintLevel => Math.min(3, level + 1) as DiscoveryHintLevel;

/** Level 1 is words only. The broad region is deliberately quantized so its
 * centre does not disclose the object's precise centre. All geometry is board-normalized. */
export function discoveryHintRect(hit: AdventureRect, level: DiscoveryHintLevel): AdventureRect | null {
  if (level < 2) return null;
  if (level === 2) {
    const w = .36, h = .4;
    const cx = (Math.floor((hit.x + hit.w / 2) * 3) + .5) / 3;
    const cy = (Math.floor((hit.y + hit.h / 2) * 3) + .5) / 3;
    const bx = Math.max(0, Math.min(1 - w, cx - w / 2)), by = Math.max(0, Math.min(1 - h, cy - h / 2));
    const x = Math.min(bx, hit.x), y = Math.min(by, hit.y);
    return { x, y, w: Math.max(bx + w, hit.x + hit.w) - x, h: Math.max(by + h, hit.y + hit.h) - y };
  }
  const x = Math.max(0, hit.x - .008), y = Math.max(0, hit.y - .014);
  return { x, y, w: Math.min(1 - x, hit.x + hit.w + .008 - x), h: Math.min(1 - y, hit.y + hit.h + .014 - y) };
}

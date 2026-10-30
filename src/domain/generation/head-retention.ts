import { z } from 'zod';
import { LOCAL_PATCH_RETURN_FEATHER } from '../scene/local-patch-return-region';

/** Measured crown retention in the composition's blended return band. The paid
 * answer's located head says WHERE to look; these pixels say whether SHIPPING
 * kept what the paid painting drew there. A refusal signal, never an approval. */
export const HEAD_RETENTION_VERSION = 'head-retention/v1' as const;
/** Fixed from the composition and the player's view, not fitted to samples.
 * - band: the return feather; only these pixels are ever blended with the scene.
 * - lossLevel: a shipped pixel moved >=24/255 (~9%) in some channel from the painting.
 * - noveltyLevel/sourceRadius: that painted colour is >=32 away from every original
 *   scene pixel just outside the return within depth+1+3 px. Redrawn background,
 *   shifted strokes and transparent decoration over the same scene are explained by
 *   the scene and are not target loss. A crop edge offers no scene, so it explains nothing.
 * - attachTolerance/attachReach: a lost cluster counts only when the painting continues
 *   from it into the opaque interior: a path through RAW pixels within 40 of the cluster's
 *   mean colour, at most 24 px beyond the cluster, reaches depth >= band. A crown fading at
 *   the edge continues into the rest of its head; a novel background stroke feathered away
 *   in an empty corner of the located box does not. This is a refusal signal, not a
 *   segmentation of the child: an attached novel object can still be counted.
 * - minLostPixels: isolated pixels are dropped; 16 connected lost pixels (a 2px fade
 *   along 8px of crown edge) is the smallest crown fade treated as visible. */
export const HEAD_RETENTION_TOLERANCE = { band: LOCAL_PATCH_RETURN_FEATHER, lossLevel: 24, noveltyLevel: 32, sourceRadius: 3,
  attachTolerance: 40, attachReach: 24, minLostPixels: 16 } as const;
const integer = z.number().int().nonnegative();
export const headRetentionSchema = z.object({ version: z.literal(HEAD_RETENTION_VERSION), band: z.literal(12), lossLevel: z.literal(24),
  noveltyLevel: z.literal(32), sourceRadius: z.literal(3), attachTolerance: z.literal(40), attachReach: z.literal(24),
  returned: z.object({ left: integer, top: integer, width: integer, height: integer }).strict(), bandPixels: integer,
  lost: z.string().max(8192).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict();
export type HeadRetention = z.infer<typeof headRetentionSchema>;
export type HeadRetentionPixels = { readonly data: Uint8Array; readonly width: number; readonly height: number; readonly channels: number };
type Rect = { left: number; top: number; width: number; height: number };

const depth = (r: Rect, x: number, y: number) => Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y);
/** Band pixels in one canonical order: rows top to bottom, then columns. */
function bandPixels(r: Rect, band: number) {
  const out: [number, number, number][] = [];
  for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
    const d = depth(r, x, y); if (d < band) out.push([x, y, d]);
  }
  return out;
}
const inside = (r: Rect, x: number, y: number) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;

/** Crop-local RAW and SHIPPING of one candidate; the caller authenticates both. */
export function measureHeadRetention(raw: HeadRetentionPixels, shipping: HeadRetentionPixels, returned: Rect): HeadRetention {
  const { band, lossLevel, noveltyLevel, sourceRadius } = HEAD_RETENTION_TOLERANCE, w = raw.width, h = raw.height;
  if (w !== shipping.width || h !== shipping.height || raw.channels < 3 || shipping.channels < 3
    || raw.data.length !== w * h * raw.channels || shipping.data.length !== w * h * shipping.channels
    || ![returned.left, returned.top, returned.width, returned.height].every(Number.isSafeInteger) || returned.width < 1 || returned.height < 1
    || returned.left < 0 || returned.top < 0 || returned.left + returned.width > w || returned.top + returned.height > h)
    throw Error('HEAD_RETENTION: aligned crop-local RAW and SHIPPING with an in-bounds return required');
  const rc = raw.channels, sc = shipping.channels, pixels = bandPixels(returned, band), bits = new Uint8Array(Math.ceil(pixels.length / 8));
  const lost = new Int32Array(w * h).fill(-1);
  pixels.forEach(([x, y, d], index) => {
    const p = (y * w + x) * rc, s = (y * w + x) * sc;
    let loss = 0;
    for (let c = 0; c < 3; c++) loss = Math.max(loss, Math.abs(raw.data[p + c]! - shipping.data[s + c]!));
    if (loss < lossLevel) return;
    // Outside the return SHIPPING is the untouched scene: does it already show this colour nearby?
    const reach = d + 1 + sourceRadius;
    for (let yy = Math.max(0, y - reach); yy <= Math.min(h - 1, y + reach); yy++) for (let xx = Math.max(0, x - reach); xx <= Math.min(w - 1, x + reach); xx++) {
      if (inside(returned, xx, yy)) continue;
      const q = (yy * w + xx) * sc;
      let gap = 0;
      for (let c = 0; c < 3; c++) gap = Math.max(gap, Math.abs(raw.data[p + c]! - shipping.data[q + c]!));
      if (gap < noveltyLevel) return;
    }
    lost[y * w + x] = index;
  });
  // Keep only clusters whose painted content continues into the opaque interior.
  const { attachTolerance, attachReach } = HEAD_RETENTION_TOLERANCE, seen = new Uint8Array(w * h);
  const rgb = (p: number) => [raw.data[p * rc]!, raw.data[p * rc + 1]!, raw.data[p * rc + 2]!];
  for (const [x0, y0] of pixels) {
    const start = y0 * w + x0;
    if (lost[start]! < 0 || seen[start]) continue;
    const cluster: number[] = [start]; seen[start] = 1;
    for (let i = 0; i < cluster.length; i++) {
      const p = cluster[i]!, x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, q = yy * w + xx;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && lost[q]! >= 0 && !seen[q]) { seen[q] = 1; cluster.push(q); }
      }
    }
    const mean = [0, 1, 2].map(c => cluster.reduce((sum, p) => sum + rgb(p)[c]!, 0) / cluster.length);
    let left = w, top = h, right = 0, bottom = 0;
    for (const p of cluster) { const x = p % w, y = (p - x) / w; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
    left -= attachReach; top -= attachReach; right += attachReach; bottom += attachReach;
    const visited = new Uint8Array(w * h), queue = [...cluster];
    for (const p of cluster) visited[p] = 1;
    let attached = false;
    for (let i = 0; i < queue.length && !attached; i++) {
      const p = queue[i]!, x = p % w, y = (p - x) / w;
      for (let dy = -1; dy <= 1 && !attached; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, q = yy * w + xx;
        if (!(dx || dy) || xx < left || yy < top || xx > right || yy > bottom || !inside(returned, xx, yy) || visited[q]) continue;
        const colour = rgb(q);
        if (Math.max(...[0, 1, 2].map(c => Math.abs(colour[c]! - mean[c]!))) > attachTolerance) continue;
        if (depth(returned, xx, yy) >= band) { attached = true; break; }
        visited[q] = 1; queue.push(q);
      }
    }
    if (attached) for (const p of cluster) { const index = lost[p]!; bits[index >> 3]! |= 1 << (index & 7); }
  }
  return { version: HEAD_RETENTION_VERSION, band, lossLevel, noveltyLevel, sourceRadius, attachTolerance, attachReach,
    returned: { left: returned.left, top: returned.top, width: returned.width, height: returned.height },
    bandPixels: pixels.length, lost: Buffer.from(bits).toString('base64') };
}

/** Connected lost target pixels inside the located heads, or null for a measurement
 * that does not belong to this return (wrong size, padding or encoding). */
export function headRetentionLostPixels(measurement: unknown, returned: Rect, heads: readonly Rect[], width = 512, height = 768): number | null {
  const parsed = headRetentionSchema.safeParse(measurement); if (!parsed.success) return null;
  const r = parsed.data.returned;
  if (r.left !== returned.left || r.top !== returned.top || r.width !== returned.width || r.height !== returned.height) return null;
  const pixels = bandPixels(returned, parsed.data.band), bits = Buffer.from(parsed.data.lost, 'base64');
  if (pixels.length !== parsed.data.bandPixels || bits.length !== Math.ceil(pixels.length / 8) || bits.toString('base64') !== parsed.data.lost
    || pixels.length % 8 && bits[bits.length - 1]! >> (pixels.length % 8)) return null;
  const lost = new Uint8Array(width * height);
  pixels.forEach(([x, y], index) => { if (bits[index >> 3]! & (1 << (index & 7))) lost[y * width + x] = 1; });
  let count = 0;
  for (const [x, y] of pixels) {
    if (!lost[y * width + x] || !heads.some(head => inside(head, x, y))) continue;
    let connected = false;
    for (let dy = -1; dy <= 1 && !connected; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if ((dx || dy) && xx >= 0 && yy >= 0 && xx < width && yy < height && lost[yy * width + xx]) { connected = true; break; }
    }
    if (connected) count++;
  }
  return count;
}

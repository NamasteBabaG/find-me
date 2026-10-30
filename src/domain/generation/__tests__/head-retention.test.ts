import { describe, expect, it } from 'vitest';
import { HEAD_RETENTION_TOLERANCE, headRetentionLostPixels, measureHeadRetention, type HeadRetentionPixels } from '../head-retention';

// Synthetic public fixtures only: a striped scene, a painted target head and the
// composition's own 12px linear return feather, all on crop-local 512x768 axes.
const W = 512, H = 768, returned = { left: 100, top: 200, width: 300, height: 400 };
type RGB = readonly [number, number, number];
const image = (paint: (x: number, y: number) => RGB): HeadRetentionPixels => {
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(paint(x, y), (y * W + x) * 3);
  return { data, width: W, height: H, channels: 3 };
};
const stripes = (shift = 0) => (x: number, _y: number): RGB => Math.floor((x + shift) / 6) % 2 ? [40, 60, 90] : [200, 210, 230];
const HAIR: RGB = [90, 50, 20];
const inBox = (b: { left: number; top: number; width: number; height: number }, x: number, y: number) =>
  x >= b.left && x < b.left + b.width && y >= b.top && y < b.top + b.height;
/** The composition: the scene outside the return, a linear 12px feather inside it. */
function ship(raw: HeadRetentionPixels, scene: HeadRetentionPixels, r = returned) {
  const data = new Uint8Array(scene.data);
  for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
    const edge = Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y), w = Math.min(1, (edge + 0.5) / 12);
    for (let c = 0; c < 3; c++) data[(y * W + x) * 3 + c] = Math.round(raw.data[(y * W + x) * 3 + c]! * w + scene.data[(y * W + x) * 3 + c]! * (1 - w));
  }
  return { data, width: W, height: H, channels: 3 };
}
const scene = image(stripes());
const painted = (head: { left: number; top: number; width: number; height: number }, background = stripes()) =>
  image((x, y) => inBox(head, x, y) ? HAIR : background(x, y));
const lost = (raw: HeadRetentionPixels, head: { left: number; top: number; width: number; height: number }, shipped = ship(raw, scene)) =>
  headRetentionLostPixels(measureHeadRetention(raw, shipped, returned), returned, [head]);

describe('measured target head retention in the blended return band', () => {
  it('finds nothing to refuse when the whole head sits in the opaque interior', () => {
    const head = { left: 200, top: 220, width: 80, height: 90 };
    expect(lost(painted(head), head)).toBe(0);
  });
  it('counts a crown blended into the scene three pixels inside the return edge', () => {
    const head = { left: 200, top: 203, width: 80, height: 90 };
    expect(lost(painted(head), head)).toBeGreaterThanOrEqual(HEAD_RETENTION_TOLERANCE.minLostPixels);
  });
  it('still sees a smaller real fade whose crown begins eight pixels inside', () => {
    // Rows 8 and 9 keep under 76% of the painting over a high-contrast scene.
    const head = { left: 200, top: 208, width: 60, height: 90 };
    expect(lost(painted(head), head)).toBeGreaterThanOrEqual(HEAD_RETENTION_TOLERANCE.minLostPixels);
  });
  it('documents the tolerance: a 2px strand fading into the head below 16 connected pixels is not a refusal', () => {
    // The strand continues into the head (attached); only its outer rows lose more than 24 levels.
    const head = { left: 200, top: 220, width: 80, height: 90 }, tuft = { left: 236, top: 203, width: 2, height: 17 };
    const raw = image((x, y) => inBox(head, x, y) || inBox(tuft, x, y) ? HAIR : stripes()(x, y));
    const count = lost(raw, { left: 200, top: 203, width: 80, height: 107 })!;
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(HEAD_RETENTION_TOLERANCE.minLostPixels);
  });
  it('does not count redrawn, shifted background that the original scene already shows', () => {
    // The painter redrew the stripes 3px over: large per-pixel loss, but no new content.
    const head = { left: 200, top: 220, width: 80, height: 90 }, raw = painted(head, stripes(3));
    const located = { left: 190, top: 200, width: 100, height: 110 };
    const measurement = measureHeadRetention(raw, ship(raw, scene), returned);
    expect(headRetentionLostPixels(measurement, returned, [located])).toBe(0);
  });
  it('does not count transparent decoration that stays close to its own scene colour', () => {
    const head = { left: 200, top: 220, width: 80, height: 90 }, ring = { left: 190, top: 203, width: 100, height: 4 };
    const raw = image((x, y) => inBox(head, x, y) ? HAIR : inBox(ring, x, y)
      ? stripes()(x, y).map(v => Math.min(255, v + 24)) as unknown as RGB : stripes()(x, y));
    expect(lost(raw, { left: 190, top: 203, width: 100, height: 107 })).toBe(0);
  });
  it('does not count novel background negative space feathered away in a corner of the located box', () => {
    // Codex review 2026-10-30: the box encloses empty corners; every crown pixel ships unchanged,
    // while a new painted background stroke in the corner is blended away by the feather.
    const head = { left: 200, top: 203, width: 100, height: 107 };
    const hairAt = (x: number, y: number) => x >= 200 && x < 300 && y >= 220 && y < 310 || x >= 243 && x < 257 && y >= 203 && y < 220;
    const background: RGB = [100, 130, 160], hair: RGB = [70, 40, 20];
    const sceneRgb = (x: number, y: number): RGB => hairAt(x, y) && y < 212 ? hair : background;
    const rawRgb = (x: number, y: number): RGB => hairAt(x, y) ? hair : x >= 204 && x < 232 && y >= 203 && y < 208 ? [5, 220, 210] : background;
    const raw = image(rawRgb), shipped = ship(raw, image(sceneRgb));
    let alteredCrown = 0;
    for (let y = head.top; y < head.top + head.height; y++) for (let x = head.left; x < head.left + head.width; x++) if (hairAt(x, y)) {
      const p = (y * W + x) * 3; if ([0, 1, 2].some(c => raw.data[p + c] !== shipped.data[p + c])) alteredCrown++;
    }
    expect(alteredCrown).toBe(0);
    expect(lost(raw, head, shipped)).toBe(0);
  });
  it('still counts a lost cluster when its painted content continues into the interior (a signal, not segmentation)', () => {
    // A novel object attached to interior content cannot be told apart from hair by pixels alone;
    // the guard reports it, and the free window correction rather than a repaint resolves it.
    const head = { left: 200, top: 203, width: 100, height: 107 }, pole = { left: 206, top: 203, width: 10, height: 60 };
    const raw = image((x, y) => inBox(pole, x, y) ? [5, 220, 210] : inBox({ left: 230, top: 230, width: 60, height: 80 }, x, y) ? HAIR : stripes()(x, y));
    expect(lost(raw, head)).toBeGreaterThanOrEqual(HEAD_RETENTION_TOLERANCE.minLostPixels);
  });
  it('accepts a crown in the band when shipping kept exactly what the painting drew there', () => {
    // Sweet-like: the scene already matches the painting where the band crosses the crown.
    const head = { left: 200, top: 203, width: 80, height: 90 }, raw = painted(head);
    const sameScene = image((x, y) => inBox(head, x, y) && y < 215 ? HAIR : stripes()(x, y));
    expect(lost(raw, head, ship(raw, sameScene))).toBe(0);
  });
  it('treats a return touching the crop edge as unexplained, so a faded crown there is refused', () => {
    const edge = { left: 100, top: 0, width: 300, height: 400 }, head = { left: 200, top: 3, width: 80, height: 90 }, raw = painted(head);
    const measurement = measureHeadRetention(raw, ship(raw, scene, edge), edge);
    expect(headRetentionLostPixels(measurement, edge, [head])).toBeGreaterThanOrEqual(HEAD_RETENTION_TOLERANCE.minLostPixels);
  });
  it('rejects a measurement that does not belong to this return', () => {
    const head = { left: 200, top: 203, width: 80, height: 90 }, m = measureHeadRetention(painted(head), ship(painted(head), scene), returned);
    expect(headRetentionLostPixels({ ...m, bandPixels: m.bandPixels + 1 }, returned, [head])).toBeNull();
    expect(headRetentionLostPixels(m, { ...returned, top: returned.top + 1 }, [head])).toBeNull();
    expect(headRetentionLostPixels({ ...m, lost: m.lost.slice(4) }, returned, [head])).toBeNull();
    expect(headRetentionLostPixels({ ...m, version: 'head-retention/v0' }, returned, [head])).toBeNull();
    expect(headRetentionLostPixels({ ...m, lossLevel: 8 }, returned, [head])).toBeNull();
    // A full return's band is 24(w+h)-576 pixels, a whole number of bytes; a tiny one leaves padding that must stay zero.
    const tiny = { left: 10, top: 10, width: 10, height: 10 }, t = measureHeadRetention(scene, scene, tiny);
    expect(t.bandPixels).toBe(100);
    const padded = Buffer.from(t.lost, 'base64'); padded[padded.length - 1]! |= 0x80;
    expect(headRetentionLostPixels(t, tiny, [tiny])).toBe(0);
    expect(headRetentionLostPixels({ ...t, lost: padded.toString('base64') }, tiny, [tiny])).toBeNull();
  });
  it('refuses misaligned pixels or an out-of-bounds return rather than measuring them', () => {
    const raw = painted({ left: 200, top: 220, width: 80, height: 90 });
    expect(() => measureHeadRetention(raw, { ...raw, width: 511 }, returned)).toThrow('aligned crop-local');
    expect(() => measureHeadRetention(raw, raw, { ...returned, left: 300 })).toThrow('aligned crop-local');
  });
});

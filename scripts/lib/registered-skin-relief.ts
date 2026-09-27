import sharp from 'sharp';

/** Offline A/B diagnostic only. Not a generator or a runtime recipe. */
export const RELIEF_PROBE_VERSION = 'registered-luminance-relief-probe-v1';
type Plane = { data: Float64Array; width: number; height: number };
export type Alignment = { dx: number; dy: number; scale: number; correlation: number };
export type Window = { left: number; top: number; width: number; height: number };
const sample = (p: Plane, x: number, y: number) => {
  x = Math.max(0, Math.min(p.width - 1, x)); y = Math.max(0, Math.min(p.height - 1, y));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const at = (a: number, b: number) => p.data[Math.min(b, p.height - 1) * p.width + Math.min(a, p.width - 1)]!;
  return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy)
    + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
};
const luminance = (rgb: Buffer, width: number, height: number): Plane => ({ width, height,
  data: Float64Array.from({ length: width * height }, (_, p) => .299 * rgb[p * 3]! + .587 * rgb[p * 3 + 1]! + .114 * rgb[p * 3 + 2]!) });
const gradient = (p: Plane, x: number, y: number) => [sample(p, x + 1, y) - sample(p, x - 1, y), sample(p, x, y + 1) - sample(p, x, y - 1)] as const;

export function registerRelief(original: Plane, candidate: Plane, alpha: Buffer, window: Window): Alignment {
  const cx = window.left + window.width / 2, cy = window.top + window.height / 2;
  const points: { x: number; y: number; gx: number; gy: number }[] = [];
  for (let y = window.top + 2; y < window.top + window.height - 2; y += 2) {
    for (let x = window.left + 2; x < window.left + window.width - 2; x += 2) {
      if (alpha[(y * original.width + x) * 4 + 3]! < 250) continue;
      const [gx, gy] = gradient(original, x, y); points.push({ x, y, gx, gy });
    }
  }
  if (points.length < 32) throw Error('RELIEF: insufficient registration area');
  const score = (dx: number, dy: number, scale: number) => {
    let ab = 0, aa = 0, bb = 0;
    for (const p of points) {
      const [gx, gy] = gradient(candidate, cx + (p.x - cx - dx) / scale, cy + (p.y - cy - dy) / scale);
      ab += p.gx * gx + p.gy * gy; aa += p.gx ** 2 + p.gy ** 2; bb += gx ** 2 + gy ** 2;
    }
    return aa && bb ? ab / Math.sqrt(aa * bb) : -1;
  };
  let best: Alignment = { dx: 0, dy: 0, scale: 1, correlation: score(0, 0, 1) };
  const consider = (dx: number, dy: number, scale: number) => {
    const correlation = score(dx, dy, scale);
    if (correlation > best.correlation + 1e-10) best = { dx, dy, scale, correlation };
  };
  for (let s = 92; s <= 110; s += 2) for (let dy = -10; dy <= 10; dy += 2) for (let dx = -10; dx <= 10; dx += 2) consider(dx, dy, s / 100);
  const coarse = best;
  for (let s = -4; s <= 4; s++) for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) consider(coarse.dx + x * .5, coarse.dy + y * .5, coarse.scale + s * .005);
  return best;
}

/** Feather inward only. Mask holes and the exterior remain byte-exact. */
function feather(alpha: Buffer, width: number, height: number) {
  const distance = Float64Array.from({ length: width * height }, (_, p) => alpha[p * 4 + 3]! > 127 ? 1e6 : 0);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = y * width + x;
    distance[p] = Math.min(distance[p]!, x ? distance[p - 1]! + 1 : 0, y ? distance[p - width]! + 1 : 0);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const p = y * width + x;
    distance[p] = Math.min(distance[p]!, x < width - 1 ? distance[p + 1]! + 1 : 0, y < height - 1 ? distance[p + width]! + 1 : 0);
  }
  return Float64Array.from(distance, d => { const t = Math.min(1, d / 5); return t * t * (3 - 2 * t); });
}

export async function reliefProbe(input: { originalPng: Buffer; paintedPng: Buffer; skinAlphaPng: Buffer; headAlphaPng: Buffer; window: Window }) {
  const decode = (b: Buffer) => sharp(b).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [original, painted, skin, head] = await Promise.all([decode(input.originalPng), decode(input.paintedPng),
    sharp(input.skinAlphaPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(input.headAlphaPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })]);
  const { width, height } = original.info;
  if ([painted.info, skin.info, head.info].some(m => m.width !== width || m.height !== height || m.channels !== (m === painted.info ? 3 : 4))) throw Error('RELIEF: dimensions/channels mismatch');
  const w = input.window;
  if (Object.values(w).some(v => !Number.isInteger(v)) || w.left < 0 || w.top < 0 || w.width < 8 || w.height < 8 || w.left + w.width > width || w.top + w.height > height) throw Error('RELIEF: invalid window');
  const before = luminance(original.data, width, height), after = luminance(painted.data, width, height);
  const alignment = registerRelief(before, after, head.data, w), weights = feather(skin.data, width, height);
  if (weights.filter(x => x > 0).length < 16) throw Error('RELIEF: no skin area');
  const cx = w.left + w.width / 2, cy = w.top + w.height / 2;
  const low = async (p: Plane) => {
    const bytes = Buffer.from(p.data.map(v => Math.max(0, Math.min(255, Math.round(v)))));
    return sharp(bytes, { raw: { width, height, channels: 1 } }).blur(3).greyscale().raw().toBuffer();
  };
  const originalLow = await low(before);
  const run = async (registered: boolean) => {
    const a = registered ? alignment : { dx: 0, dy: 0, scale: 1 };
    const warped: Plane = { width, height, data: Float64Array.from(after.data, (_, p) => sample(after, cx + (p % width - cx - a.dx) / a.scale, cy + (Math.floor(p / width) - cy - a.dy) / a.scale)) };
    const paintedLow = await low(warped), out = Buffer.from(original.data), delta = new Float64Array(width * height);
    let changedPixels = 0, protectedChanges = 0, maxChromaChange = 0, boundaryEnergy = 0, originalBoundaryEnergy = 0, band = 0;
    for (let p = 0; p < delta.length; p++) {
      if (!weights[p]) continue;
      const residual = Math.max(-18, Math.min(18, warped.data[p]! - paintedLow[p]!));
      const reliefDelta = Math.round((originalLow[p]! + residual - before.data[p]!) * weights[p]!);
      const rgb = [...original.data.subarray(p * 3, p * 3 + 3)];
      // One bounded RGB offset preserves YCbCr chroma exactly, without per-channel clipping.
      const d = Math.max(-Math.min(...rgb), Math.min(255 - Math.max(...rgb), reliefDelta));
      delta[p] = d;
      for (let c = 0; c < 3; c++) out[p * 3 + c] = rgb[c]! + d;
      if (d) changedPixels++;
    }
    for (let p = 0; p < delta.length; p++) {
      if (!weights[p] && delta[p]) protectedChanges++;
      for (const c of [0, 2]) maxChromaChange = Math.max(maxChromaChange, Math.abs((out[p * 3 + c]! - out[p * 3 + 1]!) - (original.data[p * 3 + c]! - original.data[p * 3 + 1]!)));
      if (weights[p]! <= 0 || weights[p]! >= 1 || p % width >= width - 1 || p + width >= delta.length) continue;
      boundaryEnergy += (Math.abs(delta[p]! - delta[p + 1]!) + Math.abs(delta[p]! - delta[p + width]!)) / 2;
      originalBoundaryEnergy += (Math.abs(before.data[p]! - before.data[p + 1]!) + Math.abs(before.data[p]! - before.data[p + width]!)) / 2; band++;
    }
    if (!band) throw Error('RELIEF: no feather band');
    const outputLow = await low(luminance(out, width, height));
    let lowFieldChange = 0, pixels = 0;
    for (let p = 0; p < delta.length; p++) if (weights[p]) { lowFieldChange += Math.abs(outputLow[p]! - originalLow[p]!); pixels++; }
    return { candidate: await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer(),
      metrics: { changedPixels, protectedChanges, maxChromaChange, boundaryEnergy: boundaryEnergy / band, originalBoundaryEnergy: originalBoundaryEnergy / band, meanLowFieldChange: lowFieldChange / pixels, featherBandPixels: band } };
  };
  return { version: RELIEF_PROBE_VERSION, alignment, unregistered: await run(false), registered: await run(true), requiresVisualReview: true as const };
}

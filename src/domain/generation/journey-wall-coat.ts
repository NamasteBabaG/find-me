import { z } from 'zod';

export const JOURNEY_WALL_COAT_VERSION = 'journey-wall-retained-coat/v1';
export const JOURNEY_WALL_COAT_ACTION = 'generation:' + JOURNEY_WALL_COAT_VERSION;
export const JOURNEY_WALL_COAT_SELECTOR = 'journey-wall-retained-coat-v1';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const journeyWallCoatMarkerSchema = z.object({
  version: z.literal(JOURNEY_WALL_COAT_VERSION), auditId: z.string(),
  previousCandidateSha256: sha, candidateSha256: sha,
}).strict();

// Crop-local landmarks along the same standing child's paid jacket and the
// retained body silhouette. Stop inside the cuff, fingers and pinwheel.
// [output y, RAW y, output left/right, RAW left/right]
const coatRows = [
  [414, 414, 270, 343, 270, 343],
  [420, 420, 269, 339, 269, 339],
  [426, 429, 270, 326, 268, 328],
  [434, 441, 272, 325, 267, 329],
  [442, 454, 272, 325, 267, 332],
  [451, 471, 271, 329, 278, 337],
  [459, 486, 271, 329, 279, 338],
  [464, 499, 271, 328, 279, 338],
  [470, 506, 278, 326, 285, 337],
  [472, 507, 285, 316, 289, 335],
] as const;

const WIDTH = 512, HEIGHT = 768, CHANNELS = 4;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function feather(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
const offset = (x: number, y: number) => (y * WIDTH + x) * CHANNELS;

/** Refit paid cloth to the existing torso. Head, pose anchors, props, other
 * people and the exterior stay on the original compositor's exact pixels. */
export function composeJourneyWallCoat(shipping: Uint8Array, raw: Uint8Array) {
  if (shipping.length !== WIDTH * HEIGHT * CHANNELS || shipping.length !== raw.length)
    throw Error('JOURNEY_WALL_COAT: expected two native RGBA crops');
  const pixels = Uint8Array.from(shipping);
  let changed = 0;
  for (let i = 1; i < coatRows.length; i++) {
    const [fromY, fromRawY, fromL, fromR, fromRawL, fromRawR] = coatRows[i - 1]!;
    const [toY, toRawY, toL, toR, toRawL, toRawR] = coatRows[i]!;
    for (let y = Math.max(421, fromY); y < toY; y++) {
      const t = (y - fromY) / (toY - fromY);
      const rawY = lerp(fromRawY, toRawY, t), left = lerp(fromL, toL, t), right = lerp(fromR, toR, t);
      const rawLeft = lerp(fromRawL, toRawL, t), rawRight = lerp(fromRawR, toRawR, t);
      for (let x = Math.ceil(left); x < right; x++) {
        const weight = feather((y - 414) / 7) * feather((472 - y) / 6)
          * feather((x - left) / 3) * feather((right - x) / 3);
        const rawX = lerp(rawLeft, rawRight, (x - left) / (right - left));
        const fx = Math.floor(rawX), fy = Math.floor(rawY), start = offset(x, y);
        let changedPixel = false;
        for (let c = 0; c < 3; c++) {
          const top = lerp(raw[offset(fx, fy) + c]!, raw[offset(fx + 1, fy) + c]!, rawX - fx);
          const bottom = lerp(raw[offset(fx, fy + 1) + c]!, raw[offset(fx + 1, fy + 1) + c]!, rawX - fx);
          const value = Math.round(lerp(shipping[start + c]!, lerp(top, bottom, rawY - fy), weight));
          pixels[start + c] = value;
          changedPixel ||= value !== shipping[start + c];
        }
        if (changedPixel) changed++;
      }
    }
  }
  return { pixels, changed };
}

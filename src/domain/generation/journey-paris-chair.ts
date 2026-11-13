import { z } from 'zod';

export const JOURNEY_PARIS_CHAIR_VERSION = 'journey-paris-retained-chair/v1';
export const JOURNEY_PARIS_CHAIR_ACTION = 'generation:' + JOURNEY_PARIS_CHAIR_VERSION;
export const JOURNEY_PARIS_CHAIR_SELECTOR = 'journey-paris-retained-chair-v1';
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const journeyParisChairMarkerSchema = z.object({
  version: z.literal(JOURNEY_PARIS_CHAIR_VERSION), auditId: z.string(),
  previousCandidateSha256: sha, candidateSha256: sha,
}).strict();

/** Return the original chair rail where it crosses the left edge of the head
 * polygon. The authored rail stays left of the original registered head. */
export function composeJourneyParisChair(shipping: Uint8Array, source: Uint8Array, headMask: Uint8Array) {
  const width = 512, height = 768, channels = 4;
  if (shipping.length !== width * height * channels || source.length !== shipping.length || headMask.length !== width * height)
    throw Error('JOURNEY_PARIS_CHAIR: expected native RGBA and head mask');
  const pixels = Uint8Array.from(shipping);
  let changed = 0;
  for (let y = 241; y < 350; y++) {
    const right = y <= 251 ? 153 : y <= 266 ? 159 : 160;
    for (let x = 124; x <= right; x++) {
      const i = y * width + x;
      if (!headMask[i]) continue;
      const offset = i * channels, old = shipping.subarray(offset, offset + channels);
      const original = source.subarray(offset, offset + channels);
      if (original.some((value, channel) => value !== old[channel])) changed++;
      pixels.set(original, offset);
    }
  }
  return { pixels, changed };
}

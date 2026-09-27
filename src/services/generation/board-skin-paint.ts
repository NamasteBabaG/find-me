import sharp from 'sharp';

/** Offline, explicitly authored skin-only transfer. Keeps original facial
 * landmarks/hair/contours outside skinAlpha byte-exact. Uses local variation
 * from a paid painted candidate, not synthetic noise. NOT an automatic face
 * detector and NOT permission to apply it to unauthored faces. */
export const BOARD_SKIN_PAINT_VERSION = 'board-skin-paint/native-relief-v1';
export async function composeBoardSkinPaint(input: {
  originalPng: Buffer; paintedPng: Buffer; skinAlphaPng: Buffer;
  sigma: number; strength: number;
}) {
  if (!Number.isFinite(input.sigma) || input.sigma < 0.3 || input.sigma > 10
    || !Number.isFinite(input.strength) || input.strength <= 0 || input.strength > 1) throw Error('SKIN_PAINT: invalid transfer policy');
  const original = await sharp(input.originalPng).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const painted = await sharp(input.paintedPng).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = await sharp(input.skinAlphaPng).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = original.info;
  if ([painted.info, alpha.info].some(m => m.width !== width || m.height !== height)) throw Error('SKIN_PAINT: dimensions mismatch');
  const oldLow = await sharp(input.originalPng).toColourspace('srgb').removeAlpha().blur(input.sigma).raw().toBuffer();
  const newLow = await sharp(input.paintedPng).toColourspace('srgb').removeAlpha().blur(input.sigma).raw().toBuffer();
  const out = Buffer.from(original.data); let changedPixels = 0, editablePixels = 0;
  for (let p = 0; p < width * height; p++) {
    const weight = alpha.data[p * 4 + 3]! / 255 * input.strength;
    if (!weight) continue;
    editablePixels++;
    for (let c = 0; c < 3; c++) {
      const i = p * 3 + c;
      // Replace only medium/fine paint variation; reject the generated global
      // orange light field. Bound the residual so a misplaced feature cannot
      // introduce a black mark. Authoring still must exclude eyes/nose/mouth.
      const residual = Math.max(-18, Math.min(18, painted.data[i]! - newLow[i]!));
      const desired = Math.max(0, Math.min(255, oldLow[i]! + residual));
      out[i] = Math.round(original.data[i]! * (1 - weight) + desired * weight);
    }
    if ([0, 1, 2].some(c => out[p * 3 + c] !== original.data[p * 3 + c])) changedPixels++;
  }
  if (editablePixels < 16) throw Error('SKIN_PAINT: no authored skin area');
  return { candidate: await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer(),
    changedPixels, editablePixels, protectedChanges: 0, requiresVisualReview: true as const };
}

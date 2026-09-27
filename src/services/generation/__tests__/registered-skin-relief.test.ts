import { expect, it } from 'vitest';
import sharp from 'sharp';
import { reliefProbe } from '../../../../scripts/lib/registered-skin-relief';

async function fixture() {
  const originalPng = await sharp(Buffer.from('<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#ad9870"/><path d="M19 18L42 40M24 15L20 45M40 17L44 49" stroke="#847153" stroke-width="3"/></svg>')).png().toBuffer();
  const paintedPng = await sharp(originalPng).extract({ left: 0, top: 0, width: 60, height: 62 }).extend({ left: 4, top: 2, right: 0, bottom: 0, background: '#ad9870' }).png().toBuffer();
  const skinAlphaPng = await sharp(Buffer.from('<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><path fill="white" fill-rule="evenodd" d="M16 16H48V48H16ZM26 26H32V32H26Z"/></svg>')).png().toBuffer();
  return { originalPng, paintedPng, skinAlphaPng, headAlphaPng: skinAlphaPng, window: { left: 12, top: 12, width: 40, height: 40 } };
}
it('recovers a synthetic translation and retains protected RGB pixels and chroma in both arms', async () => {
  const input = await fixture(), result = await reliefProbe(input);
  expect(result.alignment.dx).toBeCloseTo(-4, 0); expect(result.alignment.dy).toBeCloseTo(-2, 0);
  expect(result.alignment.scale).toBeCloseTo(1, 1);
  const original = await sharp(input.originalPng).removeAlpha().raw().toBuffer();
  const mask = await sharp(input.skinAlphaPng).ensureAlpha().raw().toBuffer();
  for (const arm of [result.registered, result.unregistered]) {
    const after = await sharp(arm.candidate).raw().toBuffer();
    for (let p = 0; p < 4096; p++) if (mask[p * 4 + 3]! <= 127) expect(after.subarray(p * 3, p * 3 + 3)).toEqual(original.subarray(p * 3, p * 3 + 3));
    expect(arm.metrics.protectedChanges).toBe(0); expect(arm.metrics.maxChromaChange).toBe(0);
    expect(Number.isFinite(arm.metrics.boundaryEnergy)).toBe(true);
  }
  expect(result.requiresVisualReview).toBe(true);
});
it('does not claim immutable low-frequency illumination and refuses invalid geometry', async () => {
  const input = await fixture(), result = await reliefProbe(input);
  expect(result.registered.metrics.meanLowFieldChange).toBeGreaterThanOrEqual(0);
  await expect(reliefProbe({ ...input, window: { ...input.window, left: -1 } })).rejects.toThrow('window');
  await expect(reliefProbe({ ...input, paintedPng: await sharp(input.paintedPng).resize(32).png().toBuffer() })).rejects.toThrow('dimensions');
});

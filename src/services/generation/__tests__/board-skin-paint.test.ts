import { expect, it } from 'vitest';
import sharp from 'sharp';
import { composeBoardSkinPaint } from '../board-skin-paint';

async function fixture() {
  const originalPng = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#b99880' } }).png().toBuffer();
  const paintedPng = await sharp(Buffer.from('<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" fill="#eebbaa"/><path d="M20 20L44 44" stroke="#71534c" stroke-width="5"/></svg>')).png().toBuffer();
  const skinAlphaPng = await sharp(Buffer.from('<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg"><rect x="20" y="20" width="24" height="24" fill="white"/></svg>')).png().toBuffer();
  return { originalPng, paintedPng, skinAlphaPng, sigma: 2, strength: 1 };
}

it('retains all protected pixels and marks the result as requiring visual review', async () => {
  const input = await fixture();
  const result = await composeBoardSkinPaint(input);
  const before = await sharp(input.originalPng).removeAlpha().raw().toBuffer();
  const after = await sharp(result.candidate).removeAlpha().raw().toBuffer();
  const alpha = await sharp(input.skinAlphaPng).ensureAlpha().raw().toBuffer();
  for (let p = 0; p < 64 * 64; p++) if (!alpha[p * 4 + 3]) {
    expect(after.subarray(p * 3, p * 3 + 3)).toEqual(before.subarray(p * 3, p * 3 + 3));
  }
  expect(result.changedPixels).toBeGreaterThan(0);
  expect(result.requiresVisualReview).toBe(true);
});

it('rejects invalid policy, dimensions and empty skin areas', async () => {
  const input = await fixture();
  for (const strength of [0, -1, 2, NaN]) await expect(composeBoardSkinPaint({ ...input, strength })).rejects.toThrow('policy');
  await expect(composeBoardSkinPaint({ ...input, sigma: Infinity })).rejects.toThrow('policy');
  await expect(composeBoardSkinPaint({ ...input, paintedPng: await sharp(input.paintedPng).resize(32, 32).png().toBuffer() })).rejects.toThrow('dimensions');
  const empty = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#0000' } }).png().toBuffer();
  await expect(composeBoardSkinPaint({ ...input, skinAlphaPng: empty })).rejects.toThrow('area');
});

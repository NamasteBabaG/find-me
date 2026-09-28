import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { planTargetCenteredContext } from '../../domain/scene/local-patch-context-plan';
import { composeReframedLocalPatch } from '../generation/local-patch-context';

describe('target centered recovery context', () => {
  it('preserves the Antarctica world target and original return exactly', () => {
    const p = planTargetCenteredContext({ left: 2531, top: 806, width: 512, height: 768 },
      { left: 163, top: 368, width: 171, height: 377 }, { width: 3840, height: 2160 });
    expect(p.provider).toEqual({ left: 2531, top: 926, width: 512, height: 768 });
    expect(p.providerTarget).toEqual({ left: 163, top: 248, width: 171, height: 377 });
    expect(p.returnBounds).toEqual({ left: 2574, top: 1054, width: 411, height: 520 });
  });
  it('rejects out-of-bounds, noninteger and oversized targets', () => {
    const r = { left: 10, top: 10, width: 512, height: 768 };
    for (const target of [{ ...r, left: -1 }, { ...r, left: 0.5 }, { ...r, width: 900 }])
      expect(() => planTargetCenteredContext(r, target, { width: 1000, height: 1000 })).toThrow();
  });
  it('clips at board edges while covering the complete original return', () => {
    const p = planTargetCenteredContext({ left: 0, top: 0, width: 512, height: 768 },
      { left: 100, top: 0, width: 170, height: 200 }, { width: 512, height: 768 });
    expect(p.provider).toEqual(p.shipping);
  });
  it('roundtrips source pixels and refuses altered return permissions', async () => {
    const data = Buffer.alloc(600 * 1000 * 3);
    for (let y = 0; y < 1000; y++) for (let x = 0; x < 600; x++) {
      const i = (y * 600 + x) * 3; data[i] = x % 251; data[i + 1] = y % 251; data[i + 2] = (x + y) % 251;
    }
    const board = await sharp(data, { raw: { width: 600, height: 1000, channels: 3 } }).png().toBuffer();
    const p = planTargetCenteredContext({ left: 40, top: 50, width: 512, height: 768 },
      { left: 163, top: 368, width: 171, height: 377 }, { width: 600, height: 1000 });
    const patch = await sharp(board).extract(p.provider).png().toBuffer();
    const result = await composeReframedLocalPatch(board, patch, p);
    expect(result.usable).toBe(true);
    expect(await sharp(result.candidate).removeAlpha().raw().toBuffer()).toEqual(data);
    await expect(composeReframedLocalPatch(board, patch, { ...p, returnBounds: { ...p.returnBounds, height: 600 } })).rejects.toThrow();
    const changed = await sharp(patch).composite([{ input: { create: { width: 30, height: 30, channels: 3, background: '#ff00ff' } }, left: 200, top: 350 }]).png().toBuffer();
    const edited = await composeReframedLocalPatch(board, changed, p);
    const pixels = await sharp(edited.candidate).removeAlpha().raw().toBuffer();
    let insideChanges = 0, outsideChanges = 0;
    for (let y = 0; y < 1000; y++) for (let x = 0; x < 600; x++) {
      const i = (y * 600 + x) * 3;
      if (data.subarray(i, i + 3).equals(pixels.subarray(i, i + 3))) continue;
      const r = p.returnBounds;
      if (x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height) insideChanges++; else outsideChanges++;
    }
    expect(insideChanges).toBeGreaterThan(0); expect(outsideChanges).toBe(0);
  });
});

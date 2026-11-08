import { expect, it } from 'vitest';
import { SOURCE_BODY_REPAIR_MANIFEST } from '../../../../content/detectives/source-body-repair';
import { sourceBodyEntrySchema } from '../../scene/source-body-repair';
import { sourceBodyGapAuthority, composeSourceBodyGap } from '../source-body-gap';

const g = sourceBodyEntrySchema.parse(SOURCE_BODY_REPAIR_MANIFEST.entries.find(e => e.hideId === 'paris-detectives-hide-1'));
it('derives only the public Paris L-footprint background gap, inside the unchanged return', () => {
  expect(sourceBodyGapAuthority(g)?.rect).toEqual({ left: 310, top: 470, width: 27, height: 80 });
  for (const change of [
    (p: typeof g) => { p.returnRect.width++; },
    (p: typeof g) => { p.sourceSha256 = 'f'.repeat(64); },
    (p: typeof g) => { p.child.width++; },
    (p: typeof g) => { p.protectedRects[0]!.left++; },
    (p: typeof g) => { p.editableRects[1]!.width++; },
  ]) { const p = structuredClone(g); change(p); expect(sourceBodyGapAuthority(p)).toBeNull(); }
  const other = sourceBodyEntrySchema.parse(SOURCE_BODY_REPAIR_MANIFEST.entries.find(e => e.hideId !== g.hideId));
  expect(sourceBodyGapAuthority(other)).toBeNull();
});
it('copies the paid native background cell only; every child, protected and outside pixel stays exact', () => {
  const before = new Uint8Array(512 * 768 * 4).fill(17), raw = new Uint8Array(before.length).fill(92);
  const result = composeSourceBodyGap(g, raw, before);
  expect(result.proof.changedPixels).toBe(2160);
  let changed = 0;
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const inside = x >= 310 && x < 337 && y >= 470 && y < 550, i = (y * 512 + x) * 4;
    if (result.pixels[i] !== before[i]) changed++;
    for (let c = 0; c < 4; c++) if (result.pixels[i+c] !== (inside ? raw[i+c] : before[i+c])) throw Error('Unexpected native pixel at ' + x + ',' + y);
  }
  expect(changed).toBe(2160);
  expect(composeSourceBodyGap(g, raw, result.pixels).proof.changedPixels).toBe(0);
  expect(() => composeSourceBodyGap(g, raw.subarray(4), before)).toThrow('native RGBA');
});

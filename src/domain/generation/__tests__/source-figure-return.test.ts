import { describe, expect, it } from 'vitest';
import { KINGDOM_FIGURE_RETURNS } from '../../../../content/detectives/kingdom/figure-return-v1';
import { composeSourceFigureReturn, sourceFigureAuthorityFor, sourceFigureHeadWindow,
  sourceFigureHash, sourceFigureWeight, type SourceFigureAuthority, type SourceFigurePixels } from '../source-figure-return';
import { authoredLocalPatchReturnContract } from '../../scene/local-patch-return-region';

const a = KINGDOM_FIGURE_RETURNS[0];
const parent = authoredLocalPatchReturnContract({ contentVersion: 13, boardId: a.boardId, hideId: a.hideId,
  source: a.source, crop: a.crop, child: a.child, authored: a.parentReturned,
  sourcePlacement: { manifestSha256: 'a'.repeat(64), basePlacementSha256: a.parentPlacementSha256 } });
type Rect = { left: number; top: number; width: number; height: number };
const inside = (r: Rect, x: number, y: number) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height;
function fill(p: SourceFigurePixels, r: Rect, color: readonly number[]) {
  for (let y = Math.max(0, r.top); y < Math.min(768, r.top + r.height); y++) for (let x = Math.max(0, r.left); x < Math.min(512, r.left + r.width); x++) {
    const i = (y * 512 + x) * 4;
    for (let c = 0; c < 4; c++) p.data[i + c] = color[c]!;
  }
}
function fixture() {
  const scene: SourceFigurePixels = { width: 512, height: 768, channels: 4, data: new Uint8Array(512 * 768 * 4) };
  fill(scene, { left: 0, top: 0, width: 512, height: 768 }, [80, 110, 130, 255]);
  fill(scene, a.replacedSourceHead, [130, 40, 50, 255]);
  fill(scene, a.replacedSourceLowerBody, [40, 60, 130, 255]);
  const raw = { ...scene, data: new Uint8Array(scene.data) };
  fill(raw, a.replacedSourceHead, [80, 110, 130, 255]);
  fill(raw, a.replacedSourceLowerBody, [80, 110, 130, 255]);
  const head = { left: 156, top: 185, width: 132, height: 165 }, boots = { left: 160, top: 535, width: 100, height: 38 };
  fill(raw, head, [180, 90, 70, 255]); fill(raw, boots, [110, 65, 30, 255]);
  // The provider changes other people. The actual added join must preserve
  // their original cores instead of trusting those repainted context pixels.
  for (const person of a.sourcePeople) fill(raw, person.protectedCore, [250, 0, 250, 255]);
  const baseline = { ...scene, data: new Uint8Array(scene.data) }, r = a.baselineReturned;
  for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++) {
    const weight = Math.min(1, Math.max(0, Math.min(x - r.left, y - r.top, r.left + r.width - 1 - x, r.top + r.height - 1 - y) / 6));
    const i = (y * 512 + x) * 4;
    for (let c = 0; c < 3; c++) baseline.data[i + c] = Math.round(raw.data[i + c]! * weight + scene.data[i + c]! * (1 - weight));
  }
  return { scene, raw, baseline, head, boots };
}
const equalRegion = (a: SourceFigurePixels, b: SourceFigurePixels, r: Rect) => {
  for (let y = Math.max(0, r.top); y < Math.min(768, r.top + r.height); y++) for (let x = Math.max(0, r.left); x < Math.min(512, r.left + r.width); x++) {
    const i = (y * 512 + x) * 4;
    if ([0, 1, 2, 3].some(c => a.data[i + c] !== b.data[i + c])) return false;
  }
  return true;
};

describe('additive public whole-figure return', () => {
  it('requires the exact public parent, placement and active baseline instead of growing any recovery', () => {
    expect(sourceFigureAuthorityFor(parent, a.baselineReturned)).toEqual(a);
    for (const p of [{ ...parent, contentVersion: 12 as const }, { ...parent, hideId: 'foreign-hide' },
      { ...parent, source: { ...parent.source, sha256: 'f'.repeat(64) } },
      { ...parent, child: { ...parent.child, top: parent.child.top + 1 } },
      { ...parent, sourcePlacement: { ...parent.sourcePlacement!, basePlacementSha256: 'f'.repeat(64) } }])
      expect(sourceFigureAuthorityFor(p, a.baselineReturned)).toBeNull();
    expect(sourceFigureAuthorityFor(parent, { ...a.baselineReturned, height: a.baselineReturned.height - 1 })).toBeNull();
    expect(sourceFigureHeadWindow(a)).toEqual({ left: 66, top: 168, width: 286, height: 432 });
  });
  it('retains the synthetic paid crown and boots together, removes the entire old lower-body region and protects source cores', () => {
    const f = fixture(), beforeHash = sourceFigureHash([...f.baseline.data]);
    const made = composeSourceFigureReturn({ authority: a, ...f }), candidate = { ...f.baseline, data: made.pixels };
    expect(equalRegion(candidate, f.raw, f.head)).toBe(true);
    expect(equalRegion(candidate, f.raw, f.boots)).toBe(true);
    expect(equalRegion(candidate, f.raw, a.replacedSourceLowerBody)).toBe(true);
    expect(equalRegion(f.baseline, f.raw, f.head)).toBe(false);
    expect(equalRegion(f.baseline, f.raw, f.boots)).toBe(false);
    for (const p of a.sourcePeople) expect(equalRegion(candidate, f.scene, p.protectedCore), p.sourceId).toBe(true);
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) if (!a.extensions.some(p => inside(p.rect, x, y))) {
      const i = (y * 512 + x) * 4;
      if ([0, 1, 2, 3].some(c => candidate.data[i + c] !== f.baseline.data[i + c])) throw Error('Unexpected outside pixel change');
    }
    expect(sourceFigureHash([...f.baseline.data])).toBe(beforeHash);
    expect(made.reports).toHaveLength(2); expect(made.reports.every(r => r.usable)).toBe(true);
  });
  it('distinguishes a full source head annotation from its preserved core and explicitly names permitted hair occlusion', () => {
    expect(sourceFigureWeight(a, a.extensions[0], 150, 170)).toBe(0);
    expect(sourceFigureWeight(a, a.extensions[1], 200, 590)).toBe(0);
    const upper = a.sourcePeople[0];
    expect(upper.head.top + upper.head.height).toBeGreaterThan(upper.protectedCore.top + upper.protectedCore.height);
    expect(upper.targetOcclusion.top).toBe(upper.protectedCore.top + upper.protectedCore.height);
    expect(upper.role).toContain('Only the lower loose hair');
    expect(a.measurementBounds.top + a.measurementBounds.height).toBeGreaterThanOrEqual(a.replacedSourceLowerBody.top + a.replacedSourceLowerBody.height);
    expect(a.standingHeight).toBe(370);
  });
  it('refuses an already altered protected source core', () => {
    const f = fixture(); fill(f.baseline, a.sourcePeople[0].protectedCore, [1, 2, 3, 255]);
    expect(() => composeSourceFigureReturn({ authority: a, ...f })).toThrow('baseline protected source core changed');
  });
  it('refuses a baseline whose added area was already edited instead of replacing someone else’s correction', () => {
    const f = fixture(); fill(f.baseline, { left: 140, top: 200, width: 1, height: 1 }, [1, 2, 3, 255]);
    expect(() => composeSourceFigureReturn({ authority: a, ...f })).toThrow('added return no longer meets original source');
  });
  it.each(['head', 'foot'] as const)('keeps the 24 seam limit for the %s addition', kind => {
    const f = fixture(), part = a.extensions.find(e => e.kind === kind)!;
    fill(f.raw, part.rect, [255, 255, 255, 255]);
    expect(() => composeSourceFigureReturn({ authority: a, ...f })).toThrow('unchanged seam or alignment limits');
  });
  it('refuses caller-invented permissions and non-native rasters', () => {
    const f = fixture(), forged = { ...a, measurementBounds: { ...a.measurementBounds, width: 512 } } as unknown as SourceFigureAuthority;
    expect(() => composeSourceFigureReturn({ authority: forged, ...f })).toThrow('unknown public source permission');
    expect(() => composeSourceFigureReturn({ authority: a, ...f, raw: { ...f.raw, width: 513 } })).toThrow('native RGBA');
  });
});

import { describe, expect, it } from 'vitest';
import { assertRetainedWindowManifest, RETAINED_WINDOW_AUTHORITIES } from '../../../../content/detectives/retained-window-v1';
import { KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE } from '../../../../content/detectives/kingdom/source-placement-release';
import { DETECTIVE_SOURCE_PLACEMENT_RELEASE } from '../../../../content/detectives/source-placement-release';
import { assertRetainedWindowAuthority, composeRetainedWindow, retainedWindowProtectedHeads, retainedWindowRegistration,
  retainedWindowHeadMask, alignRetainedWindowRaw, retainedWindowCanonicalHash,
  RETAINED_WINDOW_VERSION, retainedWindowNeighborAlternateAllowed, type RetainedWindowAuthority, type RetainedWindowPixels } from '../retained-window';
import { targetHeadReturnDecision, TARGET_HEAD_VISIBLE_VERSION, type TargetHeadEvidence } from '../target-head-return';

it('allows a changed paid source only after the exact completed neighbor refusal, never another opinion on unchanged pixels',()=>{
 const valid={currentSourceKey:'synthetic:walking:render:3',failedSourceKey:'synthetic:walking:render:3',replacementSourceKey:'synthetic:walking:render:1',
  reviewState:'board-review-complete',disposition:'retry',verdict:'fail',faults:['pictureWhole','neighborsIntact']};
 expect(retainedWindowNeighborAlternateAllowed(valid)).toBe(true);
 for(const mutation of [{reviewState:'pending-board-review'},{verdict:'pass'},{disposition:'acceptable'},
  {faults:['ageAppropriate']},{faults:['neighborsIntact']},{faults:['pictureWhole','neighborsIntact','styleMatch']},
  {replacementSourceKey:valid.failedSourceKey},{currentSourceKey:'another-source'}])
  expect(retainedWindowNeighborAlternateAllowed({...valid,...mutation})).toBe(false);
});

function authority(): RetainedWindowAuthority {
  return { version: RETAINED_WINDOW_VERSION, sceneVersion: 13, family: 'kingdom-detectives/v1', boardId: 'synthetic', hideId: 'synthetic-hide',
    source: { art: 'public/scenes/synthetic/base.png', sha256: '1'.repeat(64), width: 512, height: 768 },
    crop: { left: 0, top: 0, width: 512, height: 768 }, parentChild: { left: 150, top: 200, width: 200, height: 400 },
    parentReturn: { left: 130, top: 180, width: 240, height: 440 }, parentPlacementSha256: '2'.repeat(64),
    targetSourceId: 'original-target', sourceHeads: [
      { sourceId: 'original-target', head: { left: 210, top: 230, width: 90, height: 100 } },
      { sourceId: 'crossing-neighbor', head: { left: 0, top: 290, width: 65, height: 80 } },
      { sourceId: 'interior-neighbor', head: { left: 380, top: 70, width: 90, height: 90 } },
    ], frame: 12, feather: 12, maxRegistration: 3, maximumMeanDifference: 24 };
}
function scene(): RetainedWindowPixels {
  const data = new Uint8Array(512 * 768 * 4);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    let v = Math.imul(x + 193, 73856093) ^ Math.imul(y + 211, 19349663);
    v ^= v >>> 13; v = Math.imul(v, 1274126177); v ^= v >>> 16;
    data[i] = v & 255; data[i + 1] = (v >>> 8) & 255; data[i + 2] = (v >>> 16) & 255; data[i + 3] = 255;
  }
  return { data, width: 512, height: 768, channels: 4 };
}
const pixel = (p: RetainedWindowPixels, x: number, y: number) => [...p.data.slice((y * 512 + x) * 4, (y * 512 + x) * 4 + 4)];
const paint = (p: RetainedWindowPixels, r: { left: number; top: number; width: number; height: number }) => {
  for (let y = r.top; y < r.top + r.height; y++) for (let x = r.left; x < r.left + r.width; x++)
    p.data.set([203, 117, 61, 255], (y * 512 + x) * 4);
};
function shifted(p: RetainedWindowPixels, dx: number, dy: number): RetainedWindowPixels {
  const result = { ...p, data: new Uint8Array(p.data) };
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx >= 0 && sx < 512 && sy >= 0 && sy < 768) result.data.set(p.data.slice((sy * 512 + sx) * 4, (sy * 512 + sx) * 4 + 4), (y * 512 + x) * 4);
  }
  return result;
}

describe('paid native window recovery', () => {
  it('binds native compound mapping without treating a bounding-box clearance or SOURCE-hole corner as visible hair loss',()=>{
    const mask=retainedWindowHeadMask(authority(),1,-2),head={left:210,top:230,width:70,height:90};
    const evidence:TargetHeadEvidence={version:TARGET_HEAD_VISIBLE_VERSION,gameId:'synthetic',hideId:'synthetic-hide',sourceRequestKey:'synthetic:render:1',
      sourceFingerprint:'1'.repeat(64),sourcePayloadSha256:'2'.repeat(64),normalizedRawSha256:'3'.repeat(64),shippingSha256:'4'.repeat(64),
      geometrySha256:'5'.repeat(64),identitySha256:'6'.repeat(64),returned:{left:12,top:12,width:488,height:744},feather:12,
      sourceBindingVersion:RETAINED_WINDOW_VERSION,sourceCompositionSha256:'7'.repeat(64),compoundHeadMask:mask};
    const answer=(shippingHead= head)=>JSON.stringify({version:'single-sol-medium/v1',head:{version:TARGET_HEAD_VISIBLE_VERSION,
      rawHead:{...shippingHead,left:shippingHead.left+1,top:shippingHead.top-2},shippingHead,rawCrown:'pass',shippingCrown:'pass',observation:'Synthetic complete opaque paid target crown.'}});
    expect(targetHeadReturnDecision(answer(),evidence).disposition).toBe('pass');
    expect(targetHeadReturnDecision(answer({left:60,top:300,width:40,height:50}),evidence).disposition).toBe('pass');
    expect(targetHeadReturnDecision(answer({left:15,top:200,width:40,height:50}),evidence).disposition).toBe('pass');
    const damaged=JSON.parse(answer());damaged.head.shippingCrown='fail';
    expect(targetHeadReturnDecision(JSON.stringify(damaged),evidence).disposition).toBe('repair');
    expect(targetHeadReturnDecision(answer(),{...evidence,compoundHeadMask:undefined}).disposition).toBe('unresolved');
    expect(retainedWindowCanonicalHash({b:1,a:{d:2,c:3}})).toBe(retainedWindowCanonicalHash({a:{c:3,d:2},b:1}));
    const raw=scene(),mapped=alignRetainedWindowRaw(raw,1,-2);
    expect(pixel(mapped,250,250)).toEqual(pixel(raw,251,248));
    expect(()=>alignRetainedWindowRaw(raw,4,0)).toThrow(/integer mapping/);
  });
  it('replaces the complete old target, keeps crossing SOURCE heads whole, and changes nothing outside permission', () => {
    const a = authority(), before = scene(), raw = { ...before, data: new Uint8Array(before.data) };
    paint(raw, { left: 205, top: 220, width: 100, height: 380 });
    paint(raw, { left: 0, top: 290, width: 65, height: 80 });
    const result = composeRetainedWindow({ authority: a, scene: before, raw });
    expect(pixel(result.pixels, 250, 250)).toEqual(pixel(raw, 250, 250));
    expect(pixel(result.pixels, 250, 590)).toEqual(pixel(raw, 250, 590));
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      if (x < 12 || x >= 500 || y < 12 || y >= 756 || x < 65 && y >= 290 && y < 370)
        expect(pixel(result.pixels, x, y)).toEqual(pixel(before, x, y));
    }
    expect(retainedWindowProtectedHeads(a).map(h => h.sourceId)).toEqual(['crossing-neighbor']);
    expect(result.proof.registration).toMatchObject({ sampleX: 0, sampleY: 0, meanDifference: 0 });
    expect(JSON.parse(JSON.stringify(result.proof))).toStrictEqual(result.proof);
    expect(result.proof.paidPixels).toBeGreaterThan(100_000);
  });

  it('really applies a one-by-two pixel registration instead of just renaming a moved edge', () => {
    const a = authority(), before = scene(), changed = { ...before, data: new Uint8Array(before.data) };
    paint(changed, { left: 205, top: 220, width: 100, height: 380 });
    const raw = shifted(changed, 1, -2), result = composeRetainedWindow({ authority: a, scene: before, raw });
    expect(result.proof.registration).toMatchObject({ sampleX: 1, sampleY: -2, meanDifference: 0 });
    expect(result.proof.appliedTranslation).toEqual({ x: -1, y: 2 });
    expect(pixel(result.pixels, 250, 250)).toEqual(pixel(raw, 251, 248));
    expect(pixel(result.pixels, 350, 450)).toEqual(pixel(before, 350, 450));
    expect(pixel(result.pixels, 4, 400)).toEqual(pixel(before, 4, 400));
  });

  it('refuses rewritten scenery, excessive drift, missing native pixels, and transparency', () => {
    const a = authority(), before = scene(), bad = { ...before, data: new Uint8Array(before.data.length) };
    for (let i = 0; i < bad.data.length; i += 4) bad.data.set([255, 255, 255, 255], i);
    expect(() => composeRetainedWindow({ authority: a, scene: before, raw: bad })).toThrow(/24 limit/);
    expect(() => composeRetainedWindow({ authority: a, scene: before, raw: shifted(before, 8, 8) })).toThrow(/24 limit|registration error/);
    expect(() => composeRetainedWindow({ authority: a, scene: before, raw: { ...before, width: 768 } })).toThrow(/native RGBA/);
    const transparent = { ...before, data: new Uint8Array(before.data) }; transparent.data[3] = 0;
    expect(() => composeRetainedWindow({ authority: a, scene: before, raw: transparent })).toThrow(/opaque/);
  });

  it('cannot preserve the old target accidentally or admit a SOURCE head crossing the opaque target region', () => {
    const a = authority();
    expect(retainedWindowProtectedHeads(a).some(h => h.sourceId === a.targetSourceId)).toBe(false);
    expect(() => assertRetainedWindowAuthority({ ...a, targetSourceId: 'crossing-neighbor' })).toThrow(/replaced source head/);
    expect(() => assertRetainedWindowAuthority({ ...a, sourceHeads: [...a.sourceHeads, a.sourceHeads[0]!] })).toThrow(/geometry/);
    expect(() => assertRetainedWindowAuthority({ ...a, source: { ...a.source, art: '../private.png' } })).toThrow();
  });

  it('derives all fourteen roles from the actual public scene13 neighborhoods and keeps old placement authorities', () => {
    expect(RETAINED_WINDOW_AUTHORITIES).toHaveLength(14);
    expect(() => assertRetainedWindowManifest()).not.toThrow();
    for (const a of RETAINED_WINDOW_AUTHORITIES) {
      const release = a.family === 'kingdom-detectives/v1' ? KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE : DETECTIVE_SOURCE_PLACEMENT_RELEASE;
      const original = release.inventory.find(e => e.hideId === a.hideId)!;
      expect(a.source).toEqual(original.source);
      expect(a.crop).toEqual(original.effective.crop);
      expect(a.parentPlacementSha256).toBe(original.basePlacementSha256);
      expect(a.sourceHeads).toEqual(original.sourceNeighbors!.contract.neighbors.map(h => ({ sourceId: h.sourceId, head: h.head })));
      const target = original.sourceNeighbors!.contract.neighbors.filter(h => h.sourceId === a.targetSourceId);
      expect(target).toHaveLength(1);
      expect(retainedWindowProtectedHeads(a).every(h => h.sourceId !== target[0]!.sourceId)).toBe(true);
      expect(() => assertRetainedWindowAuthority(a)).not.toThrow();
    }
  });

  it('does not infer a translation on a featureless unchanged frame', () => {
    const a = authority(), p = scene();
    for (let i = 0; i < p.data.length; i += 4) p.data.set([81, 91, 111, 255], i);
    expect(retainedWindowRegistration(a, p, p)).toMatchObject({ sampleX: 0, sampleY: 0, meanDifference: 0 });
  });
});

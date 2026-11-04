import { describe, expect, it } from 'vitest';
import { SOURCE_BODY_REPAIR_MANIFEST } from '../../../../content/detectives/source-body-repair';
import runtime from '../../../../content/detectives/runtime-v1.json';
import { composeCrownTab, crownTabAuthorityFor, crownTabCandidate, crownTabContinuityCut, crownTabQualityCut, crownTabRect, crownTabSeam, crownTabWeight, crownTabWindow,
  CROWN_TAB_AUTHORITY, CROWN_TAB_MAX_RAISE, type CrownTabPixels } from '../crown-tab';
import { readLocalPatchBodyContinuity, CONTINUITY_READER_BOUNDED } from '../../scene/local-patch-body-continuity';

it('admits a connected single hard-cut only as a new crown candidate and refuses unrelated continuity failures',()=>{
  const person={id:'synthetic:people',state:'broken',visibleBody:true,headConnection:'connected',
    headTrace:'The synthetic target has a connected visible head.',bodyTrace:'The synthetic limbs remain connected and supported.',
    occlusion:'The test uses no unknown occlusion.',faults:[{kind:'hard-cut',where:'Synthetic cut inside the located crown.'}]};
  const read=(over:Record<string,unknown>)=>readLocalPatchBodyContinuity(JSON.stringify({cases:[{...person,...over}]}),['synthetic:people'],CONTINUITY_READER_BOUNDED);
  expect(crownTabContinuityCut(read({}))).toBe(true);
  expect(crownTabContinuityCut(read({headConnection:'disconnected'}))).toBe(false);
  expect(crownTabContinuityCut(read({faults:[...person.faults,...person.faults]}))).toBe(false);
  expect(crownTabContinuityCut(read({visibleBody:false}))).toBe(false);
  expect(crownTabContinuityCut(null)).toBe(false);
  const reading=read({});
  if(!reading.ok)throw Error('Synthetic reading is invalid');
  expect(crownTabContinuityCut({...reading,people:[{...reading.people[0]!,role:'bystander'}]})).toBe(false);
});

it('checks the immutable quality verdict and rejects unrelated faults even if a mutable row omitted them',()=>{
  const cut={verdict:'fail',faults:[{check:'childComplete'},{check:'pictureWhole'},{check:'severeSeam'}]};
  expect(crownTabQualityCut(cut)).toBe(true);
  expect(crownTabQualityCut({...cut,faults:[...cut.faults,{check:'identity'}]})).toBe(false);
  expect(crownTabQualityCut({...cut,verdict:'pass'})).toBe(false);
  expect(crownTabQualityCut({...cut,faults:[]})).toBe(false);
  expect(crownTabQualityCut({...cut,faults:[null]})).toBe(false);
  expect(crownTabQualityCut(null)).toBe(false);
});

// Synthetic public pixels over the real authored New York 2, Paris 2 and Giza 2 windows: a textured
// scene, a painted child whose crown the 2026-11-02 paintings drew 11, 35 and 45 px above the window.
const W = 512, H = 768;
const rgba = (at: (x: number, y: number) => number[]): CrownTabPixels => {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...at(x, y), 255], (y * W + x) * 4);
  return { data, width: W, height: H, channels: 4 };
};
type Box = { left: number; top: number; width: number; height: number };
const inBox = (b: Box, x: number, y: number) => x >= b.left && x < b.left + b.width && y >= b.top && y < b.top + b.height;
const texture = (x: number, y: number) => [(x * 7 + y * 3) % 200 + 20, (x * 3 + y * 11) % 180 + 30, (x * 13 + y * 5) % 160 + 40];
const px = (p: CrownTabPixels, x: number, y: number) => [...p.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
const authority = (hideId: string) => CROWN_TAB_AUTHORITY.find(a => a.hideId === hideId)!;
const cases = [
  { hideId: 'newyork-detectives-hide-2', above: 11, head: { left: 200, width: 120, height: 130 } },
  { hideId: 'paris-detectives-hide-2', above: 35, head: { left: 260, width: 120, height: 150 } },
  { hideId: 'giza-detectives-hide-2', above: 45, head: { left: 160, width: 110, height: 110 } },
] as const;
function world(c: typeof cases[number], options: { rawTexture?: (x: number, y: number) => number[] } = {}) {
  const returned = authority(c.hideId).returned, rawHead = { ...c.head, top: returned.top - c.above };
  const body = { left: c.head.left - 30, top: rawHead.top + c.head.height, width: c.head.width + 60, height: 200 };
  const scene = rgba(texture), rawAt = options.rawTexture ?? texture;
  const raw = rgba((x, y) => inBox(rawHead, x, y) ? [90, 50, 20] : inBox(body, x, y) ? [30, 70, 160] : rawAt(x, y));
  // The ordinary composition: RAW inside the window with its 12px feather, the scene outside.
  const baseline = rgba((x, y) => {
    if (!inBox(returned, x, y)) return texture(x, y);
    const edge = Math.min(x - returned.left, y - returned.top, returned.left + returned.width - 1 - x, returned.top + returned.height - 1 - y), w = Math.min(1, (edge + 0.5) / 12);
    return [0, 1, 2].map(i => Math.round(px(raw, x, y)[i]! * w + px(scene, x, y)[i]! * (1 - w)));
  });
  return { returned, rawHead, scene, raw, baseline };
}

describe('crown-tab authority', () => {
  it('binds each authored window to its exact source, crop, child and window', () => {
    const a = authority('newyork-detectives-hide-2');
    const exact = { hideId: a.hideId, sourceSha256: a.sourceSha256, crop: a.crop, child: a.child, returned: a.returned };
    expect(crownTabAuthorityFor(exact)).toBe(a);
    expect(crownTabAuthorityFor({ ...exact, sourceSha256: 'f'.repeat(64) })).toBeNull();
    expect(crownTabAuthorityFor({ ...exact, returned: { ...a.returned, top: a.returned.top - 40 } })).toBeNull();
    expect(crownTabAuthorityFor({ ...exact, child: { ...a.child, height: a.child.height + 1 } })).toBeNull();
    expect(crownTabAuthorityFor({ ...exact, hideId: 'tokyo-detectives-hide-2' })).toBeNull();
    // The two v1 source-crown windows keep their own contract.
    expect(CROWN_TAB_AUTHORITY.map(e => e.hideId as string)).not.toContain('amazon-detectives-hide-3');
    expect(CROWN_TAB_AUTHORITY.map(e => e.hideId as string)).not.toContain('paris-detectives-hide-3');
    expect(CROWN_TAB_AUTHORITY).toHaveLength(12);
  });
  it('binds exactly the window the engine uses: the corrected body window for a source-body hide, the authored one otherwise', () => {
    for (const a of CROWN_TAB_AUTHORITY) {
      const body = SOURCE_BODY_REPAIR_MANIFEST.entries.find(e => e.hideId === a.hideId);
      const board = runtime.boards.find(b => b.definition.hides.some(h => h.id === a.hideId))!, hide = board.definition.hides.find(h => h.id === a.hideId)!;
      expect(a.sourceSha256).toBe(board.source.sha256);
      expect(a.crop).toEqual({ left: hide.left, top: hide.top }); expect(a.child).toEqual(hide.mask);
      expect(a.returned).toEqual(body ? body.returnRect : hide.returnRect);
      if (body) { expect(body.child).toEqual(hide.mask); expect({ left: body.crop.left, top: body.crop.top }).toEqual(a.crop); expect(body.sourceSha256).toBe(a.sourceSha256); }
    }
    expect(SOURCE_BODY_REPAIR_MANIFEST.entries.map(e => e.hideId).sort()).toEqual(['giza-detectives-hide-2', 'paris-detectives-hide-1']);
  });
});

describe('crown-tab geometry', () => {
  it.each(cases)('$hideId: a crown $above px above the whole window gets a tab whose feather ends before the crown', ({ hideId, above, head }) => {
    const returned = authority(hideId).returned, rawHead = { ...head, top: returned.top - above };
    const tab = crownTabRect(returned, rawHead, []);
    if (typeof tab === 'string') throw Error(tab);
    expect(tab.top + 12).toBeLessThanOrEqual(rawHead.top - 4);
    expect(tab.top + tab.height).toBe(returned.top + 12);
    expect(tab.left).toBe(head.left - 16); expect(tab.width).toBe(head.width + 32);
    expect(crownTabWindow(returned, tab)).toEqual({ ...returned, top: tab.top, height: returned.top + returned.height - tab.top });
  });
  it('refuses a crown inside the window, beyond the raise, at the window side or over a registered head', () => {
    const returned = authority('newyork-detectives-hide-2').returned, head = { left: 200, top: returned.top - 20, width: 120, height: 130 };
    expect(crownTabRect(returned, { ...head, top: returned.top + 2 }, [])).toBe('The located crown is inside its return window');
    expect(crownTabRect(returned, { ...head, top: returned.top - CROWN_TAB_MAX_RAISE - 1 }, [])).toMatch(/more than the authorized raise/);
    expect(typeof crownTabRect(returned, { ...head, top: returned.top - CROWN_TAB_MAX_RAISE }, [])).toBe('object');
    expect(crownTabRect(returned, { ...head, left: returned.left + 4 }, [])).toMatch(/full side margin/);
    expect(crownTabRect(returned, head, [{ left: 330, top: returned.top - 30, width: 40, height: 20 }])).toMatch(/registered original head/);
    expect(typeof crownTabRect(returned, head, [{ left: 340, top: returned.top - 30, width: 40, height: 20 }])).toBe('object');
  });
  it('feathers only from the top and sides; the bottom joins the paid painting', () => {
    const tab = { left: 100, top: 200, width: 100, height: 60 };
    expect(crownTabWeight(tab, 150, 200)).toBeCloseTo(0.5 / 12); expect(crownTabWeight(tab, 150, 259)).toBe(1);
    expect(crownTabWeight(tab, 100, 250)).toBeCloseTo(0.5 / 12); expect(crownTabWeight(tab, 99, 250)).toBe(0);
  });
});

describe('crown-tab pixels', () => {
  it.each(cases)('$hideId: restores the paid crown above the window and changes nothing outside the tab', c => {
    const { returned, rawHead, scene, raw, baseline } = world(c), tab = crownTabRect(returned, rawHead, []);
    if (typeof tab === 'string') throw Error(tab);
    // The ordinary composition lost the crown: original scene where the paid crown is.
    expect(px(baseline, rawHead.left + 50, rawHead.top + 2)).toEqual(px(scene, rawHead.left + 50, rawHead.top + 2));
    const { pixels, changed } = composeCrownTab({ raw, scene, baseline, returned, tab }), out = { data: pixels, width: W, height: H, channels: 4 };
    expect(changed).toBeGreaterThan(0);
    for (let y = rawHead.top; y < returned.top + 12; y++) for (let x = rawHead.left; x < rawHead.left + rawHead.width; x++) expect(px(out, x, y)).toEqual(px(raw, x, y));
    let outside = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!inBox(tab, x, y) && px(out, x, y).join() !== px(baseline, x, y).join()) outside++;
    expect(outside).toBe(0);
    // The seam the tab adds is the scene against the paid painting's own scene: aligned and quiet.
    expect(crownTabSeam({ raw, scene, tab, returned })).toMatchObject({ usable: true, shift: { dx: 0, dy: 0 } });
  });
  it('keeps an earlier correction below the window byte for byte and refuses a strip that is no longer the scene', () => {
    const c = cases[1], { returned, rawHead, scene, raw, baseline } = world(c), tab = crownTabRect(returned, rawHead, []) as ReturnType<typeof crownTabWindow>;
    // An earlier fix (say a prop join) changed pixels inside the window but outside the tab.
    const corrected = { ...baseline, data: new Uint8Array(baseline.data) }, at = ((returned.top + 200) * W + returned.left + 20) * 4;
    corrected.data[at] = corrected.data[at]! ^ 7;
    const out = composeCrownTab({ raw, scene, baseline: corrected, returned, tab }).pixels;
    expect(out[at]).toBe(corrected.data[at]);
    const tampered = { ...baseline, data: new Uint8Array(baseline.data) }, strip = ((tab.top + 1) * W + tab.left + 3) * 4;
    tampered.data[strip] = tampered.data[strip]! ^ 1;
    expect(() => composeCrownTab({ raw, scene, baseline: tampered, returned, tab })).toThrow('no longer the original scene');
    expect(() => composeCrownTab({ raw: { ...raw, width: 511 }, scene, baseline, returned, tab })).toThrow('aligned RGBA');
    expect(() => composeCrownTab({ raw, scene, baseline, returned, tab: { ...tab, height: tab.height - 1 } })).toThrow('tab above its own return');
  });
  it('refuses a rewritten or moved strip around the crown: the seam limit is unchanged', () => {
    const c = cases[0];
    const rewritten = world(c, { rawTexture: (x, y) => texture(x, y).map(v => (v + 90) % 256) });
    const tab = crownTabRect(rewritten.returned, rewritten.rawHead, []) as ReturnType<typeof crownTabWindow>;
    const report = crownTabSeam({ raw: rewritten.raw, scene: rewritten.scene, tab, returned: rewritten.returned });
    expect(report.usable).toBe(false); expect(report.borderMeanDiff).toBeGreaterThan(24);
    // A non-repeating scene, so the only matching offset is the real one.
    const smooth = (x: number, y: number) => [128 + Math.round(90 * Math.sin(x / 9) * Math.cos(y / 13)), 128 + Math.round(80 * Math.sin((x + y) / 17)), 100 + Math.round(60 * Math.cos(x / 23))];
    const scene = rgba(smooth), raw = rgba((x, y) => inBox(rewritten.rawHead, x, y) ? [90, 50, 20] : smooth(x + 2, y));
    const moved = crownTabSeam({ raw, scene, tab, returned: rewritten.returned });
    // RAW drawn 2px to the left of the scene matches it at dx = -2.
    expect(moved).toMatchObject({ usable: false, shift: { dx: -2, dy: 0 } });
    expect(crownTabSeam({ raw: rgba((x, y) => inBox(rewritten.rawHead, x, y) ? [90, 50, 20] : smooth(x, y)), scene, tab, returned: rewritten.returned }).usable).toBe(true);
  });
});

describe('scheduling only a located crown cut above the window', () => {
  const returned = authority('newyork-detectives-hide-2').returned;
  const row = (head: object, patch: Record<string, unknown> = {}, faults = [{ check: 'childComplete', where: 'HEAD_RETURN: the target crown is visibly incomplete' }]) => ({
    status: 'FAILED', assetId: 'ast-old', judgeJson: JSON.stringify({ reviewState: 'board-review-complete', selfRepair: { phase: 'rejected' },
      verdict: { verdict: 'fail', faults }, ...patch,
      boardReview: { dual: { single: 'single-sol-medium/v1', quality: { headEvidence: { version: 'target-head-return/v2-visible-completeness', returned },
        raw: JSON.stringify({ head }) } } } }) });
  const cut = { rawHead: { left: 200, top: returned.top - 11, width: 120, height: 130 }, shippingHead: { left: 200, top: returned.top + 4, width: 120, height: 115 }, rawCrown: 'pass', shippingCrown: 'fail' };
  it('accepts the measured cut and refuses every other refusal', () => {
    expect(crownTabCandidate(row(cut))).toBe(true);
    expect(crownTabCandidate(row(cut, {}, [{ check: 'pictureWhole', where: 'top join' }, { check: 'severeSeam', where: 'top join' }]))).toBe(true);
    expect(crownTabCandidate(row({ ...cut, rawCrown: 'fail' }))).toBe(false);
    expect(crownTabCandidate(row({ ...cut, shippingCrown: 'pass' }))).toBe(false);
    expect(crownTabCandidate(row({ ...cut, rawHead: { ...cut.rawHead, top: returned.top + 1 } }))).toBe(false);
    expect(crownTabCandidate(row({ ...cut, rawHead: { ...cut.rawHead, top: returned.top - CROWN_TAB_MAX_RAISE - 1 } }))).toBe(false);
    expect(crownTabCandidate(row(cut, {}, [{ check: 'faceLikeness', where: 'face' }, { check: 'childComplete', where: 'crown' }]))).toBe(false);
    for (const field of ['crownTab', 'headPixelCorrection', 'crownReturn', 'authoredRecovery', 'sourceBodyRepair', 'wholeSourceContext', 'foreground'])
      expect(crownTabCandidate(row(cut, { [field]: {} }))).toBe(false);
    expect(crownTabCandidate({ ...row(cut), status: 'GENERATED' })).toBe(false);
  });
  it('keeps an existing body route or prop correction eligible: the tab preserves them', () => {
    expect(crownTabCandidate(row(cut, { sourceBodyBirth: {} }))).toBe(true);
    expect(crownTabCandidate(row(cut, { propJoinCorrection: {} }))).toBe(true);
  });
});

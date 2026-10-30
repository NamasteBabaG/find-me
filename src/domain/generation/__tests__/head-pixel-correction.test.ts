import { describe, expect, it } from 'vitest';
import { composeHeadPixelCorrection, headPixelCorrectionCandidate, headPixelCorrectionWeight, HEAD_PIXEL_CORRECTION_MIN_GAP,
  MEASURED_HEAD_FADE_REASON, type CorrectionPixels } from '../head-pixel-correction';

// Synthetic public pixels: a striped scene, a painted head 4px inside the return, and the
// composition's own 12px feather as the baseline.
const W = 512, H = 768, returned = { left: 100, top: 200, width: 300, height: 400 }, head = { left: 200, top: 204, width: 80, height: 90 };
const rgba = (at: (x: number, y: number) => number[]): CorrectionPixels => {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set([...at(x, y), 255], (y * W + x) * 4);
  return { data, width: W, height: H, channels: 4 };
};
const inBox = (b: typeof head, x: number, y: number) => x >= b.left && x < b.left + b.width && y >= b.top && y < b.top + b.height;
const stripe = (x: number) => Math.floor(x / 6) % 2 ? [40, 60, 90] : [200, 210, 230];
const scene = rgba(x => stripe(x)), raw = rgba((x, y) => inBox(head, x, y) ? [90, 50, 20] : stripe(x));
function baselineOf(r = raw, s = scene) {
  const data = new Uint8Array(s.data);
  for (let y = returned.top; y < returned.top + returned.height; y++) for (let x = returned.left; x < returned.left + returned.width; x++) {
    const edge = Math.min(x - returned.left, y - returned.top, returned.left + returned.width - 1 - x, returned.top + returned.height - 1 - y), w = Math.min(1, (edge + 0.5) / 12);
    for (let c = 0; c < 3; c++) data[(y * W + x) * 4 + c] = Math.round(r.data[(y * W + x) * 4 + c]! * w + s.data[(y * W + x) * 4 + c]! * (1 - w));
  }
  return { data, width: W, height: H, channels: 4 };
}
const px = (p: CorrectionPixels, x: number, y: number) => [...p.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];

describe('free head pixel correction inside the SAME return', () => {
  it('keeps the located head opaque, ramps from the return edge without a jump, and leaves far pixels alone', () => {
    expect(headPixelCorrectionWeight(returned, [head], 240, 250)).toBe(1);
    expect(headPixelCorrectionWeight(returned, [head], 240, 199)).toBe(0);
    const column = [200, 201, 202, 203, 204].map(y => headPixelCorrectionWeight(returned, [head], 240, y));
    expect(column[0]).toBeCloseTo(0.5 / 4.5); expect(column[4]).toBe(1);
    for (let i = 1; i < column.length; i++) expect(column[i]! - column[i - 1]!).toBeLessThanOrEqual(0.23);
    // 12px or more from the head the composition's own weight already wins.
    expect(headPixelCorrectionWeight(returned, [head], 340, 203)).toBeCloseTo(3.5 / 12);
  });
  it('restores the paid head pixels exactly and changes nothing outside the return or far from the head', () => {
    const baseline = baselineOf(), { pixels, changed } = composeHeadPixelCorrection({ raw, scene, baseline, returned, heads: [head] });
    const out = { data: pixels, width: W, height: H, channels: 4 };
    expect(changed).toBeGreaterThan(0);
    for (let y = head.top; y < head.top + head.height; y++) for (let x = head.left; x < head.left + head.width; x++) expect(px(out, x, y)).toEqual(px(raw, x, y));
    for (const [x, y] of [[99, 250], [240, 199], [450, 300], [240, 610]]) expect(px(out, x!, y!)).toEqual(px(baseline, x!, y!));
    // A band pixel 20px beside the head keeps the ordinary feather.
    expect(px(out, 300, 202)).toEqual(px(baseline, 300, 202));
  });
  it('refuses a baseline that is not the ordinary composition of this RAW over this scene', () => {
    for (const [x, y] of [[240, 202], [90, 300], [250, 400]]) {
      const forged = baselineOf(), at = (y! * W + x!) * 4; forged.data[at] = forged.data[at]! ^ 1;
      expect(() => composeHeadPixelCorrection({ raw, scene, baseline: forged, returned, heads: [head] })).toThrow('not the ordinary composition');
    }
    expect(() => composeHeadPixelCorrection({ raw, scene, baseline: baselineOf(raw, rgba(x => stripe(x + 1))), returned, heads: [head] })).toThrow('not the ordinary composition');
  });
  it(`refuses a located head closer than ${HEAD_PIXEL_CORRECTION_MIN_GAP}px to the return or misaligned pixels`, () => {
    const near = { ...head, top: returned.top + HEAD_PIXEL_CORRECTION_MIN_GAP - 1 };
    expect(() => composeHeadPixelCorrection({ raw, scene, baseline: baselineOf(), returned, heads: [near] })).toThrow('located head inside its return');
    expect(() => composeHeadPixelCorrection({ raw: { ...raw, width: 511 }, scene, baseline: baselineOf(), returned, heads: [head] })).toThrow('aligned RGBA');
  });
});

describe('scheduling only the measured-fade refusal of a normal composition', () => {
  const answer = (patch: object = {}) => JSON.stringify({ version: 'single-sol-medium/v1', head: { version: 'target-head-return/v2-visible-completeness',
    rawHead: head, shippingHead: head, rawCrown: 'pass', shippingCrown: 'pass', observation: 'Synthetic complete crown in RAW and SHIPPING.', ...patch } });
  const row = (patch: Record<string, unknown> = {}, faults = [{ check: 'childComplete', where: MEASURED_HEAD_FADE_REASON }], raw = answer()) => ({ status: 'FAILED', assetId: 'ast-synthetic',
    judgeJson: JSON.stringify({ reviewState: 'board-review-complete', compositionVersion: 'bounded-return/v4-authored-source-boundaries', verdict: { verdict: 'fail', faults },
      boardReview: { dual: { single: 'single-sol-medium/v1', quality: { raw, headEvidence: { version: 'target-head-return/v2-visible-completeness', returned, retention: {} } } } }, ...patch }) });
  it('admits only a measured-fade refusal with passing located crowns', () => expect(headPixelCorrectionCandidate(row())).toBe(true));
  it.each([
    ['another fault (e.g. a real garland)', row({}, [{ check: 'childComplete', where: MEASURED_HEAD_FADE_REASON }, { check: 'pictureWhole', where: 'garland' }])],
    ['an open diagnosing cycle', row({ selfRepair: { phase: 'diagnosing' } })],
    ['an existing correction', row({ headPixelCorrection: {} })],
    ['a recovery composition', row({ authoredRecovery: {} })],
    ['a visual crown failure', row({}, undefined, answer({ shippingCrown: 'fail' }))],
    ['a head closer than the minimum gap', row({}, undefined, answer({ rawHead: { ...head, top: 201 }, shippingHead: { ...head, top: 201 } }))],
  ])('refuses %s', (_label, candidate) => expect(headPixelCorrectionCandidate(candidate)).toBe(false));
  it('refuses a generated row and an unmeasured or v1 head', () => {
    expect(headPixelCorrectionCandidate({ ...row(), status: 'GENERATED' })).toBe(false);
    const v1 = JSON.parse(row().judgeJson); v1.boardReview.dual.quality.headEvidence = { version: 'target-head-return/v1', returned };
    expect(headPixelCorrectionCandidate({ ...row(), judgeJson: JSON.stringify(v1) })).toBe(false);
  });
});

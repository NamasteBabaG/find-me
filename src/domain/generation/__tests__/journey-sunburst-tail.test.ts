import { describe, expect, it } from 'vitest';
import { JOURNEY_SUNBURST_TAIL_AUTHORITIES } from '../../../../content/detectives/journey-sunburst-tail-v1';
import { JOURNEY_SOURCE_HEAD_AUTHORITIES } from '../../../../content/detectives/journey-source-head-v2';
import { journeyHeadAlpha, journeyHeadAuthorityFor, journeyHeadHash, composeJourneySourceHead, journeyHeadMarkerSchema, JOURNEY_SOURCE_HEAD_VERSION,
  JOURNEY_SUNBURST_HEAD_PAINTER } from '../journey-source-head';
import { assertJourneySunburstTailManifest, journeySunburstTailAuthorityFor,
  JOURNEY_SUNBURST_TAIL_VERSION, journeySunburstTailPinId } from '../journey-sunburst-tail';
import type { AuthoredLocalPatchReturnContract } from '../../scene/local-patch-return-region';

const parentFor = (a: typeof JOURNEY_SUNBURST_TAIL_AUTHORITIES[number]) => ({
  version: 'bounded-return/v4-authored-source-boundaries', contentVersion: 13, boardId: a.boardId,
  hideId: a.hideId, source: a.source, crop: a.crop, child: a.parentChild, local: a.parentReturn,
  region: { left: a.crop.left + a.parentReturn.left, top: a.crop.top + a.parentReturn.top,
    width: a.parentReturn.width, height: a.parentReturn.height },
  sourcePlacement: { manifestSha256: 'a'.repeat(64), basePlacementSha256: a.basePlacementSha256 },
}) as AuthoredLocalPatchReturnContract;
const at = (a: Uint8Array, x: number, y: number) => a[y * 512 + x];

describe('finite Sunburst tail public SOURCE head permissions', () => {
  it('binds only the three published source roles and each exact original parent', () => {
    expect(() => assertJourneySunburstTailManifest()).not.toThrow();
    expect(JOURNEY_SUNBURST_TAIL_AUTHORITIES.map(a => a.hideId)).toEqual([
      'amazon-detectives-hide-3', 'greatwall-detectives-hide-1', 'paris-detectives-hide-1',
    ]);
    for (const a of JOURNEY_SUNBURST_TAIL_AUTHORITIES) {
      const p = parentFor(a);
      expect(journeySunburstTailAuthorityFor(p)).toBe(a);
      expect(journeySunburstTailAuthorityFor({ ...p, source: { ...p.source, sha256: 'f'.repeat(64) } })).toBeNull();
      expect(journeySunburstTailAuthorityFor({ ...p, child: { ...p.child, top: p.child.top + 1 } })).toBeNull();
      expect(journeySunburstTailAuthorityFor({ ...p, local: { ...p.local, left: p.local.left + 1 } })).toBeNull();
      expect(journeySunburstTailAuthorityFor({ ...p, contentVersion: 12 })).toBeNull();
    }
  });

  it('protects the continuing legs, map reader and Paris feet while opening the target and SOURCE ponytail', () => {
    const [amazon, wall, paris] = JOURNEY_SUNBURST_TAIL_AUTHORITIES;
    const aa = journeyHeadAlpha(amazon), wa = journeyHeadAlpha(wall), pa = journeyHeadAlpha(paris);
    expect(at(aa, 380, 250)).toBe(255);
    expect(at(aa, 470, 420)).toBe(255); // Original visible ponytail must not survive a face-only replacement.
    expect(at(aa, 340, 185)).toBe(0); // Continuing upper child's SOURCE lower leg.
    expect(at(aa, 390, 180)).toBe(0);
    expect(at(aa, 380, 560)).toBe(0); // Lower helper's whole head stays SOURCE.
    expect(at(wa, 310, 350)).toBe(255);
    expect(at(wa, 240, 340)).toBe(0); // Teal map reader's continuing arm/body.
    expect(at(wa, 400, 420)).toBe(0); // Neighbor in pink.
    expect(at(pa, 185, 198)).toBe(0); // Padded target registration overlaps the rear child's foot.
    expect(at(pa, 210, 260)).toBe(255);
    expect(paris.protectedSourceFragments).toEqual(JOURNEY_SOURCE_HEAD_AUTHORITIES[1]!.protectedSourceFragments);
  });

  it.each(JOURNEY_SUNBURST_TAIL_AUTHORITIES)('resolves the new marker only for its exact parent, hide and permission: $hideId', a => {
    const marker = { version: JOURNEY_SUNBURST_TAIL_VERSION, authorizationSha256: 'a'.repeat(64), authoritySha256: journeyHeadHash(a),
      rowId: 'synthetic-row', hideId: a.hideId, originalAttempts: 1, authorizedAttempt: 2,
      previousJudgeSha256: 'b'.repeat(64), requestKey: a.hideId + ':' + a.pose + ':render:2', painterRelease: JOURNEY_SUNBURST_HEAD_PAINTER };
    const parent = parentFor(a);
    expect(journeyHeadAuthorityFor(parent, marker)).toBe(a);
    expect(journeyHeadAuthorityFor(parent, { ...marker, hideId: 'foreign-hide' })).toBeNull();
    expect(journeyHeadAuthorityFor(parent, { ...marker, authoritySha256: 'f'.repeat(64) })).toBeNull();
    expect(journeyHeadAuthorityFor(parent, { ...marker, painterRelease: undefined })).toBeNull();
  });

  it.each(JOURNEY_SUNBURST_TAIL_AUTHORITIES)('keeps native paid pixels and the entire SOURCE exterior for $hideId', a => {
    const alpha = journeyHeadAlpha(a), source = new Uint8Array(512 * 768 * 4), raw = new Uint8Array(source.length);
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      source[i] = (x * 3 + y) % 256; source[i + 1] = (x + y * 5) % 256; source[i + 2] = (x + y) % 256; source[i + 3] = 255;
    }
    raw.set(source);
    for (let i = 0; i < alpha.length; i++) if (alpha[i]) raw[i * 4] = (raw[i * 4]! + 61) % 256;
    const shape = { width: 512, height: 768, channels: 4 };
    const made = composeJourneySourceHead(a, { ...shape, data: source }, { ...shape, data: raw });
    let paid = 0;
    for (let i = 0; i < alpha.length; i++) {
      const expected = alpha[i] ? raw : source;
      if (alpha[i]) paid++;
      for (let c = 0; c < 4; c++) if (made.pixels[i * 4 + c] !== expected[i * 4 + c]) throw Error('A native paid or protected SOURCE pixel changed');
    }
    expect(paid).toBeGreaterThan(5_000);
    expect(made.proof).toMatchObject({ outsideMaskChangedPixels: 0, paidHeadChangedPixels: 0, borderMeanDiff: 0, shift: { dx: 0, dy: 0 } });
    expect(() => composeJourneySourceHead({ ...a, id: 'unpublished' } as unknown as typeof a, { ...shape, data: source }, { ...shape, data: raw })).toThrow(/unknown permission/);
    raw[3] = 0;
    expect(() => composeJourneySourceHead(a, { ...shape, data: source }, { ...shape, data: raw })).toThrow(/opaque/);
  });

  it('uses distinct finite ids and refuses a tail marker without the exact HIGH/LOW painter', () => {
    expect(journeySunburstTailPinId('synthetic-world', 'amazon-detectives-hide-3')).not.toBe(journeySunburstTailPinId('synthetic-world', 'paris-detectives-hide-1'));
    const old = { version: JOURNEY_SOURCE_HEAD_VERSION, authorizationSha256: 'a'.repeat(64), authoritySha256: 'b'.repeat(64),
      rowId: 'synthetic-row', hideId: 'amazon-detectives-hide-3', originalAttempts: 1, authorizedAttempt: 2,
      previousJudgeSha256: 'c'.repeat(64), requestKey: 'amazon-detectives-hide-3:standing:render:2' };
    expect(journeyHeadMarkerSchema.parse(old)).toEqual(old);
    expect(journeyHeadMarkerSchema.safeParse({ ...old, version: JOURNEY_SUNBURST_TAIL_VERSION }).success).toBe(false);
    expect(journeyHeadMarkerSchema.parse({ ...old, version: JOURNEY_SUNBURST_TAIL_VERSION, painterRelease: JOURNEY_SUNBURST_HEAD_PAINTER })).toMatchObject({ version: JOURNEY_SUNBURST_TAIL_VERSION });
  });
});

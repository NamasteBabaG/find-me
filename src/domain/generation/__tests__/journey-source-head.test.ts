import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { JOURNEY_SOURCE_HEAD_AUTHORITIES, JOURNEY_SOURCE_HEAD_MANIFEST_SHA256 } from '../../../../content/detectives/journey-source-head-v2';
import { DETECTIVE_SOURCE_PLACEMENT_RELEASE, DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 } from '../../../../content/detectives/source-placement-release';
import { SOURCE_BODY_REPAIR_MANIFEST } from '../../../../content/detectives/source-body-repair';
import { authoredLocalPatchReturnContract } from '../../scene/local-patch-return-region';
import { sourceHeadMarkerSchema, pointInSourceHeadPolygon } from '../source-head-recovery';
import { assertJourneyHeadManifest, journeyHeadAuthorityFor, journeyHeadAlpha, journeyHeadBytesHash, journeyHeadHash,
  journeyHeadMarkerSchema, journeyHeadMarker, journeyHeadPaintDirection, composeJourneySourceHead,
  JOURNEY_SOURCE_HEAD_VERSION, type JourneyHeadPixels } from '../journey-source-head';

const image = (): JourneyHeadPixels => {
  const data = new Uint8Array(512 * 768 * 4);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) data.set([x % 256, y % 256, (x + y) % 256, 255], (y * 512 + x) * 4);
  return { data, width: 512, height: 768, channels: 4 };
};

describe('prospective journey SOURCE heads', () => {
  it('binds both public roles to the original active body geometry and native SOURCE bytes', async () => {
    expect(() => assertJourneyHeadManifest()).not.toThrow();
    expect(journeyHeadHash(JOURNEY_SOURCE_HEAD_AUTHORITIES)).toBe(JOURNEY_SOURCE_HEAD_MANIFEST_SHA256);
    expect(JOURNEY_SOURCE_HEAD_AUTHORITIES.map(a => a.hideId)).toEqual(['newyork-detectives-hide-1', 'paris-detectives-hide-1']);
    for (const a of JOURNEY_SOURCE_HEAD_AUTHORITIES) {
      const entry = DETECTIVE_SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === a.hideId)!;
      const body = SOURCE_BODY_REPAIR_MANIFEST.entries.find(e => e.hideId === a.hideId);
      expect(a.child).toEqual(body?.child ?? entry.effective.child);
      expect(a.returned).toEqual(body?.returnRect ?? entry.effective.returnRect);
      const source = await readFile(a.source.art);
      expect(journeyHeadBytesHash(source)).toBe(a.source.sha256);
      expect(journeyHeadBytesHash(await sharp(source).png().toBuffer())).toBe(a.sourcePngSha256);
      const parent = authoredLocalPatchReturnContract({ contentVersion: 13, boardId: a.boardId, hideId: a.hideId,
        source: a.source, crop: a.crop, child: a.child, authored: a.returned,
        sourcePlacement: { manifestSha256: DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256, basePlacementSha256: entry.basePlacementSha256 } });
      expect(journeyHeadAuthorityFor(parent)).toEqual(a);
      expect(journeyHeadAuthorityFor({ ...parent, contentVersion: 12 })).toBeNull();
      expect(journeyHeadAuthorityFor({ ...parent, sourcePlacement: { ...parent.sourcePlacement!, basePlacementSha256: '0'.repeat(64) } })).toBeNull();
      expect(journeyHeadAuthorityFor({ ...parent, local: { ...parent.local, top: parent.local.top + 1 } })).toBeNull();
    }
  });

  it('keeps the rear SOURCE feet protected inside the padded Paris target-head registration', () => {
    const a = JOURNEY_SOURCE_HEAD_AUTHORITIES[1], alpha = journeyHeadAlpha(a);
    let protectedInsideTargetBox = 0, protectedFootPixels = 0, changedFootPixels = 0;
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      if (!a.protectedSourceFragments.some(p => pointInSourceHeadPolygon(p.polygon, x + .5, y + .5))) continue;
      protectedFootPixels++; if (alpha[y * 512 + x]) changedFootPixels++;
      if (x >= a.targetRegisteredHead.left && x < a.targetRegisteredHead.left + a.targetRegisteredHead.width
        && y >= a.targetRegisteredHead.top && y < a.targetRegisteredHead.top + a.targetRegisteredHead.height) protectedInsideTargetBox++;
    }
    expect(protectedFootPixels).toBeGreaterThan(300);
    expect(protectedInsideTargetBox).toBeGreaterThan(50);
    expect(changedFootPixels).toBe(0);
    expect(alpha[250 * 512 + 215]).toBe(255);
    expect(alpha[430 * 512 + 160]).toBe(0); // original hand, outside head permission
  });

  it.each(JOURNEY_SOURCE_HEAD_AUTHORITIES)('copies the whole permitted paid head at native axes and every outside SOURCE pixel: $hideId', a => {
    const source = image(), raw = { ...source, data: new Uint8Array(source.data) }, alpha = journeyHeadAlpha(a);
    for (let i = 0; i < alpha.length; i++) if (alpha[i]) raw.data.set([203, 117, 61, 255], i * 4);
    const result = composeJourneySourceHead(a, source, raw);
    let bad = 0, headPixels = 0;
    for (let i = 0; i < alpha.length; i++) {
      if (alpha[i]) headPixels++;
      const expected = alpha[i] ? raw.data : source.data;
      for (let c = 0; c < 4; c++) if (result.pixels[i * 4 + c] !== expected[i * 4 + c]) bad++;
    }
    expect(headPixels).toBeGreaterThan(10_000); expect(bad).toBe(0);
    expect(result.proof).toMatchObject({ version: JOURNEY_SOURCE_HEAD_VERSION, shift: { dx: 0, dy: 0 },
      outsideMaskChangedPixels: 0, paidHeadChangedPixels: 0 });
    expect(JSON.parse(JSON.stringify(result.proof))).toStrictEqual(result.proof);
    expect(journeyHeadBytesHash(alpha)).toBe(result.proof.maskSha256);
  });

  it('discards RAW-only background registration instead of translating the new head or SOURCE body', () => {
    const a = JOURNEY_SOURCE_HEAD_AUTHORITIES[0], source = image(), raw = { ...source, data: new Uint8Array(source.data) }, alpha = journeyHeadAlpha(a);
    for (let y = 0; y < 768; y++) for (let x = 0; x < 510; x++) raw.data.set(source.data.subarray((y * 512 + x + 2) * 4, (y * 512 + x + 2) * 4 + 4), (y * 512 + x) * 4);
    for (let i = 0; i < alpha.length; i++) if (alpha[i]) raw.data.set([201, 37, 89, 255], i * 4);
    const result = composeJourneySourceHead(a, source, raw);
    expect(result.proof.discardedRawBackgroundBestShift).toMatchObject({ dx: -2, dy: 0 });
    expect(result.proof.shift).toEqual({ dx: 0, dy: 0 });
    expect([...result.pixels.slice((320 * 512 + 230) * 4, (320 * 512 + 230) * 4 + 4)]).toEqual([201, 37, 89, 255]);
    expect(result.proof.outsideMaskChangedPixels).toBe(0); expect(result.proof.paidHeadChangedPixels).toBe(0);
  });

  it('refuses foreign permissions, non-native/translucent RAW and an unsafe protected exterior', () => {
    const a = JOURNEY_SOURCE_HEAD_AUTHORITIES[0], source = image();
    expect(() => journeyHeadAlpha({ ...a, protectedBelow: 700 } as unknown as typeof a)).toThrow(/unknown permission/);
    expect(() => composeJourneySourceHead(a, source, { ...source, width: 1024 })).toThrow(/exact native/);
    const transparent = { ...source, data: new Uint8Array(source.data) }; transparent.data[3] = 0;
    expect(() => composeJourneySourceHead(a, source, transparent)).toThrow(/opaque/);
    const bad = { ...source, data: new Uint8Array(source.data.length) };
    for (let i = 0; i < bad.data.length; i += 4) bad.data.set([255, 255, 255, 255], i);
    expect(() => composeJourneySourceHead(a, source, bad)).toThrow(/unchanged24/);
  });

  it('keeps scene12 finite markers separate and asks for genuine new natural age7 evidence', () => {
    const a = JOURNEY_SOURCE_HEAD_AUTHORITIES[0];
    const marker = journeyHeadMarkerSchema.parse({ version: JOURNEY_SOURCE_HEAD_VERSION, authorizationSha256: '1'.repeat(64),
      authoritySha256: journeyHeadHash(a), rowId: 'synthetic-row', hideId: a.hideId, originalAttempts: 1, authorizedAttempt: 2,
      previousJudgeSha256: '2'.repeat(64), requestKey: a.hideId + ':' + a.pose + ':render:2' });
    expect(sourceHeadMarkerSchema.safeParse(marker).success).toBe(false);
    expect(journeyHeadMarker({ judgeJson: JSON.stringify({ journeyHeadRecovery: marker }) })).toEqual(marker);
    expect(journeyHeadMarker({ judgeJson: 'unreadable' })).toBeNull();
    expect(journeyHeadPaintDirection(a, 7)).toContain('orange-jacket flower child');
    expect(journeyHeadPaintDirection(JOURNEY_SOURCE_HEAD_AUTHORITIES[1], 7)).toContain('protected SOURCE');
    expect(journeyHeadPaintDirection(a, 7)).toContain('natural task-focused');
    expect(journeyHeadPaintDirection(a, 7)).not.toContain('narrow estimates');
    expect(() => journeyHeadPaintDirection(a, 9)).toThrow(/stated age7/);
    expect(journeyHeadHash({ b: 1, a: [3, 2] })).toBe(journeyHeadHash({ a: [3, 2], b: 1 }));
    expect(journeyHeadHash(undefined)).toBe(journeyHeadHash(undefined));
    expect(journeyHeadHash(undefined)).not.toBe(journeyHeadHash(null));
  });
});

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { sha256Bytes } from "../fixed-sprite";
import { extractBoardSprites, BoardSpriteExtractionError, type BoardSpriteSeed } from "../board-sprite-extraction";

async function fixture(starts = [5, 30, 55], width = 100, height = 50) {
  const rgba = Buffer.alloc(width * height * 4);
  const set = (x: number, y: number, alpha = 253) => rgba.set([x * 2 % 256, y * 3 % 256, 123, alpha], (y * width + x) * 4);
  for (const left of starts) for (let y = 6; y <= 25; y++) for (let x = left; x < left + 10; x++) set(x, y);
  const seeds: BoardSpriteSeed[] = starts.map((left, i) => ({
    slotId: `slot-${i}`, eye: { x: left + 4.25, y: 10.5 }, chin: { x: left + 4.25, y: 16.5 },
    protectedFacePolygon: [{ x: left + 2, y: 8 }, { x: left + 8, y: 8 }, { x: left + 8, y: 18 }, { x: left + 2, y: 18 }],
    measurement: { kind: "observed", note: "Synthetic native source observations; no board fitting." },
  }));
  const encode = () => sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { rgba, width, height, starts, set, seeds, encode };
}

async function expectCode(promise: Promise<unknown>, code: BoardSpriteExtractionError["code"]) {
  await expect(promise).rejects.toMatchObject({ name: "BoardSpriteExtractionError", code });
}

describe("board-specific alpha sprite extraction", () => {
  it("accepts an opaque chin outside the protected inner-face polygon, while checking chin alpha separately", async () => {
    const f = await fixture();
    for (const seed of f.seeds) {
      seed.protectedFacePolygon[2]!.y = 15;
      seed.protectedFacePolygon[3]!.y = 15;
    }
    expect((await extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds })).sprites).toHaveLength(3);
    f.set(9, 16, 223);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "unusable-face");
  });

  it("requires the eye/chin midpoint inside the inner-face polygon", async () => {
    const f = await fixture();
    f.seeds[0]!.protectedFacePolygon[2]!.y = 12;
    f.seeds[0]!.protectedFacePolygon[3]!.y = 12;
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "invalid-landmarks");
  });

  it("extracts three figures in seed order, translating fractional landmarks without snapping", async () => {
    const f = await fixture(), sheetPng = await f.encode(), before = structuredClone(f.seeds);
    const r = await extractBoardSprites({ sheetPng, expectedSheetSha256: sha256Bytes(sheetPng), seeds: f.seeds });
    expect(r.sheetSha256).toBe(sha256Bytes(sheetPng)); expect(r.sheetRgbaSha256).toBe(sha256Bytes(f.rgba));
    expect(r.sprites).toHaveLength(3); expect(r.unseededComponents).toEqual([]); expect(f.seeds).toEqual(before);
    for (const [i, s] of r.sprites.entries()) {
      expect(s.slotId).toBe(`slot-${i}`); expect(s.sha256).toBe(sha256Bytes(s.png));
      expect(s.eye).toEqual({ x: 12.25, y: 12.5 }); expect(s.chin).toEqual({ x: 12.25, y: 18.5 });
      expect(s.extraction.sheetToSource).toEqual({ scale: 1, translateX: 8 - f.starts[i]!, translateY: 2 });
      expect(s.extraction.sourceSheetBounds).toEqual({ left: f.starts[i], top: 6, width: 10, height: 20 });
      expect(s.extraction.retainedPixels).toBe(200); expect(s.extraction.requiresBoundaryReview).toBe(false);
      expect(s.extraction.padding).toEqual({ left: 8, top: 8, right: 8, bottom: 8 });
      expect(s).not.toHaveProperty("lowerCutY"); expect(s).not.toHaveProperty("feet");
      const raw = await sharp(s.png).ensureAlpha().raw().toBuffer();
      for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
        const p = (y * s.width + x) * 4;
        if (!raw[p + 3]) continue;
        const sx = x - s.extraction.sheetToSource.translateX, sy = y - s.extraction.sheetToSource.translateY, q = (sy * f.width + sx) * 4;
        expect(raw.subarray(p, p + 4)).toEqual(f.rgba.subarray(q, q + 4));
      }
    }
    expect((await extractBoardSprites({ sheetPng, seeds: [...f.seeds].reverse() })).sprites.map(s => s.slotId)).toEqual(["slot-2", "slot-1", "slot-0"]);
  });

  it("preserves exactly the existing three-pixel attached weak fringe, without recoloring", async () => {
    const f = await fixture(); f.set(4, 12, 31); f.set(3, 12, 7); f.set(2, 12, 1); f.set(1, 12, 12);
    const r = await extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), s = r.sprites[0]!;
    expect(s.extraction.retainedWeakPixels).toBe(3); expect(s.extraction.sourceSheetBounds.left).toBe(2);
    expect(s.extraction.originalFrame.pixelCount).toBe(0);
    const raw = await sharp(s.png).ensureAlpha().raw().toBuffer(), x = 2 + s.extraction.sheetToSource.translateX, y = 12 + s.extraction.sheetToSource.translateY;
    expect([...raw.subarray((y * s.width + x) * 4, (y * s.width + x) * 4 + 4)]).toEqual([4, 36, 123, 1]);
  });

  it("reports weak original frame contact separately from raw sheet noise and never pads it away", async () => {
    const f = await fixture([2, 30, 55]); f.set(1, 12, 11); f.set(0, 12, 7); f.set(0, 40, 23);
    const r = await extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), s = r.sprites[0]!;
    expect(r.sheetFrame).toMatchObject({ pixelCount: 2, maxAlpha: 23, strongPixelCount: 0 });
    expect(s.extraction.originalFrame).toMatchObject({ pixelCount: 1, maxAlpha: 7, strongPixelCount: 0 });
    expect(s.extraction.boundaryStatus).toBe("weak-only"); expect(s.extraction.requiresBoundaryReview).toBe(true);
    expect(s.extraction.originalFrameContact.left).toBe(true); expect(s.extraction.padding.left).toBe(0);
    const raw = await sharp(s.png).ensureAlpha().raw().toBuffer();
    expect(raw[((12 + s.extraction.sheetToSource.translateY) * s.width) * 4 + 3]).toBe(7);
  });

  it.each(["left", "right", "top", "bottom"] as const)("rejects strong clipping at the original %s edge", async edge => {
    const f = await fixture();
    if (edge === "left") for (let x = 0; x < 5; x++) f.set(x, 12, 32);
    if (edge === "right") for (let x = 65; x < f.width; x++) f.set(x, 12, 32);
    if (edge === "top") for (let y = 0; y < 6; y++) f.set(9, y, 32);
    if (edge === "bottom") for (let y = 26; y < f.height; y++) f.set(9, y, 32);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "strong-frame-contact");
  });

  it("uses eight-connectivity, rejecting even a diagonal strong bridge between two faces", async () => {
    const f = await fixture([5, 16, 55]); f.set(15, 5, 32);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "merged-sources");
  });

  it("rejects weak fringe shared by two otherwise separate figures", async () => {
    const f = await fixture([5, 16, 55]); f.set(15, 12, 31);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "ambiguous-fringe");
  });

  it("reports a tiny unseeded speckle but rejects a fourth substantial component", async () => {
    const f = await fixture(); f.set(40, 2, 255);
    const r = await extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds });
    expect(r.unseededComponents).toHaveLength(1); expect(r.unseededComponents[0]!.strongPixels).toBe(1);
    expect(r.sprites.map(s => s.extraction.retainedPixels)).toEqual([200, 200, 200]);
    for (let y = 6; y < 14; y++) for (let x = 75; x < 79; x++) f.set(x, y);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "wrong-source-count");
  });

  it("bounds total detached noise instead of accepting arbitrarily many small components", async () => {
    const f = await fixture();
    for (let i = 0; i < 9; i++) for (let y = 35; y < 38; y++) for (let x = 5 + i * 10; x < 8 + i * 10; x++) f.set(x, y);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "wrong-source-count");
  });

  it("preserves more than 64 strong hair-detail pixels attached through existing weak alpha, byte for byte", async () => {
    const f = await fixture();
    for (const left of f.starts) for (const top of [6, 13, 20]) {
      for (let y = top; y < top + 4; y++) for (let x = left - 3; x <= left - 2; x++) f.set(x, y, 70);
      f.set(left - 1, top + 1, 12);
    }
    const r = await extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds });
    expect(r.attachedDetailComponents).toHaveLength(9); expect(r.unseededComponents).toHaveLength(0);
    for (const s of r.sprites) {
      expect(s.extraction.retainedPixels).toBe(227);
      const raw = await sharp(s.png).raw().toBuffer();
      for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
        const p = (y * s.width + x) * 4;
        if (!raw[p + 3]) continue;
        const sx = x - s.extraction.sheetToSource.translateX, sy = y - s.extraction.sheetToSource.translateY;
        expect(raw.subarray(p, p + 4)).toEqual(f.rgba.subarray((sy * f.width + sx) * 4, (sy * f.width + sx) * 4 + 4));
      }
    }
  });

  it("does not connect detail islands across clear pixels or reset the three-pixel weak fringe budget", async () => {
    const f = await fixture();
    f.set(4, 12, 12); f.set(3, 12, 12); f.set(2, 12, 60);
    f.set(1, 12, 12); f.set(0, 12, 12);
    f.set(2, 30, 60);
    const r = await extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds });
    expect(r.attachedDetailComponents).toHaveLength(1); expect(r.unseededComponents).toHaveLength(1);
    expect(r.sprites[0]!.extraction.sourceSheetBounds.left).toBe(1);
    expect(r.sprites[0]!.extraction.originalFrame.pixelCount).toBe(0);
  });

  it("rejects a small strong detail connected to two figures through weak strands", async () => {
    const f = await fixture([5, 18, 55]);
    f.set(15, 12, 12); f.set(16, 12, 60); f.set(17, 12, 12);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "ambiguous-fringe");
  });

  it("does not hide strong frame clipping merely because a weak strand joins the clipped detail", async () => {
    const f = await fixture([2, 30, 55]); f.set(1, 12, 12); f.set(0, 12, 60);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "strong-frame-contact");
  });

  it.each([0, 223])("rejects a protected-face hole/translucency at alpha %s without repair", async alpha => {
    const f = await fixture(); f.set(8, 12, alpha);
    await expectCode(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), "unusable-face");
  });

  it("accepts the existing 224 face threshold and preserves its alpha exactly", async () => {
    const f = await fixture(); f.set(8, 12, 224);
    const r = await extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds }), s = r.sprites[0]!, raw = await sharp(s.png).raw().toBuffer();
    const x = 8 + s.extraction.sheetToSource.translateX, y = 12 + s.extraction.sheetToSource.translateY;
    expect(raw[(y * s.width + x) * 4 + 3]).toBe(224);
  });

  it("rejects an eye in transparent pixels and a chin on another component", async () => {
    const f = await fixture(), png = await f.encode(); f.seeds[0]!.eye.x = 1;
    // Keep the malformed eye inside its polygon so alpha, not polygon validation, rejects it.
    f.seeds[0]!.protectedFacePolygon[0]!.x = 0; f.seeds[0]!.protectedFacePolygon[3]!.x = 0;
    await expectCode(extractBoardSprites({ sheetPng: png, seeds: f.seeds }), "unusable-face");
    const g = await fixture(); g.seeds[0]!.chin.x = 34; g.seeds[0]!.protectedFacePolygon[1]!.x = 36; g.seeds[0]!.protectedFacePolygon[2]!.x = 36;
    await expectCode(extractBoardSprites({ sheetPng: await g.encode(), seeds: g.seeds }), "unusable-face");
  });

  it("rejects wrong seed count, duplicate IDs, and duplicate component seeds", async () => {
    const f = await fixture(), sheetPng = await f.encode();
    await expectCode(extractBoardSprites({ sheetPng, seeds: f.seeds.slice(0, 2) }), "invalid-input");
    f.seeds[1]!.slotId = f.seeds[0]!.slotId;
    await expectCode(extractBoardSprites({ sheetPng, seeds: f.seeds }), "invalid-input");
    f.seeds[1] = { ...f.seeds[0]!, slotId: "different-id" };
    await expectCode(extractBoardSprites({ sheetPng, seeds: f.seeds }), "merged-sources");
  });

  it.each(["nan", "outside", "chin-above", "zero-area", "missing-measurement"])("rejects malformed observed input: %s", async invalid => {
    const f = await fixture(), s = f.seeds[0]!;
    if (invalid === "nan") s.eye.x = Number.NaN;
    if (invalid === "outside") s.chin.x = f.width;
    if (invalid === "chin-above") s.chin.y = s.eye.y - 1;
    if (invalid === "zero-area") s.protectedFacePolygon = [{ x: 8, y: 8 }, { x: 9, y: 9 }, { x: 10, y: 10 }];
    if (invalid === "missing-measurement") s.measurement.note = " ";
    await expect(extractBoardSprites({ sheetPng: await f.encode(), seeds: f.seeds })).rejects.toBeInstanceOf(BoardSpriteExtractionError);
  });

  it("rejects a hash mismatch, opaque PNG, invalid bytes and truncated PNG", async () => {
    const f = await fixture(), sheetPng = await f.encode();
    await expectCode(extractBoardSprites({ sheetPng, expectedSheetSha256: "0".repeat(64), seeds: f.seeds }), "bound-sheet-mismatch");
    const opaque = await sharp(sheetPng).removeAlpha().png().toBuffer();
    await expectCode(extractBoardSprites({ sheetPng: opaque, seeds: f.seeds }), "invalid-input");
    await expectCode(extractBoardSprites({ sheetPng: Buffer.from("not an image"), seeds: f.seeds }), "decode-failed");
    await expectCode(extractBoardSprites({ sheetPng: sheetPng.subarray(0, Math.floor(sheetPng.length / 2)), seeds: f.seeds }), "decode-failed");
  });

  it("does not mutate the input sheet or its seed objects", async () => {
    const f = await fixture(), sheetPng = await f.encode(), prior = Buffer.from(sheetPng), seeds = JSON.stringify(f.seeds);
    await extractBoardSprites({ sheetPng, seeds: f.seeds });
    expect(sheetPng).toEqual(prior); expect(JSON.stringify(f.seeds)).toBe(seeds);
  });

  it("snapshots bytes and observations before async decoding so caller mutations cannot change provenance", async () => {
    const f = await fixture(), sheetPng = await f.encode(), expected = sha256Bytes(sheetPng);
    const pending = extractBoardSprites({ sheetPng, expectedSheetSha256: expected, seeds: f.seeds });
    sheetPng.fill(0); f.seeds[0]!.eye.x = Number.NaN; f.seeds[0]!.measurement.note = "changed after dispatch";
    const r = await pending;
    expect(r.sheetSha256).toBe(expected); expect(r.sprites[0]!.eye.x).toBe(12.25);
    expect(r.sprites[0]!.measurement.note).toContain("Synthetic native");
  });

  it("rejects self-intersecting polygons but permits an explicit repeated closing point", async () => {
    const f = await fixture(), sheetPng = await f.encode();
    f.seeds[0]!.protectedFacePolygon.push({ ...f.seeds[0]!.protectedFacePolygon[0]! });
    expect((await extractBoardSprites({ sheetPng, seeds: f.seeds })).sprites).toHaveLength(3);
    f.seeds[0]!.protectedFacePolygon = [{ x: 7, y: 8 }, { x: 13, y: 18 }, { x: 7, y: 18 }, { x: 13, y: 8 }, { x: 13, y: 17 }];
    await expectCode(extractBoardSprites({ sheetPng, seeds: f.seeds }), "invalid-landmarks");
  });
});

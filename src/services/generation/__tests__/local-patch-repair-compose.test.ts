import sharp from "sharp";
import { createHash } from "node:crypto";
import { beforeAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recomputePaidPatchJoin, LOCAL_PATCH_REPAIR_COMPOSITION_VERSION, type PaidPatchJoinInput } from "../local-patch-repair-compose";

const crop = { left: 400, top: 300, width: 512, height: 768 };
const returnWindow = { left: 100, top: 220, width: 320, height: 420 };
const protectedCore = { left: 210, top: 400, width: 80, height: 160 };
const faceRect = { left: 225, top: 410, width: 35, height: 35 };
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
const grayPng = (bytes: Buffer) => sharp(bytes, { raw: { width: 512, height: 768, channels: 1 } }).toColourspace("b-w").png().toBuffer();
let fixture: PaidPatchJoinInput, weights: Buffer;
beforeAll(async () => {
  const beforePng = await sharp({ create: { width: 3072, height: 2048, channels: 4, background: "#606060" } }).png().toBuffer();
  const pixels = Buffer.alloc(768 * 1152 * 4);
  for (let y = 0; y < 1152; y++) for (let x = 0; x < 768; x++) {
    const p = (y * 768 + x) * 4; pixels[p] = 180 + (x * 3 + y) % 37; pixels[p + 1] = 150 + (x + y * 2) % 43; pixels[p + 2] = 120 + (x * 2 + y * 3) % 41; pixels[p + 3] = 255;
  }
  const rawPng = await sharp(pixels, { raw: { width: 768, height: 1152, channels: 4 } }).png().toBuffer();
  const hard = (x: number, y: number) => x >= 192 && x < 308 && y >= 382 && y < 578;
  weights = Buffer.alloc(512 * 768);
  for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
    const label = hard(x, y); let distance = 3.5;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= 3 && hard(x + dx, y + dy) !== label) distance = Math.min(distance, d - .5);
    }
    weights[y * 512 + x] = Math.round(255 * (distance > 3 ? Number(label) : .5 + (label ? 1 : -1) * distance / 6));
  }
  fixture = { beforePng, rawPng, alphaPng: await grayPng(weights), crop, returnWindow, protectedCore, faceRect };
});
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No provider or network in deterministic composition"); })); });
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });

describe("recomputing a frozen paid-image background join", () => {
  it("uses exact saved alpha arithmetic, protects every child pixel and restores every outside pixel", async () => {
    const beforeHashes = [fixture.beforePng, fixture.rawPng, fixture.alphaPng].map(sha);
    const result = await recomputePaidPatchJoin(fixture);
    const source = await sharp(fixture.beforePng).extract(crop).ensureAlpha().raw().toBuffer();
    const paid = await sharp(fixture.rawPng).resize(512, 768, { fit: "fill" }).png().toBuffer();
    const raw = await sharp(paid).ensureAlpha().raw().toBuffer(), candidate = await sharp(result.candidatePng).ensureAlpha().raw().toBuffer();
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      const p = y * 512 + x;
      for (let c = 0; c < 3; c++) if (candidate[p * 4 + c] !== Math.round(raw[p * 4 + c]! * weights[p]! / 255 + source[p * 4 + c]! * (1 - weights[p]! / 255))) throw new Error(`Blend mismatch at${x},${y},${c}`);
      if (x < 100 || x >= 420 || y < 220 || y >= 640) if (!candidate.subarray(p * 4, p * 4 + 4).equals(source.subarray(p * 4, p * 4 + 4))) throw new Error("Outside pixels changed");
      if (x >= 198 && x < 302 && y >= 388 && y < 572) if (!candidate.subarray(p * 4, p * 4 + 4).equals(raw.subarray(p * 4, p * 4 + 4))) throw new Error("Protected pixels changed");
    }
    expect(result.version).toBe(LOCAL_PATCH_REPAIR_COMPOSITION_VERSION); expect(result.version).toBe("paid-mask-join/v1");
    expect(result.audit).toMatchObject({ state: "UNREVIEWED", outsideChangedPixels: 0, protectedChangedPixels: 0, protectedGuardPx: 12, maximumFeatherWidthPx: 6,
      originalRawSeamReport: { verdict: "background-rewritten" }, sourceSha256: beforeHashes[0], rawSha256: beforeHashes[1], alphaSha256: beforeHashes[2], resizedRawSha256: sha(paid) });
    expect(result.audit.originalRawSeamReport.borderMeanDiff).toBeGreaterThan(24);
    expect(result.audit.blendedPixels).toBeGreaterThan(0); expect(result.audit.paidPixels).toBeGreaterThan(0);
    expect(result.audit.blendedPixels + result.audit.paidPixels + result.audit.originalPixels).toBe(512 * 768);
    expect(result.candidateSha256).toBe(sha(result.candidatePng));
    expect([fixture.beforePng, fixture.rawPng, fixture.alphaPng].map(sha)).toEqual(beforeHashes);
    const replay = await recomputePaidPatchJoin({ ...fixture, beforePng: Buffer.from(fixture.beforePng), rawPng: Buffer.from(fixture.rawPng), alphaPng: Buffer.from(fixture.alphaPng) });
    expect(replay.candidatePng.equals(result.candidatePng)).toBe(true); expect(replay.audit).toEqual(result.audit);
    expect(result.geometry).toEqual({ rect: { x: 400 / 3072, y: 300 / 2048, w: 512 / 3072, h: 768 / 2048 },
      hitRect: { x: 610 / 3072, y: 700 / 2048, w: 80 / 3072, h: 160 / 2048 }, anchor: { x: 642.5 / 3072, y: 710 / 2048 } });
  });
  it("also accepts an already-native512x768 paid PNG without further resampling", async () => {
    const rawPng = await sharp(fixture.rawPng).resize(512, 768, { fit: "fill" }).png().toBuffer();
    const result = await recomputePaidPatchJoin({ ...fixture, rawPng });
    expect(result.candidateSha256).toBe((await recomputePaidPatchJoin(fixture)).candidateSha256);
  });
  it.each([
    { crop: { ...crop, width: 511 } }, { crop: { ...crop, left: 400.5 } }, { crop: { ...crop, left: 3000 } },
    { returnWindow: { ...returnWindow, width: 600 } }, { returnWindow: { ...returnWindow, top: NaN } },
    { protectedCore: { ...protectedCore, left: 105 } }, { faceRect: { ...faceRect, width: 29 } },
    { faceRect: { ...faceRect, left: 285 } }, { protectedCore: { ...protectedCore, width: 0 } },
  ])("rejects malformed or unprotected native geometry %#", async defect => {
    await expect(recomputePaidPatchJoin({ ...fixture, ...defect })).rejects.toThrow("LOCAL_PATCH_REPAIR_COMPOSE");
  });
  it.each(["outside", "core", "guard", "wide-feather", "paid-island", "fractional-island", "hole", "hard-edge"])("rejects %s alpha tampering", async defect => {
    const alpha = Buffer.from(weights);
    const put = (x: number, y: number, value: number) => { alpha[y * 512 + x] = value; };
    if (defect === "outside") put(10, 10, 1);
    if (defect === "core") put(230, 450, 254);
    if (defect === "guard") put(198, 450, 254);
    if (defect === "wide-feather") put(196, 450, 250);
    if (defect === "paid-island") put(120, 240, 255);
    if (defect === "fractional-island") put(120, 240, 30);
    if (defect === "hole") put(195, 450, 0);
    if (defect === "hard-edge") { put(191, 450, 0); put(192, 450, 255); }
    await expect(recomputePaidPatchJoin({ ...fixture, alphaPng: await grayPng(alpha) })).rejects.toThrow("LOCAL_PATCH_REPAIR_COMPOSE");
  });
  it.each(["rgb-mask", "wrong-mask-size", "raw-aspect", "board-size", "transparent-raw", "unreadable"])("rejects %s image payload", async defect => {
    let changed: Partial<PaidPatchJoinInput>;
    if (defect === "rgb-mask") changed = { alphaPng: await sharp(fixture.alphaPng).toColourspace("srgb").png().toBuffer() };
    else if (defect === "wrong-mask-size") changed = { alphaPng: await sharp(fixture.alphaPng).resize(511, 768).toColourspace("b-w").png().toBuffer() };
    else if (defect === "raw-aspect") changed = { rawPng: await sharp(fixture.rawPng).resize(767, 1152).png().toBuffer() };
    else if (defect === "board-size") changed = { beforePng: await sharp(fixture.beforePng).resize(1536, 1024).png().toBuffer() };
    else if (defect === "transparent-raw") changed = { rawPng: await sharp({ create: { width: 512, height: 768, channels: 4, background: { r: 255, g: 200, b: 0, alpha: .5 } } }).png().toBuffer() };
    else changed = { rawPng: Buffer.from("not an image") };
    await expect(recomputePaidPatchJoin({ ...fixture, ...changed })).rejects.toThrow();
  });
});

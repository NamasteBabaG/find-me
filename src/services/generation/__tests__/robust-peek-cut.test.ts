import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { chooseRobustPeekCut, auditRobustPeekSources, ROBUST_PEEK_CUT_VERSION } from "../robust-peek-cut";
import { findSimplePeekCut, type SimplePeekUncutInput } from "../simple-peek";
import { sha256Bytes } from "../fixed-sprite";

const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
async function fixture(maskKind: "slope" | "narrow" | "single-row-bottleneck" = "slope", frameDefect = false): Promise<SimplePeekUncutInput> {
  const bw = 80, bh = 110, sw = 20, sh = 64;
  const rgba = Buffer.alloc(sw * sh * 4);
  for (let y = 4; y < 56; y++) for (let x = 5; x < 15; x++) rgba.set([170, 80, 60, 255], (y * sw + x) * 4);
  if (frameDefect) rgba.set([170, 80, 60, 255], (10 * sw) * 4);
  const sourcePng = await sharp(rgba, { raw: { width: sw, height: sh, channels: 4 } }).png().toBuffer();
  const board = await sharp({ create: { width: bw, height: bh, channels: 4, background: "#384970" } }).png().toBuffer();
  const fg = Buffer.alloc(bw * bh * 4);
  for (let y = 45; y < bh; y++) {
    const narrow = maskKind === "narrow" || maskKind === "single-row-bottleneck" && y === 50;
    const left = narrow ? 33 : maskKind === "single-row-bottleneck" ? 20 : Math.max(20, 38 - (y - 45) * 3);
    const right = narrow ? 47 : maskKind === "single-row-bottleneck" ? 60 : Math.min(60, 42 + (y - 45) * 3);
    if (maskKind === "single-row-bottleneck" && (y < 48 || y > 53)) continue;
    for (let x = left; x <= right; x++) fg.set([0x38, 0x49, 0x70, 255], (y * bw + x) * 4);
  }
  const foreground = await sharp(fg, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();
  return { source: { ...bound(sourcePng), eye: { x: 10, y: 12 }, chin: { x: 10, y: 20 },
    protectedFacePolygon: [{ x: 8, y: 10 }, { x: 12, y: 10 }, { x: 12, y: 20 }, { x: 8, y: 20 }], measurement: { kind: "observed", note: "synthetic known landmarks" } },
    board: bound(board), foreground: bound(foreground),
    slot: { id: "fixture-peek", pose: "front-peek", eye: { x: 40, y: 30 }, faceHeightPx: 8, window: { left: 0, top: 0, width: bw, height: bh } } };
}
describe("opt-in deeper already-occluded cut with continuous side margin", () => {
  it("finds generous cover below a sloped first hidden row without moving or changing any image", async () => {
    const input = await fixture(), before = { source: input.source.sha256, board: input.board.sha256, mask: input.foreground.sha256, slot: JSON.stringify(input.slot) };
    const first = await findSimplePeekCut(input, { minCutY: 28 }), robust = await chooseRobustPeekCut(input, { minCutY: 28 });
    expect(robust).not.toBeNull(); expect(robust!.lowerCutY).toBeGreaterThan(first!);
    expect(robust!.firstHiddenCut).toBe(first); expect(robust!.version).toBe(ROBUST_PEEK_CUT_VERSION);
    expect(robust!.margin.worstSideMarginPx).toBeGreaterThanOrEqual(8);
    expect(robust!.margin.coveredNativeRows).toBeGreaterThanOrEqual(3);
    expect(Object.values(robust!.composite.checks).every(Boolean)).toBe(true);
    expect(robust!.composite.transform).toEqual({ scale: 1, translateX: 30, translateY: 18 });
    expect({ source: sha256Bytes(input.source.png), board: sha256Bytes(input.board.png), mask: sha256Bytes(input.foreground.png), slot: JSON.stringify(input.slot) }).toEqual(before);
    expect(robust!.automaticRelease).toBe(false); expect(robust!.semanticStatus).toBe("pending");
  });
  it("refuses a narrow mask even when the historical first-hidden cut exists", async () => {
    const input = await fixture("narrow");
    expect(await findSimplePeekCut(input, { minCutY: 28 })).not.toBeNull();
    expect(await chooseRobustPeekCut(input, { minCutY: 28 })).toBeNull();
  });
  it("does not measure slack on only one convenient native board row", async () => {
    const input = await fixture("single-row-bottleneck");
    expect(await findSimplePeekCut(input, { minCutY: 28 })).not.toBeNull();
    expect(await chooseRobustPeekCut(input, { minCutY: 28 })).toBeNull();
  });
  it("keeps visible side/frame defects rejected even below a broad mask", async () => {
    const input = await fixture("slope", true);
    expect(await chooseRobustPeekCut(input, { minCutY: 28 })).toBeNull();
  });
  it("preserves bound image and face-clearance validation", async () => {
    const input = await fixture(); input.foreground.sha256 = "0".repeat(64);
    await expect(chooseRobustPeekCut(input, { minCutY: 28 })).rejects.toThrow(/bound image bytes changed/);
    await expect(chooseRobustPeekCut(await fixture(), { minCutY: 20 })).rejects.toThrow(/one face distance/);
  });
  it("audits each supplied silhouette separately without changing the shared destination", async () => {
    const input = await fixture();
    const audit = await auditRobustPeekSources({ ...input, sources: [{ id: "first-child", source: input.source }, { id: "second-child", source: input.source }] });
    expect(audit.passed).toBe(true); expect(audit.sourceCount).toBe(2);
    expect(audit.results.every(r => r.margin!.worstSideMarginPx >= input.slot.faceHeightPx)).toBe(true);
  });
});

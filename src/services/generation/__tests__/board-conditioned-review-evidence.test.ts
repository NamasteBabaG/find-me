import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { assertReviewImage, parseReviewSlots, prepareFinalReviewImages, restoreReviewSourceInput,
  reviewMetadata, reviewOcclusionMode, verifyReviewReplay, type ReviewReplay } from "../../../../scripts/board-conditioned-review-evidence";
import { boardConditioningHash, type BoardConditioningInput, type PreparedBoardConditionedSource } from "../board-conditioned-source";
import { sha256Bytes } from "../fixed-sprite";

const bound = (png: Buffer) => ({ png, sha256: sha256Bytes(png) });
async function fixture() {
  const board = await sharp({ create: { width: 100, height: 120, channels: 4, background: "#556677" } }).png().toBuffer();
  const rgba = Buffer.alloc(100 * 120 * 4);
  // Final tone-treated, partly occluded figure with a one-alpha contour pixel.
  for (let y = 30; y < 60; y++) for (let x = 40; x < 55; x++) rgba.set([88, 53, 43, 255], (y * 100 + x) * 4);
  rgba.set([88, 53, 43, 1], (29 * 100 + 39) * 4);
  const patchPng = await sharp(rgba, { raw: { width: 100, height: 120, channels: 4 } }).png().toBuffer();
  const foreground = await sharp({ create: { width: 100, height: 120, channels: 4, background: "transparent" } }).png().toBuffer();
  const direction: BoardConditioningInput["slots"][number] = { slot: { id: "fixture", pose: "front-peek", eye: { x: 48, y: 40 }, faceHeightPx: 10,
    window: { left: 0, top: 0, width: 100, height: 120 } }, foreground: bound(foreground),
    context: { left: 0, top: 0, width: 100, height: 120 }, originalPeople: { left: 0, top: 0, width: 20, height: 20 },
    poseDescription: "Natural activity", wardrobe: "Muted blue clothing", lighting: { key: "Cool sky", fill: "Paving fill", shadows: "Soft shade", exposure: "Subdued matte" } };
  return { patchPng, direction, board, compositePng: await sharp(board).composite([{ input: patchPng }]).png().toBuffer() };
}

describe("final board visual review evidence", () => {
  it("defaults to all slots and permits a stable narrowed selection", () => {
    expect(parseReviewSlots()).toEqual([1, 2, 3]); expect(parseReviewSlots("3,1")).toEqual([1, 3]); expect(parseReviewSlots("2")).toEqual([2]);
  });
  it.each(["", "0", "4", "1,1", "1,", "1, 2", "-1", "1;2"])("refuses invalid paid selection %s", value => {
    expect(() => parseReviewSlots(value)).toThrow(/FINAL_REVIEW/);
  });
  it("uses exact final alpha and toned RGB without resampling or hidden raw-source pixels", async () => {
    const f = await fixture(), images = await prepareFinalReviewImages(f);
    expect(images.evidence.patchRect).toEqual({ left: 39, top: 29, width: 16, height: 31 });
    const expected = await sharp(f.patchPng).extract(images.evidence.patchRect).ensureAlpha().raw().toBuffer();
    expect(await sharp(images.patchPng).ensureAlpha().raw().toBuffer()).toEqual(expected);
    expect(images.evidence.patchCropRgbaSha256).toBe(sha256Bytes(expected));
    expect(images.evidence.fullPatchSha256).toBe(sha256Bytes(f.patchPng));
    expect(images.evidence.source).toBe("replayed-final-premasked-patch");
    expect((await sharp(images.patchPng).metadata()).height).toBe(31);
    assertReviewImage(images.boardCrop, await sharp(f.compositePng).extract(images.evidence.contextRect).png().toBuffer(), "board");
  });
  it("refuses an empty visible result and mismatched exported images", async () => {
    const f = await fixture();
    await expect(prepareFinalReviewImages({ ...f, patchPng: f.direction.foreground.png })).rejects.toThrow(/empty/);
    expect(() => assertReviewImage(f.patchPng, f.board, "tampered patch")).toThrow(/differs/);
  });
  it("does not confuse whole-source open placement with absence of authored foreground", async () => {
    const f = await fixture(), open = { ...f.direction, slot: { ...f.direction.slot, mode: "open" as const, pose: "standing" as const } };
    expect(await reviewOcclusionMode(open)).toBe("open");
    expect(await reviewOcclusionMode({ ...open, foreground: bound(f.board) })).toBe("clipped");
    expect(await reviewOcclusionMode(f.direction)).toBe("clipped");
  });
  it("restores frozen source geometry only with the exact original foreground and identity", async () => {
    const f = await fixture();
    const input: BoardConditioningInput = { boardId: "fixture", board: bound(f.board), child: { profileId: "fixture-child", ageYears: 8,
      illustratedIdentity: bound(f.board), referenceRole: "illustrated-identity" }, slots: [f.direction] };
    const { foreground: _foreground, ...direction } = f.direction;
    const contract = { boardId: "fixture", boardSha256: input.board.sha256, child: { profileId: "fixture-child", ageYears: 8,
      illustratedIdentitySha256: input.child.illustratedIdentity.sha256, referenceRole: "illustrated-identity", matchingPoseIds: null },
      directions: [direction], cells: [{ slotId: "fixture", foregroundSha256: f.direction.foreground.sha256 }] } as PreparedBoardConditionedSource["contract"];
    const changed = { ...input, slots: [{ ...f.direction, slot: { ...f.direction.slot, eye: { x: 70, y: 60 } } }] };
    expect(restoreReviewSourceInput(contract, changed).slots[0]!.slot.eye).toEqual({ x: 48, y: 40 });
    expect(() => restoreReviewSourceInput(contract, { ...changed, slots: [] })).toThrow(/source-spec/);
    expect(() => restoreReviewSourceInput({ ...contract, boardSha256: "wrong" }, changed)).toThrow(/artwork/);
  });
  it("binds reuse metadata and source provenance, rejecting modified transforms or hashes", () => {
    const provenance = { destination: { contractSha256: "destination" }, source: { contractSha256: "paid-original" } };
    const replay = { version: "board-conditioned-geometry-reuse/v1", state: "review-required", boardId: "fixture", automaticRelease: false,
      previewIsDiagnostic: false, provenance, provenanceSha256: boardConditioningHash(provenance),
      appearances: [{ slotId: "slot-1", composite: { transform: { scale: 1 }, patchPng: Buffer.from("final pixels") } }] } as unknown as ReviewReplay;
    const saved = reviewMetadata(replay) as Record<string, unknown>;
    expect(() => verifyReviewReplay(saved, replay)).not.toThrow();
    expect(() => verifyReviewReplay({ ...saved, appearances: [] }, replay)).toThrow(/appearances/);
    expect(() => verifyReviewReplay({ ...saved, provenanceSha256: "other" }, replay)).toThrow(/provenance/);
    expect(() => verifyReviewReplay({ ...saved, automaticRelease: true }, replay)).toThrow(/unreleased/);
  });
  it("retains normal-run contract and paid source/measurement validation", () => {
    const contract = { boardId: "fixture" };
    const replay = { state: "review-required", boardId: "fixture", automaticRelease: false, previewIsDiagnostic: true,
      contract, contractSha256: boardConditioningHash(contract), appearances: [],
      source: { pngSha256: "sheet", fingerprint: "source-paid" }, measurement: { fingerprint: "observer-paid" } } as unknown as ReviewReplay;
    const saved = reviewMetadata(replay) as Record<string, unknown>;
    expect(() => verifyReviewReplay(saved, replay)).not.toThrow();
    expect(() => verifyReviewReplay({ ...saved, measurement: { fingerprint: "other" } }, replay)).toThrow(/measurement/);
    expect(() => verifyReviewReplay({ ...saved, contract: { boardId: "other" } }, replay)).toThrow(/contract/);
  });
  it("binds the second same-sheet observation to its own selected charge, not just its repeated fingerprint", () => {
    const contract = { boardId: "fixture" }, charge = { requestKey: "board:fixture:measure:2", state: "settled", evidence: { providerRequestId: "req-observer-2" } };
    const replay = { state: "review-required", boardId: "fixture", automaticRelease: false, previewIsDiagnostic: false,
      contract, contractSha256: boardConditioningHash(contract), appearances: [], measurementAttempt: 2, measurementCharge: charge,
      source: { pngSha256: "same-paid-sheet", fingerprint: "source-paid" }, measurement: { fingerprint: "same-observer-input", evidence: charge.evidence } } as unknown as ReviewReplay;
    const saved = reviewMetadata(replay) as Record<string, unknown>;
    expect(() => verifyReviewReplay(saved, replay)).not.toThrow();
    expect(() => verifyReviewReplay({ ...saved, measurementAttempt: 1 }, replay)).toThrow(/attempt/);
    expect(() => verifyReviewReplay({ ...saved, measurementCharge: { ...charge, requestKey: "board:fixture:measure:1" } }, replay)).toThrow(/charge/);
  });
});

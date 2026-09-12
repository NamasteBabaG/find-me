import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareBoardPoseObservation, type BoardPoseObservationReceipt } from "../../../infra/generation/board-pose-observer";
import type { BoardConditioningInput } from "../board-conditioned-source";
import type { generateBoardConditionedAppearances } from "../board-conditioned-generation";
import { sha256Bytes } from "../fixed-sprite";
import { needsBoardSourceRemeasurement } from "../board-wizard-source-remeasurement";
import { BOARD_POSE_OBSERVER_SETTINGS } from "../../../infra/generation/board-pose-observer";

const policy = { reserveMicroUsd: 300_000, providerNamespace: "synthetic:test", timeoutMs: 1000 };
type Result = Awaited<ReturnType<typeof generateBoardConditionedAppearances>>;
async function fixture(draw?: (rgba: Buffer) => void) {
  const slots = ["a", "b", "c"].map(slotId => ({ slotId, pose: "standing" }));
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  for (const x of [170, 512, 853]) for (let y = 140; y < 800; y++) for (let xx = x - 60; xx < x + 60; xx++) rgba.set([80, 90, 100, 253], (y * 1024 + xx) * 4);
  draw?.(rgba);
  const png = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
  const prepared = await prepareBoardPoseObservation({ sheetPng: png, slots }, policy);
  const reading = (x: number, y: number) => ({ status: "observed" as const, point: { x, y }, confidence: .96, reason: "Synthetic native landmark" });
  const answer = { figureCount: 3, extraProps: false, reason: "Three complete synthetic figures", cells: slots.map((s, i) => {
    const x = [170, 512, 853][i]!;
    return { ...s, poseMatches: true, visibleHeadArmsComplete: true, eye: reading(x, 200), chin: reading(x, 250),
      standing: { complete: true, crown: reading(x, 140), leftSole: reading(x - 20, 799), rightSole: reading(x + 20, 799) },
      protectedFacePolygon: { status: "observed" as const, confidence: .96, reason: "Synthetic face with erroneous lower boundary", polygon: [{ x: x - 30, y: 175 }, { x: x + 30, y: 175 }, { x: x + 30, y: i === 0 ? 260 : 249 }, { x: x - 30, y: i === 0 ? 260 : 249 }] } };
  }) };
  const receipt: BoardPoseObservationReceipt = { version: "board-pose-observation-receipt/v1", fingerprint: prepared.fingerprint, sourceImageSha256: sha256Bytes(png),
    sourceRgbaSha256: prepared.capture.sourceRgbaSha256, wireImageSha256: prepared.capture.wireImageSha256, promptSha256: prepared.capture.promptSha256,
    slots, coordinates: "native-1024-sheet-pixel-edges", modelRequested: "gpt-5.6-sol", modelReturned: "gpt-5.6-sol", effort: BOARD_POSE_OBSERVER_SETTINGS.effort, requestId: "req-test", responseId: "chatcmpl-test",
    httpStatus: 200, serviceTier: "default", finishReason: "stop", responseText: JSON.stringify(answer), rawUsage: { prompt_tokens: 2000, completion_tokens: 400 }, costUnknown: false, costCents: 1.8, attempts: 1 };
  const input = { slots: slots.map(s => ({ slot: { id: s.slotId, pose: s.pose, mode: "open" } })) } as BoardConditioningInput;
  const result = { state: "source-review-required", source: { kind: "generated", png, pngSha256: sha256Bytes(png) },
    measurement: { status: "invalid", sources: null, sheetSha256: sha256Bytes(png), fingerprint: prepared.fingerprint, receipt,
      evidence: { providerRequestId: "req-test", providerNamespace: policy.providerNamespace, model: "gpt-5.6-sol", amountMicroUsd: 18000 } } } as unknown as Extract<Result, { state: "source-review-required" }>;
  return { answer, input, result, receipt, classify: async () => { receipt.responseText = JSON.stringify(answer); return needsBoardSourceRemeasurement(input, result, policy); } };
}
describe("same paid source measurement-error retry classification", () => {
  it("classifies a over-broad chin polygon without changing paid points, source pixels or receipt", async () => {
    const f = await fixture(), before = JSON.stringify(f.result), raw = JSON.stringify(f.answer), bytes = Buffer.from(f.result.source.png);
    expect(await needsBoardSourceRemeasurement(f.input, f.result, policy)).toBe(true);
    expect(JSON.stringify(f.result)).toBe(before); expect(JSON.stringify(f.answer)).toBe(raw); expect(f.result.source.png.equals(bytes)).toBe(true);
  });
  it("allows an exterior-only cheek measurement error beyond deterministic correction, not as a geometry pass", async () => {
    const f = await fixture(rgba => { for (let y = 170; y < 270; y++) for (let x = 110; x < 148; x++) rgba[(y * 1024 + x) * 4 + 3] = 0; });
    f.answer.cells[0]!.protectedFacePolygon.polygon.forEach(p => { if (p.y === 260) p.y = 249; });
    expect(await f.classify()).toBe(true); expect(f.result.measurement.status).toBe("invalid");
  });
  it.each(["extra-prop", "extra-child", "wrong-pose", "incomplete", "missing-sole", "uncertain-face", "second-observer", "already-valid", "extraction-error", "bad-http", "bad-finish", "wrong-source", "wrong-capture", "wrong-order", "unknown-cost"])("refuses another observation for %s", async kind => {
    const f = await fixture();
    if (kind === "extra-prop") f.answer.extraProps = true;
    if (kind === "extra-child") f.answer.figureCount = 4;
    if (kind === "wrong-pose") f.answer.cells[0]!.poseMatches = false;
    if (kind === "incomplete") f.answer.cells[0]!.visibleHeadArmsComplete = false;
    if (kind === "missing-sole") f.answer.cells[0]!.standing.complete = false;
    if (kind === "uncertain-face") f.answer.cells[0]!.eye.confidence = .5;
    if (kind === "second-observer") Object.assign(f.result, { measurementAttempt: 2 });
    if (kind === "already-valid") f.answer.cells[0]!.protectedFacePolygon.polygon.forEach(p => { if (p.y === 260) p.y = 249; });
    if (kind === "extraction-error") Object.assign(f.result, { extractionFailure: { code: "unusable-face" } });
    if (kind === "bad-http") f.receipt.httpStatus = 500;
    if (kind === "bad-finish") f.receipt.finishReason = "length";
    if (kind === "wrong-source") f.result.source.pngSha256 = "a".repeat(64);
    if (kind === "wrong-capture") f.receipt.sourceRgbaSha256 = "a".repeat(64);
    if (kind === "wrong-order") f.receipt.slots.reverse();
    if (kind === "unknown-cost") f.receipt.costUnknown = true;
    expect(await f.classify()).toBe(false);
  });
  it.each(["hole", "frame", "cell-edge", "blank-cell"])("does not spend to reinterpret actual %s source damage", async kind => {
    const f = await fixture(rgba => {
      if (kind === "hole") rgba[(210 * 1024 + 170) * 4 + 3] = 0;
      if (kind === "frame") rgba[(0 * 1024 + 170) * 4 + 3] = 253;
      if (kind === "cell-edge") rgba[(200 * 1024 + 341) * 4 + 3] = 253;
      if (kind === "blank-cell") for (let y = 0; y < 1024; y++) for (let x = 700; x < 1024; x++) rgba[(y * 1024 + x) * 4 + 3] = 0;
    });
    expect(await f.classify()).toBe(false);
  });
});

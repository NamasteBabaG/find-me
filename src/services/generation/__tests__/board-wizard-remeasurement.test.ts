import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { needsBoardStandingRemeasurement } from "../board-wizard-remeasurement";
import type { BoardConditioningInput } from "../board-conditioned-source";
import type { generateBoardConditionedAppearances } from "../board-conditioned-generation";

type Result = Awaited<ReturnType<typeof generateBoardConditionedAppearances>>;
let png: Buffer;
beforeAll(async () => {
  const rgba = Buffer.alloc(1024 * 1024 * 4);
  // Native sheet figure is NOT at the extracted sprite's local origin.
  for (let y = 100; y <= 800; y++) for (let x = 600; x <= 700; x++) rgba.set([30, 80, 120, 255], (y * 1024 + x) * 4);
  png = await sharp(rgba, { raw: { width: 1024, height: 1024, channels: 4 } }).png().toBuffer();
});
function fixture() {
  // Deliberately scoped structural fixture: this classifier does not replace
  // core provenance validation or manufacture a complete engine result.
  const input = { slots: [{ slot: { id: "standing", mode: "open", pose: "standing" } }] };
  const result = { state: "review-required", previewIsDiagnostic: true, source: { png },
    measurement: { status: "ok", sources: [{ slotId: "standing", standing: { complete: true,
      crown: { x: 650, y: 99 }, leftSole: { x: 610, y: 800 }, rightSole: { x: 690, y: 800 } } }] },
    appearances: [{ slotId: "standing", composite: { checks: { completeFigure: false } } }],
    extracted: { sprites: [{ slotId: "standing", extraction: { requiresBoundaryReview: false,
      originalFrameContact: { left: false, right: false, top: false, bottom: false } } }] } };
  return { input, result, classify: () => needsBoardStandingRemeasurement(input as BoardConditioningInput, result as unknown as Result) };
}
describe("one same-source standing observation retry classifier", () => {
  it("identifies an unsupported crown on the ORIGINAL sheet without altering it", async () => {
    const f = fixture(), before = JSON.stringify(f.result.measurement);
    expect(await f.classify()).toBe(true); expect(JSON.stringify(f.result.measurement)).toBe(before);
  });
  it("identifies a transparent sole but not a correctly supported point", async () => {
    const f = fixture(), standing = f.result.measurement.sources[0]!.standing;
    standing.crown.y = 100; expect(await f.classify()).toBe(false);
    standing.leftSole.x = 599; expect(await f.classify()).toBe(true);
  });
  it("does not confuse local padded sprite coordinates with sheet coordinates", async () => {
    const f = fixture(); f.result.measurement.sources[0]!.standing.crown.y = 100;
    Object.assign(f.result.extracted.sprites[0]!, { eye: { x: 25, y: 25 }, standing: { crown: { x: 1, y: 1 } } });
    expect(await f.classify()).toBe(false);
  });
  it.each(["incomplete", "frame", "weak-frame", "good-geometry", "non-standing", "not-open", "second-observation", "invalid-point"])("does not spend to bypass %s", async reason => {
    const f = fixture();
    if (reason === "incomplete") f.result.measurement.sources[0]!.standing.complete = false;
    if (reason === "frame") f.result.extracted.sprites[0]!.extraction.originalFrameContact.bottom = true;
    if (reason === "weak-frame") f.result.extracted.sprites[0]!.extraction.requiresBoundaryReview = true;
    if (reason === "good-geometry") f.result.appearances[0]!.composite.checks.completeFigure = true;
    if (reason === "non-standing") f.input.slots[0]!.slot.pose = "seated";
    if (reason === "not-open") f.input.slots[0]!.slot.mode = "clipped";
    if (reason === "second-observation") Object.assign(f.result, { measurementAttempt: 2 });
    if (reason === "invalid-point") f.result.measurement.sources[0]!.standing.crown.y = -1;
    expect(await f.classify()).toBe(false);
  });
});

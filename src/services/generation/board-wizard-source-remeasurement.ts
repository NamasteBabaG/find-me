import { BOARD_POSE_OBSERVER_SETTINGS, boardPoseObservationSchema, decideBoardPoseObservation, prepareBoardPoseObservation, type BoardPoseObserverPolicy } from "../../infra/generation/board-pose-observer";
import type { BoardConditioningInput } from "./board-conditioned-source";
import type { generateBoardConditionedAppearances } from "./board-conditioned-generation";
import { pointInPolygon, sha256Bytes } from "./fixed-sprite";

const measurementProblems = new Set([
  "Observed eye/chin is not supported by opaque source pixels",
  "Protected face has missing or transparent source pixels",
  "Face polygon leaves the observed facial vicinity",
  "Face polygon has repeated or subpixel edges",
  "Face polygon intersects itself",
  "Face polygon is a tiny patch or does not protect central facial features",
  "Face polygon lacks usable interior",
]);

/** Retry classification, never an approval or a corrected measurement. The same
 * paid PNG is observed once more under the existing ledger and attempt limit.
 * Missing anatomy, props, frame cuts, enclosed face holes and bad receipts must
 * not be relabeled as observer errors. No provider or checkpoint writes here. */
export async function needsBoardSourceRemeasurement(input: BoardConditioningInput,
  result: Awaited<ReturnType<typeof generateBoardConditionedAppearances>>, policy: BoardPoseObserverPolicy): Promise<boolean> {
  if (result.state !== "source-review-required" || result.measurementAttempt === 2
    || result.measurement.status !== "invalid" || "extractionFailure" in result && result.extractionFailure) return false;
  try {
    const m = result.measurement, r = m.receipt, source = result.source;
    if (!r?.responseText || source.kind !== "generated" || sha256Bytes(source.png) !== source.pngSha256
      || m.sheetSha256 !== source.pngSha256 || r.sourceImageSha256 !== source.pngSha256) return false;
    const expected = await prepareBoardPoseObservation({ sheetPng: source.png, slots: input.slots.map(s => ({ slotId: s.slot.id, pose: s.slot.pose })) }, policy);
    if (m.fingerprint !== expected.fingerprint || r.fingerprint !== expected.fingerprint || r.version !== "board-pose-observation-receipt/v1"
      || r.sourceRgbaSha256 !== expected.capture.sourceRgbaSha256 || r.wireImageSha256 !== expected.capture.wireImageSha256 || r.promptSha256 !== expected.capture.promptSha256
      || r.requestId !== m.evidence.providerRequestId || !r.responseId || r.costUnknown !== false || Math.ceil(r.costCents * 10_000) !== m.evidence.amountMicroUsd
      || m.evidence.providerNamespace !== policy.providerNamespace || m.evidence.model !== BOARD_POSE_OBSERVER_SETTINGS.model
      || r.modelRequested !== BOARD_POSE_OBSERVER_SETTINGS.model || r.modelReturned !== BOARD_POSE_OBSERVER_SETTINGS.model || r.effort !== BOARD_POSE_OBSERVER_SETTINGS.effort || r.attempts !== 1
      || r.coordinates !== "native-1024-sheet-pixel-edges" || r.finishReason !== "stop" || r.httpStatus === null || r.httpStatus < 200 || r.httpStatus >= 300
      || r.slots.length !== 3 || r.slots.some((s, i) => s.slotId !== expected.capture.slots[i]!.slotId || s.pose !== expected.capture.slots[i]!.pose)) return false;
    const parsed = boardPoseObservationSchema.safeParse(JSON.parse(r.responseText));
    if (!parsed.success) return false;
    const answer = parsed.data;
    if (answer.figureCount !== 3 || answer.extraProps !== false || answer.cells.some((c, i) =>
      c.slotId !== r.slots[i]!.slotId || c.pose !== r.slots[i]!.pose || c.poseMatches !== true || c.visibleHeadArmsComplete !== true
      || [c.eye, c.chin, c.protectedFacePolygon].some(p => p.status !== "observed" || p.confidence < BOARD_POSE_OBSERVER_SETTINGS.minConfidence)
      || c.pose === "standing" && (!c.standing || c.standing.complete !== true || [c.standing.crown, c.standing.leftSole, c.standing.rightSole].some(p => p.status !== "observed" || p.confidence < BOARD_POSE_OBSERVER_SETTINGS.minConfidence)))) return false;
    const verdict = decideBoardPoseObservation(answer, r.slots, expected.rgba, { standingPixelSupportAtComposition: true });
    if (verdict.status !== "invalid" || !measurementProblems.has(verdict.reason)) return false;
    const alpha = (x: number, y: number) => expected.rgba[(y * 1024 + x) * 4 + 3]!;
    // Frame and cell separation are checked on original pixels, not padding.
    for (let i = 0; i < 1024; i++) if ([alpha(i, 0), alpha(i, 1023), alpha(0, i), alpha(1023, i), alpha(341, i), alpha(682, i)].some(a => a >= 32)) return false;
    for (let cell = 0; cell < 3; cell++) {
      let strong = 0;
      for (let y = 0; y < 1024 && strong < 32; y++) for (let x = Math.ceil(cell * 1024 / 3); x < (cell + 1) * 1024 / 3 && strong < 32; x++) if (alpha(x, y) >= 224) strong++;
      if (strong < 32) return false;
    }
    // A low-alpha facial pixel must connect to the canvas exterior. Enclosed
    // holes remain painter/extraction defects, even if a fresh judge might miss them.
    const exterior = new Uint8Array(1024 * 1024), queue = new Int32Array(1024 * 1024); let head = 0, tail = 0;
    const add = (x: number, y: number) => { const n = y * 1024 + x; if (!exterior[n] && alpha(x, y) < 224) { exterior[n] = 1; queue[tail++] = n; } };
    for (let i = 0; i < 1024; i++) { add(i, 0); add(i, 1023); add(0, i); add(1023, i); }
    while (head < tail) { const n = queue[head++]!, x = n % 1024, y = Math.floor(n / 1024);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && x + dx < 1024 && y + dy >= 0 && y + dy < 1024) add(x + dx, y + dy);
    }
    for (const cell of answer.cells) {
      const eye = cell.eye.point!, chin = cell.chin.point!;
      for (const point of [eye, chin]) {
        const x = Math.floor(point.x), y = Math.floor(point.y);
        if (x >= 1024 || y >= 1024) return false;
        if (alpha(x, y) < 224) {
          if (!exterior[y * 1024 + x]) return false;
          let nearby = false;
          for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) if (Math.hypot(dx, dy) <= 12 && x + dx >= 0 && x + dx < 1024 && y + dy >= 0 && y + dy < 1024 && alpha(x + dx, y + dy) >= 224) nearby = true;
          if (!nearby) return false;
        }
      }
      const polygon = cell.protectedFacePolygon.polygon!;
      for (let y = Math.floor(Math.min(...polygon.map(p => p.y))); y < Math.min(1024, Math.ceil(Math.max(...polygon.map(p => p.y)))); y++)
        for (let x = Math.floor(Math.min(...polygon.map(p => p.x))); x < Math.min(1024, Math.ceil(Math.max(...polygon.map(p => p.x)))); x++)
          if (pointInPolygon({ x: x + .5, y: y + .5 }, polygon) && alpha(x, y) < 224 && !exterior[y * 1024 + x]) return false;
    }
    return true;
  } catch { return false; }
}

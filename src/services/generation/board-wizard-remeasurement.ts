import sharp from "sharp";
import type { BoardConditioningInput } from "./board-conditioned-source";
import type { generateBoardConditionedAppearances } from "./board-conditioned-generation";

/** A second observation may repair an unsupported reading, never missing anatomy.
 * Inspect ORIGINAL sheet pixels: extracted/padded sprite coordinates are different.
 * This classifier neither changes a landmark nor relaxes a placement check. */
export async function needsBoardStandingRemeasurement(
  input: BoardConditioningInput, result: Awaited<ReturnType<typeof generateBoardConditionedAppearances>>,
): Promise<boolean> {
  if (result.state !== "review-required" || !result.previewIsDiagnostic || result.measurementAttempt === 2
    || result.measurement.status !== "ok") return false;
  const candidates = input.slots.filter(direction => {
    if (direction.slot.mode !== "open" || direction.slot.pose !== "standing") return false;
    const appearance = result.appearances.find(a => a.slotId === direction.slot.id);
    const sprite = result.extracted.sprites.find(s => s.slotId === direction.slot.id);
    const observed = result.measurement.sources?.find(s => s.slotId === direction.slot.id);
    return appearance && "composite" in appearance && appearance.composite
      && "completeFigure" in appearance.composite.checks && appearance.composite.checks.completeFigure === false
      && observed?.standing?.complete === true && sprite
      && !sprite.extraction.requiresBoundaryReview
      && !Object.values(sprite.extraction.originalFrameContact).some(Boolean);
  });
  if (!candidates.length) return false;
  const pixels = await sharp(result.source.png, { limitInputPixels: 25_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (pixels.info.width !== 1024 || pixels.info.height !== 1024) return false;
  return candidates.some(direction => {
    const standing = result.measurement.sources!.find(s => s.slotId === direction.slot.id)!.standing!;
    return [standing.crown, standing.leftSole, standing.rightSole].some(point => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
      const x = Math.floor(point.x), y = Math.floor(point.y);
      return x >= 0 && y >= 0 && x < pixels.info.width && y < pixels.info.height
        && pixels.data[(y * pixels.info.width + x) * 4 + 3] === 0;
    });
  });
}

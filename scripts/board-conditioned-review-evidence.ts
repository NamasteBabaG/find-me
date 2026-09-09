/** Free evidence preparation for the final visual review. No providers or keys. */
import { isDeepStrictEqual } from "node:util";
import sharp from "sharp";
import { boardConditioningHash, type BoardConditioningInput, type PreparedBoardConditionedSource } from "../src/services/generation/board-conditioned-source";
import type { BoardRepositionResult } from "../src/services/generation/board-conditioned-reposition";
import type { generateBoardConditionedAppearances } from "../src/services/generation/board-conditioned-generation";
import { sha256Bytes } from "../src/services/generation/fixed-sprite";

type Contract = PreparedBoardConditionedSource["contract"];
type NormalResult = Extract<Awaited<ReturnType<typeof generateBoardConditionedAppearances>>, { state: "review-required" }>;
export type ReviewReplay = NormalResult | BoardRepositionResult;
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`FINAL_REVIEW: ${message}`);
}
export const reviewMetadata = (value: unknown): unknown => JSON.parse(JSON.stringify(value,
  (_key, item) => item?.type === "Buffer" && Array.isArray(item.data) ? undefined : item));

/** One-based indices, stable board order. No repeated calls from duplicates. */
export function parseReviewSlots(value?: string): number[] {
  if (value === undefined) return [1, 2, 3];
  demand(/^[123](,[123])*$/.test(value), "--slots must be comma-separated indices 1,2,3");
  const slots = value.split(",").map(Number);
  demand(new Set(slots).size === slots.length, "--slots contains duplicates");
  return slots.sort();
}

/** Restore original paid intent without changing its geometry or mask. If the
 * destination no longer contains an original mask, require explicit source
 * inputs rather than searching for or inventing replacement pixels. */
export function restoreReviewSourceInput(contract: Contract, destination: BoardConditioningInput): BoardConditioningInput {
  demand(contract.boardId === destination.boardId && contract.boardSha256 === destination.board.sha256,
    "original artwork differs from destination");
  const child = contract.child;
  demand(child.illustratedIdentitySha256 === destination.child.illustratedIdentity.sha256,
    "original child image differs from destination");
  return {
    boardId: contract.boardId, ...(contract.sourcePresentation ? { sourcePresentation: contract.sourcePresentation } : {}),
    board: destination.board,
    child: { profileId: child.profileId, ageYears: child.ageYears, illustratedIdentity: destination.child.illustratedIdentity,
      referenceRole: child.referenceRole, ...(child.matchingPoseIds ? { matchingPoseIds: child.matchingPoseIds } : {}) },
    slots: contract.directions.map(direction => {
      const cell = contract.cells.find(cell => cell.slotId === direction.slot.id);
      const foreground = destination.slots.find(slot => slot.foreground.sha256 === cell?.foregroundSha256)?.foreground;
      demand(foreground, `original foreground missing for ${direction.slot.id}; supply --source-spec`);
      return { ...structuredClone(direction), foreground };
    }),
  };
}

/** Compare saved exported metadata with a new SAME-CODE cached replay. The
 * replay caller independently validates paid checkpoints and durable receipts. */
export function verifyReviewReplay(saved: unknown, replay: ReviewReplay): void {
  demand(saved !== null && typeof saved === "object", "saved result required");
  const result = saved as Record<string, unknown>;
  demand(result.state === "review-required" && result.boardId === replay.boardId, "result board/state differs");
  demand(result.automaticRelease === false, "result must remain unreleased");
  demand(isDeepStrictEqual(result.appearances, reviewMetadata(replay.appearances)), "saved appearances differ from exact replay");
  demand(result.previewIsDiagnostic === replay.previewIsDiagnostic, "saved diagnostic state differs");
  if ("provenance" in replay) {
    demand(result.version === replay.version && result.provenanceSha256 === boardConditioningHash(result.provenance)
      && result.provenanceSha256 === replay.provenanceSha256
      && isDeepStrictEqual(result.provenance, reviewMetadata(replay.provenance)), "source/destination provenance differs from exact replay");
  } else {
    demand(result.contractSha256 === replay.contractSha256 && result.contractSha256 === boardConditioningHash(result.contract)
      && isDeepStrictEqual(result.contract, replay.contract), "original frozen contract differs");
    const source = result.source as Record<string, unknown> | undefined;
    const measurement = result.measurement as Record<string, unknown> | undefined;
    demand(source?.pngSha256 === replay.source.pngSha256 && source.fingerprint === replay.source.fingerprint
      && measurement?.fingerprint === replay.measurement.fingerprint, "original paid source/measurement differs");
    demand((result.measurementAttempt ?? 1) === (replay.measurementAttempt ?? 1), "selected measurement attempt differs");
    if (replay.measurementAttempt === 2) demand(isDeepStrictEqual(result.measurementCharge, reviewMetadata(replay.measurementCharge))
      && isDeepStrictEqual(measurement?.evidence, reviewMetadata(replay.measurement.evidence)), "second observation charge differs from exact replay");
  }
}

export function assertReviewImage(actual: Buffer, replayed: Buffer, label: string): void {
  demand(sha256Bytes(actual) === sha256Bytes(replayed), `${label} differs from exact replay`);
}

/** Engine "open" means a complete source/no artificial cut, not that an
 * authored original foreground layer is forbidden. Give the visual reviewer
 * the intended layer semantics; only the final image can justify occlusion. */
export async function reviewOcclusionMode(direction: BoardConditioningInput["slots"][number]): Promise<"open" | "clipped"> {
  if (direction.slot.mode !== "open") return "clipped";
  const pixels = await sharp(direction.foreground.png).extract(direction.slot.window).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return "clipped";
  return "open";
}

/** Exact destination pixels, already resized/toned/masked by the compositor.
 * Tight alpha crop only: no source sprite, enlargement, relighting or masking
 * happens here. The judge adapter's wire resizing is retained separately. */
export async function prepareFinalReviewImages(args: {
  patchPng: Buffer; compositePng: Buffer; direction: BoardConditioningInput["slots"][number];
}) {
  const patch = await sharp(args.patchPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const board = await sharp(args.compositePng).metadata();
  const w = patch.info.width, h = patch.info.height;
  demand(board.width === w && board.height === h, "patch and final composite frames differ");
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (patch.data[(y * w + x) * 4 + 3]) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  demand(maxX >= minX && maxY >= minY, "final visible patch is empty");
  const patchRect = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const slot = args.direction.slot;
  // Include the entire actual visible patch; never crop its hand/sole away.
  const side = Math.min(w, h, Math.max(550, Math.round((slot.standingHeightPx ?? slot.faceHeightPx * 6) * 3), patchRect.width, patchRect.height));
  const left = Math.max(0, Math.min(w - side, minX, Math.max(maxX - side + 1, Math.round(slot.eye.x - side / 2))));
  const top = Math.max(0, Math.min(h - side, minY, Math.max(maxY - side + 1, Math.round(slot.eye.y - side / 3))));
  const contextRect = { left, top, width: side, height: side };
  demand(maxX < left + side && maxY < top + side, "final visible patch does not fit review context");
  const patchPng = await sharp(args.patchPng).extract(patchRect).png().toBuffer();
  const boardCrop = await sharp(args.compositePng).extract(contextRect).png().toBuffer();
  return { patchPng, boardCrop, evidence: {
    version: "exact-final-premasked-patch/v1" as const, patchRect, contextRect,
    fullPatchSha256: sha256Bytes(args.patchPng), fullCompositeSha256: sha256Bytes(args.compositePng),
    patchCropSha256: sha256Bytes(patchPng), boardCropSha256: sha256Bytes(boardCrop),
    patchCropRgbaSha256: sha256Bytes(await sharp(patchPng).ensureAlpha().raw().toBuffer()),
    source: "replayed-final-premasked-patch" as const, cropOnly: true as const,
  } };
}

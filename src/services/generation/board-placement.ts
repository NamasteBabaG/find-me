import type { BoardConditioningInput } from "./board-conditioned-source";
import type { ExtractedBoardSprite } from "./board-sprite-extraction";
import type { ObservedBoardPoseSource } from "../../infra/generation/board-pose-observer";
import { composeOpenPlacement } from "./open-placement";
import { composeSimplePeek, findSimplePeekCut, type SimplePeekInput } from "./simple-peek";
import { chooseRobustPeekCut } from "./robust-peek-cut";
import { applyCompositingTone } from "./compositing-tone";

/** Shared by production and player replay. Never infer soles from alpha bounds. */
export async function composeBoardPlacement(board: BoardConditioningInput["board"],
  direction: BoardConditioningInput["slots"][number], sprite: ExtractedBoardSprite,
  observed: Pick<ObservedBoardPoseSource, "standing">) {
  const grade = direction.slot.compositingTone ? await applyCompositingTone(sprite, direction.slot.compositingTone) : null;
  const source = { png: grade?.source.png ?? sprite.png, sha256: grade?.source.sha256 ?? sprite.sha256, eye: sprite.eye, chin: sprite.chin,
    protectedFacePolygon: sprite.protectedFacePolygon, measurement: sprite.measurement };
  // An absent optional grade returns the EXACT old object shape and PNG bytes.
  // The raw extracted source above remains immutable and independently replayed.
  const withTone = <T extends object>(composite: T) => grade ? { ...composite, compositingTone: grade.provenance } : composite;
  if (direction.slot.mode === "open") {
    const slot = direction.slot, standing = observed.standing;
    if (slot.pose !== "standing" || !slot.supportPointPx || !slot.standingHeightPx || !standing) return null;
    const t = sprite.extraction.sheetToSource;
    const move = (p: { x: number; y: number }) => ({ x: p.x + t.translateX, y: p.y + t.translateY });
    const composite = await composeOpenPlacement({ board, foreground: direction.foreground,
      slot: { ...slot, pose: "standing", mode: "open", supportPointPx: slot.supportPointPx, standingHeightPx: slot.standingHeightPx },
      source: { ...source, standing: { complete: standing.complete, crown: move(standing.crown), leftSole: move(standing.leftSole), rightSole: move(standing.rightSole),
        originalFrameClear: !sprite.extraction.requiresBoundaryReview && !Object.values(sprite.extraction.originalFrameContact).some(Boolean) } } });
    return { composite: withTone(composite), cut: null };
  }
  if (direction.slot.pose === "standing") return null;
  const slot: SimplePeekInput["slot"] = { ...direction.slot, pose: direction.slot.pose };
  const uncut = { board, foreground: direction.foreground, slot, source };
  if (direction.slot.cutSelection === "two-hidden-rows-one-face-side-margin/v1") {
    const robust = await chooseRobustPeekCut(uncut, { minCutY: Math.ceil(sprite.chin.y + Math.hypot(sprite.chin.x - sprite.eye.x, sprite.chin.y - sprite.eye.y)) });
    return robust === null ? null : { composite: withTone(robust.composite), cut: robust.lowerCutY, robustness: robust.margin };
  }
  const cut = await findSimplePeekCut(uncut, { minCutY: Math.ceil(sprite.chin.y + Math.hypot(sprite.chin.x - sprite.eye.x, sprite.chin.y - sprite.eye.y)) });
  return cut === null ? null : { composite: withTone(await composeSimplePeek({ ...uncut, source: { ...source, lowerCutY: cut } })), cut };
}

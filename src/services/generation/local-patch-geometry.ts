import {
  LOCAL_PATCH_BOARD, cropOf, maskInCrop,
  type LocalPatchHide,
} from "../../domain/scene/local-patch-hides";
import { hitBoxFromAlpha, type PatchGeometry } from "./patch";
import { changedWithin } from "./local-patch-seam";

/**
 * Where a finished hide is drawn, where the child in it can be tapped, and where
 * her head is.
 *
 * The same three numbers the slot-patch engine records, arrived at differently.
 * There, the child is a cut-out and her own alpha says where she is. Here she is
 * painted INTO a rectangle of the world, and the rectangle comes back opaque -
 * so the footprint has to be measured from what changed.
 *
 * Two rules keep that honest:
 *
 *  - Only inside the pose's mask box, the one part the painter was allowed to
 *    fill. Across the whole crop the difference measures re-encoding and
 *    repainted scenery too, and a tap contract drawn around those would make a
 *    repainted sky tappable.
 *  - The box is the FLOOR, never the ceiling. A measurement can tighten the tap
 *    area onto the child; when it finds nothing coherent the declared box stands,
 *    because a hide the player cannot tap is worse than one whose tap area is a
 *    little generous - and on a children's game generous is the right direction.
 *
 * `hitBoxFromAlpha` does the measuring, the same function and the same head rule
 * the slot-patch engine uses. One definition of "where can this be tapped",
 * two ways of producing the mask it reads.
 */

/** Below this share of the mask box, the difference found nothing to trust. */
export const LOCAL_PATCH_MIN_MEASURED_FRACTION = 0.1;
/** A measured box thinner than this share of the mask box is a sliver, not a child. */
export const LOCAL_PATCH_MIN_MEASURED_SIDE = 0.25;

export type LocalPatchGeometry = {
  readonly geometry: PatchGeometry;
  /** How much of the mask box the render actually changed, 0..1. */
  readonly measuredFraction: number;
  /**
   * `measured` - the tap area is the painted child's own bounding box.
   * `declared` - the difference was too little or too thin to trust, so the tap
   * area is the box the painter was given. Recorded because "we measured her"
   * and "we fell back to the rectangle we asked for" are different facts, and a
   * board full of the second is a board where the painter is not filling its
   * masks.
   */
  readonly basis: "measured" | "declared";
};

/**
 * @param boardPng the board as it stood BEFORE this hide was painted
 * @param patchPng the rendered crop, at the crop's own size
 */
export async function localPatchGeometry(input: {
  readonly hide: LocalPatchHide;
  readonly boardPng: Buffer;
  readonly patchPng: Buffer;
  readonly board?: { readonly width: number; readonly height: number };
}): Promise<LocalPatchGeometry> {
  const { hide } = input;
  const art = input.board ?? LOCAL_PATCH_BOARD;
  const crop = cropOf(hide);
  const box = maskInCrop(hide.pose);

  const rect = { x: crop.left / art.width, y: crop.top / art.height, w: crop.width / art.width, h: crop.height / art.height };
  const declared = {
    hitRect: { x: (crop.left + box.left) / art.width, y: (crop.top + box.top) / art.height, w: box.width / art.width, h: box.height / art.height },
    anchor: { x: (crop.left + box.left + box.width / 2) / art.width, y: (crop.top + box.top) / art.height },
  };

  const change = await changedWithin(input.boardPng, crop, input.patchPng, box);
  const measuredFraction = change.changed / (box.width * box.height);
  if (measuredFraction < LOCAL_PATCH_MIN_MEASURED_FRACTION) {
    return { geometry: { rect, ...declared }, measuredFraction, basis: "declared" };
  }

  const measured = hitBoxFromAlpha(change.alpha, change.width, change.height);
  if (measured.hitRect.w < box.width * LOCAL_PATCH_MIN_MEASURED_SIDE || measured.hitRect.h < box.height * LOCAL_PATCH_MIN_MEASURED_SIDE) {
    return { geometry: { rect, ...declared }, measuredFraction, basis: "declared" };
  }

  // Mask-box pixels to board pixels to art fractions, in that order. The box
  // already sits inside the crop, so nothing here can leave the board.
  const originX = crop.left + box.left, originY = crop.top + box.top;
  return {
    geometry: {
      rect,
      hitRect: {
        x: (originX + measured.hitRect.x) / art.width, y: (originY + measured.hitRect.y) / art.height,
        w: measured.hitRect.w / art.width, h: measured.hitRect.h / art.height,
      },
      anchor: { x: (originX + measured.anchor.x) / art.width, y: (originY + measured.anchor.y) / art.height },
    },
    measuredFraction,
    basis: "measured",
  };
}

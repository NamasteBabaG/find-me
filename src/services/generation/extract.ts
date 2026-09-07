import type { AvatarProvider, SlotMatteResponse } from "@/infra/generation/types";
import { diffToPatch, matteToPatch, EXTRACTION_VERSION, MATTE_VERSION, type PatchResult, type Size, type SlotContext, type SlotPoint } from "./patch";

/**
 * How the child comes out of a render.
 *
 * One truth for the harness and the pipeline: both call this, so what a
 * sample shows is what a game ships. A provider that can matte its own
 * render (pass two) is asked to; the colour difference is the fallback for
 * one that cannot, and the free first look for both — a render that changed
 * nothing is rejected before pass two spends anything on it.
 */
export interface ExtractInput {
  provider: Pick<AvatarProvider, "matteSlotCrop">;
  originalCrop: Buffer;
  editedCrop: Buffer;
  ctx: SlotContext;
  art: Size;
  slot: SlotPoint;
  /** Which figure is the child (matteHint). */
  hint: string;
  label: string;
  quality?: string;
}

export interface Extraction {
  patch: PatchResult;
  method: "matte" | "diff";
  /** The version of the extraction that made the patch, for the ledger. */
  version: string;
  /** Pass two's answer and its bill, when it was made. */
  matte?: SlotMatteResponse;
  /** What the colour difference saw, kept for the record either way. */
  diff: Pick<PatchResult, "largest" | "painted" | "shape">;
}

export async function extractChild(input: ExtractInput): Promise<Extraction> {
  const { originalCrop, editedCrop, ctx, art, slot } = input;
  const diff = await diffToPatch({ originalCrop, editedCrop, ctx, art, slot });
  const seen = { largest: diff.largest, painted: diff.painted, shape: diff.shape };
  if (diff.largest === 0 || !input.provider.matteSlotCrop) return { patch: diff, method: "diff", version: EXTRACTION_VERSION, diff: seen };
  const matte = await input.provider.matteSlotCrop({ edited: editedCrop, original: originalCrop, hint: input.hint, label: input.label, quality: input.quality });
  const patch = await matteToPatch({ originalCrop, mattePng: matte.png, ctx, art, slot });
  return { patch, method: "matte", version: MATTE_VERSION, matte, diff: seen };
}

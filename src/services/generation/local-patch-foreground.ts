import sharp from "sharp";
import { LOCAL_PATCH_CROP, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { assertLocalPatchForeground, authoredLocalPatchForeground, localPatchForegroundAlphaSha256, localPatchForegroundBounds,
  localPatchForegroundPlanConflict, localPatchForegroundSha256, LOCAL_PATCH_FOREGROUND_CLEARANCE_PX, LOCAL_PATCH_FOREGROUND_VERSION,
  type LocalPatchForeground } from "../../domain/scene/local-patch-foreground";
import { LOCAL_PATCH_FOREGROUND_PROMPT_VERSION } from "./local-patch-prompt";

/**
 * The authored foreground in the product: which rows restore it, the pixel
 * operation every composition shares, and the record that binds it to the
 * published crop. The outline itself and its rules live in the domain module.
 *
 * One rule for every path that writes a v12 picture - a normal attempt, adaptive
 * recovery, a recovery directive, a self-repair redraw, retained recomposition
 * and restyle: the painting is occluded BEFORE it is joined, so the seam analysis
 * and the join see the published pixels, and no path has its own exception. It
 * is a layer, not a return window, so it never changes which pixels a paid
 * painting may supply outside the outline, and the refusal of authored return
 * windows on repair attempts stays as it is.
 */
export type LocalPatchForegroundRecord = {
  readonly version: typeof LOCAL_PATCH_FOREGROUND_VERSION;
  readonly hideId: string;
  readonly polygonSha256: string;
  readonly alphaSha256: string;
  /** Crop pixels taken from the board, wholly or in part. */
  readonly restoredPixels: number;
  /** The published 512x768 crop this was applied to. */
  readonly imageSha256: string;
};
export type AppliedForeground = { readonly foreground: LocalPatchForeground; readonly alpha: Uint8Array };

/** Only rows pinned to the v18 recipe restore an outline; every older row keeps its exact pixels.
 * An invalid outline throws here, before anything is bought: never skipped. */
export function foregroundForPinnedPrompt(hide: LocalPatchHide, promptVersion: string | null | undefined): AppliedForeground | null {
  if (promptVersion !== LOCAL_PATCH_FOREGROUND_PROMPT_VERSION) return null;
  const foreground = authoredLocalPatchForeground(hide.id);
  return foreground ? { foreground, alpha: assertLocalPatchForeground(hide, foreground) } : null;
}

type PlanRect = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
/**
 * The one rule for a recovery plan on a row that restores an outline: the
 * diagnosis that proposes it, the phase that applies it, the painter's purchase
 * and the join all ask this, and refuse on any answer but null.
 */
export const foregroundPlanConflict = (applied: AppliedForeground, plan: { readonly protectedCore: PlanRect; readonly faceRect: PlanRect }) =>
  localPatchForegroundPlanConflict(applied.foreground, applied.alpha, plan);

/** What a diagnosis of such a row is told before it plans: the object, its bounds and the clearance. */
export function foregroundDiagnosisData(applied: AppliedForeground) {
  return { what: applied.foreground.what, bounds: localPatchForegroundBounds(applied.alpha)!, clearancePx: LOCAL_PATCH_FOREGROUND_CLEARANCE_PX };
}

/** The 512x768 painting with the board's own pixels restored under the outline. */
export async function occludeLocalPatch(patchPng: Buffer, boardCropPng: Buffer, applied: AppliedForeground): Promise<{ png: Buffer; restoredPixels: number }> {
  const { width, height } = LOCAL_PATCH_CROP;
  const [patch, board] = await Promise.all([patchPng, boardCropPng].map(png => sharp(png, { limitInputPixels: 8_294_400 }).removeAlpha().raw().toBuffer({ resolveWithObject: true })));
  if (patch!.info.width !== width || patch!.info.height !== height || board!.info.width !== width || board!.info.height !== height)
    throw Error("LOCAL_PATCH_FOREGROUND: the painting and the board crop must both be 512x768");
  const out = Buffer.from(patch!.data);
  let restoredPixels = 0;
  for (let p = 0; p < width * height; p++) {
    const a = applied.alpha[p]!;
    if (!a) continue;
    restoredPixels++;
    for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round((board!.data[p * 3 + c]! * a + patch!.data[p * 3 + c]! * (255 - a)) / 255);
  }
  return { png: await sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer(), restoredPixels };
}

export function foregroundRecord(applied: AppliedForeground, restoredPixels: number, imageSha256: string): LocalPatchForegroundRecord {
  return { version: LOCAL_PATCH_FOREGROUND_VERSION, hideId: applied.foreground.hideId, polygonSha256: localPatchForegroundSha256(applied.foreground),
    alphaSha256: localPatchForegroundAlphaSha256(applied.alpha), restoredPixels, imageSha256 };
}

/**
 * Publication. A row whose recipe restores an outline publishes only with a
 * record of that exact outline on this exact image; a row whose recipe does not
 * must carry no record at all. A stale record from an earlier picture, a record
 * of another outline, or a path that forgot to apply it never publishes.
 */
export function foregroundBound(receipt: { foreground?: unknown } | null | undefined, hide: LocalPatchHide, promptVersion: string | null | undefined, imageSha256: string): boolean {
  const expected = foregroundForPinnedPrompt(hide, promptVersion), record = receipt?.foreground as Partial<LocalPatchForegroundRecord> | undefined;
  if (!expected) return record === undefined;
  return !!record && record.version === LOCAL_PATCH_FOREGROUND_VERSION && record.hideId === hide.id
    && record.polygonSha256 === localPatchForegroundSha256(expected.foreground) && record.alphaSha256 === localPatchForegroundAlphaSha256(expected.alpha)
    && Number.isSafeInteger(record.restoredPixels) && record.restoredPixels! > 0 && record.imageSha256 === imageSha256;
}

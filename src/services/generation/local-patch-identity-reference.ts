import sharp from "sharp";
import { isLocalPatchAgeVersion, isLocalPatchStrictVersion } from "../../domain/scene/local-patch-catalog";
import { LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE, type LocalPatchReferenceMode } from "../../infra/generation/openai-local-patch";
import { normalizeBoardWizardIdentity } from "./board-wizard-identity";

export const LOCAL_PATCH_CANONICAL_FACE_VERSION = "canonical-portrait-quadrant/v1";
export type LocalPatchIdentityReferences = {
  readonly identityPng: Buffer;
  readonly judgeIdentityPng: Buffer;
  readonly canonicalIdentityPng?: Buffer;
  readonly referenceMode?: LocalPatchReferenceMode;
};

/** The approved illustrated sheet is the identity authority, never the photo or
 * another board person's face. Keep the entire authored portrait cell: the old
 * silhouette heuristic can remove hair, and padding a 220px crop inside 512px
 * reduces the judge's actual identity reference to 110px after its resize.
 * No pixels of the stored canonical sheet or its paid binding are changed. */
export async function prepareLocalPatchIdentityReferences(sheet: Buffer, contentVersion?: number): Promise<LocalPatchIdentityReferences> {
  if (!isLocalPatchStrictVersion(contentVersion)) {
    const normalized = await normalizeBoardWizardIdentity(sheet);
    return {
      identityPng: normalized.png,
      judgeIdentityPng: await sharp(normalized.png).resize(256, 256, { fit: "inside" }).png().toBuffer(),
    };
  }
  const meta = await sharp(sheet, { limitInputPixels: 25_000_000 }).metadata();
  if (meta.format !== "png" || !meta.width || meta.width !== meta.height || meta.width < 8 || (meta.pages ?? 1) !== 1) {
    throw new Error("LOCAL_PATCH_IDENTITY: expected the canonical square illustrated 2x2 PNG sheet");
  }
  const half = Math.floor(meta.width / 2);
  const portrait = await sharp(sheet).extract({ left: 0, top: 0, width: half, height: half }).png().toBuffer();
  return {
    identityPng: await sharp(portrait).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer(),
    judgeIdentityPng: await sharp(portrait).resize(512, 512, { fit: "inside", withoutEnlargement: true }).png().toBuffer(),
    ...(isLocalPatchAgeVersion(contentVersion)
      ? { referenceMode: LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE }
      : { canonicalIdentityPng: sheet }),
  };
}

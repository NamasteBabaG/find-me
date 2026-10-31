import { z } from "zod";

/** New questions only. Historical paid questions keep their exact pixels,
 * labels, words and fingerprint. No image filter or numerical blur verdict. */
export const NATIVE_DETAIL_VERSION = "native-detail/v1" as const;
export const NATIVE_DETAIL_FAULT_PREFIX = "NATIVE_DETAIL:";
export const NATIVE_DETAIL_PAINT_DIRECTION = [
  "NATIVE DETAIL MATCH native-detail/v1: Image1's original painted people and scenery are the authority for optical sharpness, contour weight, edge softness, local contrast and brush-detail scale. Match that finish at the actual512x768 crop scale; a detailed portrait or a freshly sharpened background is not the style reference.",
  "Keep the child's eyes, mouth and hair silhouette readable with the original people's amount of painted detail at comparable depth and face size. Do not add micro-hairs, portrait skin texture, crisp etched outlines or extra sharpness that make the child a different surface. Do not airbrush or blur away identity. Different natural hair patterns remain recognizable through grouped painted shapes.",
  "Preserve the original neighboring people and background, including their legitimate painted softness, depth haze and lighting. Do not repaint or sharpen the context to match the new child, apply global blur/sharpen/noise/texture filters, or make the target conspicuously softer. The image must join the unchanged source rather than a remodeled RAW background.",
].join("\n");

export type NativeDetailEvidence = {
  readonly version: typeof NATIVE_DETAIL_VERSION;
  readonly sourceCropSha256: string;
  readonly rawSha256: string;
  readonly shippingSha256: string;
  readonly width: 512;
  readonly height: 768;
};
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const nativeDetailEvidenceSchema = z.object({version:z.literal(NATIVE_DETAIL_VERSION),sourceCropSha256:digest,
  rawSha256:digest,shippingSha256:digest,width:z.literal(512),height:z.literal(768)}).strict();

export const NATIVE_DETAIL_REVIEW_DIRECTION = [
  "NATIVE DETAIL INSPECTION native-detail/v1: the named original-source, provider-raw and player-shipping crops have identical512x768 native axes. No panel was resized, sharpened or blurred. Judge the SHIPPING image against the ORIGINAL SOURCE at this actual pixel scale, and distinguish painter detail from composition loss using RAW.",
  "Inspect the target's eyes, mouth, hair silhouette, face planes, clothing edges and their transition to the surrounding picture. Compare contour weight, edge softness, matte paint shapes and detail density with original people at comparable depth and face size. Fail styleMatch for materially blurred/unreadable target detail, an unsupported halo or oversharpened microdetail that makes the target a different rendering surface. Locate the actual mismatch. Different hair patterns, pose, complexion, legitimate depth haze and the source's own painted softness are not defects.",
  "RAW may repaint the whole context, but only the declared returned window is shipped. Outside that window SHIPPING must retain the original source: a sharper unused RAW background is NOT evidence that the compositor blurred the game. Inspect the target and actual shipped joins; never demand replacing approved source art with the RAW background. Neither a high-frequency statistic nor generic 'sharper' wording proves an artistic fault.",
  "If a visible blur/detail mismatch fails styleMatch, prefix that check's fault location with NATIVE_DETAIL: and describe the target feature and the original comparison location. The existing styleMatch, faceReadable, identity, anatomy and all other checks remain mandatory. A clear identity does not excuse mismatched finish; matching finish does not excuse a blurred face. Use uncertainty when these actual pixels cannot decide. No extra judge or routine second opinion is requested.",
].join("\n");

/** Applied only after an explicit versioned, paid native-detail refusal. It is
 * part of the next painting's fingerprint; never edits a retained question. */
export const NATIVE_DETAIL_REPAIR_DIRECTION = [
  "NATIVE DETAIL REPAIR native-detail/v1: retain the canonical child's feature geometry, hair pattern, age, pose, size, location, support and occlusion. Repaint only the target's rendering surface to match the ORIGINAL Image1 people at the same depth and visible face size.",
  "Match their actual contour weight, painted edge softness, matte planes, brush-detail scale and local contrast. If the prior target was blurry, redraw its real eye/mouth/hair contours clearly at that same native scale. If it was over-detailed, group the paint and hair strokes rather than adding portrait microtexture. Keep the original background and neighboring people unchanged, including their own legitimate softness.",
  "Do not run a blur/sharpen/noise/texture treatment over the picture, hide a portrait with blur, invent skin detail, copy a neighbor's identity, or sharpen the surroundings to match the inserted child. Preserve recognizable face geometry while matching the source's painted finish. The final shipping image still needs a fresh complete ordinary assessment.",
].join("\n");

export function nativeDetailRefused(evidence: NativeDetailEvidence | undefined,
  verdict: { styleMatch?: unknown; faults?: readonly { check?: unknown; where?: unknown }[] } | null): boolean {
  return nativeDetailEvidenceSchema.safeParse(evidence).success && verdict?.styleMatch === "fail"
    && !!verdict.faults?.some(f => f.check === "styleMatch" && typeof f.where === "string" && f.where.startsWith(NATIVE_DETAIL_FAULT_PREFIX));
}

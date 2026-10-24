import { z } from "zod";
import { guidedFrameExhausted, guidedFrameMarker, type GuidedFrameRow } from "./guided-frame-recovery";
/** One narrower native edit mask after a measured stationary background rewrite. No seam threshold changes. */
export const NATIVE_MASK_TAIL_VERSION="single-low-native-mask-tail/v1" as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const nativeMaskTailMarkerSchema=z.object({version:z.literal(NATIVE_MASK_TAIL_VERSION),authorizationSha256:digest,
  previousAuthorizationSha256:digest,rowId:z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),sourceRowSha256:digest,
  retainedRenderSha256:digest,originalAttempts:z.literal(3),authorizedAttempt:z.literal(4)}).strict();
export type NativeMaskTailMarker=z.infer<typeof nativeMaskTailMarkerSchema>;
export function nativeMaskTailMarker(row:Pick<GuidedFrameRow,"judgeJson">):NativeMaskTailMarker|null {
  try{const result=nativeMaskTailMarkerSchema.safeParse(JSON.parse(row.judgeJson??"null")?.nativeMaskTail);return result.success?result.data:null;}catch{return null;}
}
export function nativeMaskTailExhausted(row:GuidedFrameRow){return row.status==="FAILED" && row.attempts===4 && !!nativeMaskTailMarker(row);}
export function nativeMaskTailCandidate(row:GuidedFrameRow){
  if(row.status==="PENDING" && row.attempts===4)return !!nativeMaskTailMarker(row) && !!guidedFrameMarker(row);
  if(!guidedFrameExhausted(row) || nativeMaskTailMarker(row))return false;
  try{const j=JSON.parse(row.judgeJson??"null"),s=j?.seam;return j.renderFault?.startsWith("quality-seam:") && j.compositionPermission==="refused"
    && s?.verdict==="background-rewritten" && Number.isFinite(s.borderMeanDiff) && s.borderMeanDiff>24 && s.shift?.dx===0 && s.shift?.dy===0;}catch{return false;}
}
export const nativeMaskTailDirections="NATIVE EDIT MASK single-low-native-mask-tail/v1. The previous wide context edit changed the return-boundary background. This purchase uses a different native alpha mask: ONLY the cyan whole-child target is editable; the orange boundary and all scenery outside cyan are protected. Keep every original source pixel, pavement line, vehicle, bystander and shadow outside cyan at its exact position. Do not repaint the scene. Draw the complete age-correct child inside cyan with the same authored pose, support and perspective; make no changes to the original return window. The guide is position-only and must not appear in the unmarked final image. Any changed boundary or broken child remains a rejection.";

import { z } from "zod";
import { guidedFrameExhausted, guidedFrameMarker, guidedFrameGeometry, type GuideRect, type GuidedFrameRow } from "./guided-frame-recovery";
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
export const nativeMaskTailDirections="NATIVE EDIT MASK single-low-native-mask-tail/v1. The previous wide context edit changed the return-boundary background. This purchase uses a different native alpha mask: ONLY the ORIGINAL authored child envelope (nativeEditEnvelope in the authoritative placement data) is editable; the orange return-boundary band and all scenery outside that envelope are protected. Cyan is the smaller placement target for the NEW child, not the erasure mask. Remove the original TARGET person WHOLE inside the original envelope, including crown/hair above cyan; leave no original head, limb or body remnant. Preserve every OTHER person and continuous scenery at the exact source coordinates. Do not repaint the scene. Draw the complete age-correct child inside cyan with the same authored pose, support and perspective; make no changes to the original return window. The guide is position-only and must not appear in the unmarked final image. Any changed boundary or broken child remains a rejection.";

/** The new child may be inset; its source replacement must still erase a WHOLE original head. */
export function nativeMaskTailEditRegion(child:GuideRect,returned:GuideRect,sourceHeads:readonly GuideRect[]) {
 const geometry=guidedFrameGeometry(child,returned);
 if(!sourceHeads.length || sourceHeads.length>8)throw Error("NATIVE_MASK_TAIL: authoritative source-head coverage required");
 const contains=(a:GuideRect,b:GuideRect)=>b.left>=a.left&&b.top>=a.top&&b.left+b.width<=a.left+a.width&&b.top+b.height<=a.top+a.height;
 for(const head of sourceHeads){
  if(![head.left,head.top,head.width,head.height].every(Number.isSafeInteger)||head.width<=0||head.height<=0)throw Error("NATIVE_MASK_TAIL: invalid source head");
  const intersects=head.left<child.left+child.width && child.left<head.left+head.width && head.top<child.top+child.height && child.top<head.top+head.height;
  if(intersects&&!contains(child,head))throw Error("NATIVE_MASK_TAIL: edit mask crosses an original source head");
 }
 return {editable:{...child},target:geometry.target,returned:geometry.returned};
}

import {z} from 'zod';
import {guidedFrameMarker,type GuidedFrameRow} from './guided-frame-recovery';

export const RETAINED_NORMAL_HEAD_VERSION='retained-normal-head/v1' as const;
export const RETAINED_NORMAL_HEAD_ACTION='local-patch:retained-normal-head-restored';
const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(240).regex(/^[A-Za-z0-9_:.-]+$/);
/** A fenced recovery selects an older settled NORMAL painting, while the row
 * keeps its historical high-water attempt and every paid repair cycle. */
export const retainedNormalHeadSchema=z.object({version:z.literal(RETAINED_NORMAL_HEAD_VERSION),auditId:z.string().regex(/^aud_normal_head_[a-f0-9]{40}$/),authorizationSha256:digest,
 sourceRequestKey:id,sourceFingerprint:digest,sourcePayloadSha256:digest,normalizedRawSha256:digest,
 shippingSha256:digest,geometrySha256:digest,identitySha256:digest,originalAttempt:z.union([z.literal(1),z.literal(2)]),
 sourceReviewRequestKey:id,sourceReviewFingerprint:digest}).strict();

/** A failed second/third candidate can have superseded good normal paid
 * pixels. Only concluded phases qualify; the worker authenticates all sources. */
export function retainedNormalHeadRecoveryCandidate(row:GuidedFrameRow|undefined){
 if(!row||row.status!=='FAILED'||![2,3].includes(row.attempts)||!row.assetId||row.attempts===3&&!guidedFrameMarker(row))return false;
 try{const j=JSON.parse(row.judgeJson??'null'),state=j?.selfRepair;
  // A refused head pixel correction stays refused: it is never swapped for older pixels.
  return !!j&&j.retainedNormalHead===undefined&&j.headPixelCorrection===undefined&&(!state||['awaiting-review','rejected'].includes(state.phase))
   &&j.sourceBodyRepair===undefined&&j.sourceBodyBirth===undefined&&j.wholeSourceContext===undefined;
 }catch{return false;}
}

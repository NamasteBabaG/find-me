import { z } from "zod";
import { readSingleVisualReview } from "./single-visual-review";
export const PROP_JOIN_VERSION = "source-prop-registration/v1" as const;
const rect = z.object({ left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive() }).strict();
const digest=z.string().regex(/^[a-f0-9]{64}$/);
export const propJoinContractSchema=z.object({version:z.literal(PROP_JOIN_VERSION),boardId:z.string(),hideId:z.string(),sourceSha256:digest,
 crop:rect,child:rect,returned:rect,anchor:rect,pivotX:z.number().int(),protectedAbove:z.number().int(),
 maxScalePercent:z.number().int().min(100).max(150),minDy:z.number().int().min(-20),maxDy:z.number().int().max(20),
 minInitialScore:z.number().positive(),maxRelativeScore:z.number().positive().max(.7)}).strict();
export type PropJoinContract=z.infer<typeof propJoinContractSchema>;
export const propJoinProofSchema=z.object({version:z.literal(PROP_JOIN_VERSION),contractSha256:digest,gameId:z.string(),rowId:z.string(),attempt:z.number().int().min(1).max(3),
 requestKey:z.string(),operationFingerprint:digest,payloadSha256:digest,rawPngSha256:digest,normalizedRawSha256:digest,sourcePngSha256:digest,
 beforeImageSha256:digest,imageSha256:digest,geometrySha256:digest,authorizationSha256:digest,identitySha256:digest,
 sx:z.number().min(1).max(1.5),dy:z.number().int().min(-20).max(20),initialScore:z.number().nonnegative(),score:z.number().nonnegative(),relativeScore:z.number().min(0).max(.7),
 protectedChangedPixels:z.literal(0),outsideReturnChangedPixels:z.literal(0)}).strict();
export type PropJoinProof=z.infer<typeof propJoinProofSchema>;
const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** A conclusive non-person prop refusal only. No weak, ambiguous or failed
 * identity/anatomy answer may become authority for a software repair wake. */
export function conclusivePropJoinRefusal(judgeJson:string|null,hideId:string):boolean {
 try{const j=JSON.parse(judgeJson??'null'),p=j?.boardReview?.dual;
  if(j.reviewState!=='board-review-complete'||p?.single!=='single-sol-low/v1'||p.hideId!==hideId||p.imageSha256!==j.judgedSha256
   ||p.quality?.model!=='gpt-6.1-sol'||p.quality?.policy?.effort!=='low'||!p.continuity||!p.subject
   ||![p.continuity,p.subject].every(s=>s.raw===p.quality.raw&&s.requestKey===p.quality.requestKey&&s.fingerprint===p.quality.fingerprint))return false;
  const wire=readSingleVisualReview(p.quality.raw);if(!wire||wire.doubt)return false;
  const a=JSON.parse(wire.assessment),inner=a.assessment,q=inner?.quality?.hides?.[0],subject=inner?.subject,continuity=JSON.parse(wire.continuity);
  if(q?.hideId!==hideId||subject?.hideId!==hideId||q?.verdict?.verdict!=='fail')return false;
  const v=q.verdict,required=['childPresent','childOnlyOnce','childComplete','styleMatch','scaleRight','groundContact','faceLikeness','faceReadable','ageAppropriate','lightingMatch','neighborsIntact'];
  return required.every(k=>v[k]==='pass')&&v.pictureWhole==='fail'&&v.severeSeam==='fail'
   &&Array.isArray(v.faults)&&v.faults.length>0&&v.faults.every((f:unknown)=>['pictureWhole','severeSeam'].includes(String(obj(f).check)))
   &&['photoLikeness','canonicalAgreement','faceVisible','perceivedAge'].every(k=>subject.checks?.[k]?.status==='pass')
   &&['pass','not-required'].includes(subject.checks?.requiredWardrobe?.status)&&subject.faults?.length===0
   &&a.sourceNeighbors?.neighbors?.length>0&&a.sourceNeighbors.neighbors.every((n:unknown)=>obj(n).status==='pass')
   &&continuity.cases?.length>0&&continuity.cases.every((c:unknown)=>obj(c).state==='coherent'&&obj(c).headConnection==='connected'&&Array.isArray(obj(c).faults)&&(obj(c).faults as unknown[]).length===0);
 }catch{return false;}
}

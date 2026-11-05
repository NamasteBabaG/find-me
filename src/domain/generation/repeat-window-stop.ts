import { z } from 'zod';
import { sourcePlacementSha256 as hash } from '../scene/source-placement-release';
import { SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, readSingleVisualReview } from './single-visual-review';
import { targetHeadAnswerSchema, targetHeadEvidenceSchema } from './target-head-return';

export const REPEAT_WINDOW_STOP_VERSION='repeat-window-stop/v1' as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/), id=z.string().regex(/^[A-Za-z0-9_:.-]{1,240}$/);
export const windowFailureFactSchema=z.object({version:z.literal(REPEAT_WINDOW_STOP_VERSION),authorizationSha256:digest,
  rowId:id,hideId:id,attempt:z.union([z.literal(1),z.literal(2)]),contractSha256:digest,imageSha256:digest,receiptSha256:digest,previousReceiptSha256:digest.nullable(),
  reviewRequestKey:id,reviewFingerprint:digest,renderRequestKey:id,renderFingerprint:digest,
  edge:z.enum(['top','bottom','left','right']),kind:z.enum(['crown','seam'])}).strict();
export type WindowFailureFact=z.infer<typeof windowFailureFactSchema>;
/** Called only with a validated immutable ledger snapshot, never retained text
 * or an exception. An unsettled or conflicting bill cannot support a stop. */
export function windowFailureChargeSettled(b:{readonly requestKey:string;readonly scope:string;readonly state:string;readonly operationFingerprint:string;
  readonly conflicts:readonly unknown[];readonly evidence?:unknown}|undefined,key:string,fingerprint:string,scope:'image'|'judge'){
  return !!b&&b.requestKey===key&&['settled','linked'].includes(b.state)&&!!b.evidence&&b.scope===scope&&!b.conflicts.length&&b.operationFingerprint===fingerprint;
}
const object=(x:unknown):Record<string,unknown>|null=>!!x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:null;

/** Positive, conclusive, located evidence only. Prose, cancellations, uncertain
 * or malformed answers, free-seam render refusals and repeated reads do not count. */
export function locatedWindowFailure(judgeJson:string|null){try{
  const j=JSON.parse(judgeJson??'null'),p=j?.boardReview?.dual,q=p?.quality,v=j?.verdict;
  if(j?.reviewState!=='board-review-complete'||j.wireFault!==null||j.qualityDisposition?.state!=='retry'||v?.verdict!=='fail'
    ||p?.single!==SINGLE_MEDIUM_VISUAL_REVIEW_VERSION||q?.wireFault!==null||q?.policy?.model!=='gpt-6.1-sol'
    ||q.policy.effort!=='medium'||readSingleVisualReview(q.raw)?.doubt!==false||p.imageSha256!==j.judgedSha256
    ||!j.authoredReturn||hash(j.authoredReturn)!==hash(p.authoredReturn))return null;
  const h=targetHeadAnswerSchema.safeParse(JSON.parse(q.raw.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i,'$1')).head);
  const e=targetHeadEvidenceSchema.safeParse(q.headEvidence);
  if(!h.success||!e.success||h.data.version!==e.data.version||e.data.shippingSha256!==j.judgedSha256
    ||hash(e.data.returned)!==hash(j.authoredReturn.local))return null;
  if(h.data.rawCrown==='uncertain'||h.data.shippingCrown==='uncertain')return null;
  const edges=['top','bottom','left','right'] as const,r=e.data.returned,head=h.data.rawHead;
  const outside={top:head.top<r.top+12,bottom:head.top+head.height>r.top+r.height-12,
    left:head.left<r.left+12,right:head.left+head.width>r.left+r.width-12};
  const edgesFailed=edges.filter(edge=>object(v.boundaryIntegrity?.[edge])?.status==='fail');
  if(edgesFailed.length!==1)return null;const edge=edgesFailed[0]!;
  const kind=h.data.shippingCrown==='fail'&&outside[edge]&&v.childComplete==='fail'?'crown' as const
    :v.severeSeam==='fail'&&v.pictureWhole==='fail'?'seam' as const:null;
  if(!kind)return null;
  return {contractSha256:hash(j.authoredReturn),imageSha256:j.judgedSha256,receiptSha256:hash(judgeJson),
    reviewRequestKey:q.requestKey,reviewFingerprint:q.fingerprint,renderRequestKey:e.data.sourceRequestKey,
    renderFingerprint:e.data.sourceFingerprint,edge,kind};
}catch{return null;}}

/** This is a purchase stop, never a quality pass. An in-flight third request
 * resumes its own key; another image, window, edge or judgment cannot spend it. */
export function repeatWindowStopped(row:{id:string;status:string;attempts:number;judgeJson:string|null},facts:readonly WindowFailureFact[],authorizationSha256:string){
  if(row.status!=='FAILED'||row.attempts!==2)return false;
  try{if(['diagnosing','applying'].includes(JSON.parse(row.judgeJson??'null')?.selfRepair?.phase))return false;}catch{return false;}
  const current=locatedWindowFailure(row.judgeJson);if(!current)return false;
  const matches=facts.filter(f=>windowFailureFactSchema.safeParse(f).success&&f.authorizationSha256===authorizationSha256&&f.rowId===row.id
    &&f.contractSha256===current.contractSha256&&f.edge===current.edge&&f.kind===current.kind);
  const second=matches.find(f=>f.attempt===2&&f.receiptSha256===current.receiptSha256),first=matches.find(f=>f.attempt===1&&f.receiptSha256===second?.previousReceiptSha256);
  return !!first&&!!second&&first.hideId===second.hideId&&first.imageSha256!==second.imageSha256
    &&second.previousReceiptSha256===first.receiptSha256&&first.renderRequestKey!==second.renderRequestKey&&first.reviewRequestKey!==second.reviewRequestKey;
}

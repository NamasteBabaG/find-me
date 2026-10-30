import { targetHeadAnswerSchema, targetHeadEvidenceSchema, TARGET_HEAD_RETURN_VERSION, TARGET_HEAD_VISIBLE_VERSION } from './target-head-return';

const object=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
/** Scheduling only, never an art approval. A concluded head-only v1 refusal
 * with intact located containment may owe ONE fresh ordinary v2 question.
 * Visible crown loss can still be refused by that new question. */
export function visibleHeadPolicyRecoveryCandidate(row:{status:string;assetId:string|null;judgeJson:string|null}|undefined){
 if(!row?.assetId||!['FAILED','GENERATED'].includes(row.status))return false;
 try{
  const j=object(JSON.parse(row.judgeJson??'null')),state=object(j?.selfRepair),verdict=object(j?.verdict);
  if(!j||j.headPolicyVersion!==undefined||j.visibleHeadRecovery!==undefined||state&&!['awaiting-review','rejected'].includes(String(state.phase))
    ||j.reviewState!=='board-review-complete'||verdict?.verdict!=='fail'||!Array.isArray(verdict.faults)||!verdict.faults.length
    ||!verdict.faults.every(v=>{const f=object(v);return f?.check==='childComplete'&&typeof f.where==='string'&&f.where.startsWith('HEAD_RETURN:');}))return false;
  const quality=object(object(object(j.boardReview)?.dual)?.quality);
  return historicalHeadClearanceReassessment(quality?.raw,quality?.headEvidence);
 }catch{return false;}
}

/** Eligibility for one new review only; old Crown statuses are never turned
 * into a PASS. Other original roles and paid/source bindings must be checked. */
export function historicalHeadClearanceReassessment(answer:unknown,evidence:unknown){
 try{
  const p=targetHeadEvidenceSchema.safeParse(evidence);
  const raw=JSON.parse(String(answer??'null').trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));
  const a=targetHeadAnswerSchema.safeParse(raw?.head);
  if(!p.success||p.data.version!==TARGET_HEAD_RETURN_VERSION||!a.success||a.data.version!==TARGET_HEAD_RETURN_VERSION
    ||raw.version!=='single-sol-medium/v1'||raw.doubt!==false||a.data.rawCrown==='uncertain'||a.data.shippingCrown==='uncertain')return false;
  const r=p.data.returned,heads=[a.data.rawHead,a.data.shippingHead];
  const fits=heads.every(h=>h.left>=r.left+1&&h.top>=r.top+1&&h.left+h.width<=r.left+r.width-1&&h.top+h.height<=r.top+r.height-1);
  const close=heads.some(h=>Math.min(h.left-r.left,h.top-r.top,r.left+r.width-h.left-h.width,r.top+r.height-h.top-h.height)<p.data.feather);
  return fits&&close&&(['left','top','width','height'] as const).every(k=>Math.abs(heads[0]![k]-heads[1]![k])<=12);
 }catch{return false;}
}

export const VISIBLE_HEAD_RECOVERY_VERSION='visible-head-policy-recovery/v1' as const;
export const visibleHeadPolicyMarker={headPolicyVersion:TARGET_HEAD_VISIBLE_VERSION} as const;

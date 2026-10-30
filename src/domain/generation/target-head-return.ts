import { z } from 'zod';
import { LEGACY_PAID_JOIN_HEAD_VERSION } from './legacy-paid-join-head';
import { RETAINED_NORMAL_HEAD_VERSION } from './retained-normal-head';

/** A named inspection in the same MEDIUM answer, never a second judge request. */
export const TARGET_HEAD_RETURN_VERSION = 'target-head-return/v1' as const;
/** Visible completeness is distinct from the painter's planning clearance.
 * Only explicitly marked new candidates/questions use these semantics. */
export const TARGET_HEAD_VISIBLE_VERSION = 'target-head-return/v2-visible-completeness' as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const rect = z.object({ left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),
  width:z.number().int().positive(),height:z.number().int().positive() }).strict()
  .refine(v=>v.left+v.width<=512&&v.top+v.height<=768);
export const targetHeadEvidenceSchema = z.object({ version:z.enum([TARGET_HEAD_RETURN_VERSION,TARGET_HEAD_VISIBLE_VERSION]), gameId:z.string(),hideId:z.string(),
  sourceRequestKey:z.string(),sourceFingerprint:digest,sourcePayloadSha256:digest,normalizedRawSha256:digest,
  shippingSha256:digest,geometrySha256:digest,identitySha256:digest,returned:rect,feather:z.literal(12),
  sourceBindingVersion:z.enum([LEGACY_PAID_JOIN_HEAD_VERSION,RETAINED_NORMAL_HEAD_VERSION]).optional(),sourceCompositionSha256:digest.optional() }).strict()
  .refine(v=>(v.sourceBindingVersion===undefined)===(v.sourceCompositionSha256===undefined),'Legacy source version and composition binding must agree')
  .refine(v=>v.sourceBindingVersion!==RETAINED_NORMAL_HEAD_VERSION||v.version===TARGET_HEAD_VISIBLE_VERSION,'Retained normal source requires the prospective visible-head policy');
export type TargetHeadEvidence = z.infer<typeof targetHeadEvidenceSchema>;
const status=z.enum(['pass','fail','uncertain']);
export const targetHeadAnswerSchema=z.object({ version:z.enum([TARGET_HEAD_RETURN_VERSION,TARGET_HEAD_VISIBLE_VERSION]),rawHead:rect,shippingHead:rect,
  rawCrown:status,shippingCrown:status,observation:z.string().min(12).max(600) }).strict();
/** Diagnostic data only. The service authenticates this exact RAW/return before
 * freezing a new cycle; existing paid questions never acquire this field. */
export const targetHeadRepairContextSchema=z.object({version:z.literal('target-head-repair/v1'),
 evidence:targetHeadEvidenceSchema,answer:targetHeadAnswerSchema}).strict()
 .refine(v=>v.evidence.version===v.answer.version,'Head question and answer versions must agree');
export type TargetHeadRepairContext=z.infer<typeof targetHeadRepairContextSchema>;
export function targetHeadRepairContext(raw:string|null,evidence:TargetHeadEvidence|undefined):TargetHeadRepairContext|null{
 if(targetHeadReturnDecision(raw,evidence).disposition!=='repair')return null;
 try{const outer=JSON.parse((raw??'').trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));
  return targetHeadRepairContextSchema.parse({version:'target-head-repair/v1',evidence,answer:outer.head});
 }catch{return null;}
}
export type TargetHeadDecision={disposition:'pass'|'repair'|'unresolved';reason:string};
export function targetHeadReturnDecision(raw:string|null,evidence:TargetHeadEvidence|undefined):TargetHeadDecision{
  const unresolved={disposition:'unresolved' as const,reason:'HEAD_RETURN: missing or unreadable native head evidence'};
  const proof=targetHeadEvidenceSchema.safeParse(evidence);if(!proof.success)return unresolved;
  let document:unknown;try{document=JSON.parse((raw??'').trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));}catch{return unresolved;}
  const outer=document as {version?:unknown;head?:unknown};if(outer?.version!=='single-sol-medium/v1')return unresolved;
  const parsed=targetHeadAnswerSchema.safeParse(outer.head);if(!parsed.success)return unresolved;
  const a=parsed.data,p=proof.data,r=p.returned;
  if(a.version!==p.version)return unresolved;
  const f=p.version===TARGET_HEAD_VISIBLE_VERSION?1:p.feather;
  if(a.rawCrown==='fail'||a.shippingCrown==='fail')return{disposition:'repair',reason:'HEAD_RETURN: the target crown is visibly incomplete'};
  if(a.rawCrown!=='pass'||a.shippingCrown!=='pass')return unresolved;
  // v1 retains its original12px predicate. v2 protects the actual hard edge;
  // located or explicitly reported visible loss still requires repair even
  // when a bounding rectangle fits. Numeric planning clearance alone is not loss.
  const inside=(h:z.infer<typeof rect>)=>h.left>=r.left+f&&h.top>=r.top+f
    &&h.left+h.width<=r.left+r.width-f&&h.top+h.height<=r.top+r.height-f;
  if(!inside(a.rawHead)||!inside(a.shippingHead))return{disposition:'repair',reason:'HEAD_RETURN: the complete target head crosses the opaque return boundary'};
  const discrepancy=Math.max(...(['left','top','width','height'] as const).map(k=>Math.abs(a.rawHead[k]-a.shippingHead[k])));
  if(discrepancy>12)return{disposition:'repair',reason:'HEAD_RETURN: target head geometry differs between retained RAW and shipping'};
  return{disposition:'pass',reason:'HEAD_RETURN: complete crown retained inside the opaque return'};
}

export function targetHeadReturnPrompt(evidence:TargetHeadEvidence){
 const p=targetHeadEvidenceSchema.parse(evidence);
 if(p.version===TARGET_HEAD_VISIBLE_VERSION)return '\nNATIVE TARGET HEAD CHECK '+TARGET_HEAD_VISIBLE_VERSION+'. Last TWO images: retained provider RAW normalized512x768, then exact SHIPPING512x768, both crop-local axes. RAW is diagnosis, never player approval. Inspect the intended target full hair/scalp, opaque headwear and face in BOTH images; ignore bystanders clipped only by this evidence crop. Transparent helmet glass, an aura or glow is not anatomical crown or opaque headwear: do not enlarge head bounds to surrounding transparent decoration. Trace actual complete head bounds, never copy a child/return box. The painter plans12px clearance, but clearance smaller than12px is NOT a visible defect. A head must remain at least1px inside the actual return edges, and all visible hair/scalp/opaque headwear/face must survive the blend. Fail rawCrown or shippingCrown for actual shaved, straight-cut, faded or missing crown/head pixels even when the located rectangle fits. Compare RAW with SHIPPING for added loss. Uncertainty remains uncertain. Natural occlusion requires a specific solid occluder with coherent depth; a mask/blend line or perspective never excuses actual loss.\nHEAD_RETURN_EVIDENCE: '+JSON.stringify({version:p.version,returned:p.returned,feather:p.feather,...(p.sourceBindingVersion?{sourceBindingVersion:p.sourceBindingVersion,sourceCompositionSha256:p.sourceCompositionSha256}:{})})+'\nIn the SAME final outer answer add "head":{"version":"'+TARGET_HEAD_VISIBLE_VERSION+'","rawHead":{"left":0,"top":0,"width":1,"height":1},"shippingHead":{"left":0,"top":0,"width":1,"height":1},"rawCrown":"pass|fail|uncertain","shippingCrown":"pass|fail|uncertain","observation":"specific visible completeness or actual loss in RAW and SHIPPING; distinguish transparent enclosure and planning clearance"}. Replace example coordinates with observed complete target head rectangles. All assessment, continuity, head and doubt fields remain mandatory; actual damage in ANY role requires repair. Do not approve an image merely because its head passes.';
 return '\nNATIVE TARGET HEAD CHECK '+TARGET_HEAD_RETURN_VERSION+'. Last TWO images: retained provider RAW normalized512x768, then exact SHIPPING512x768, both crop-local axes. RAW is diagnosis, never player approval. Trace the intended target FULL crown, hair/hat, scalp and face in both; ignore bystanders clipped only by this evidence crop. Even slight straight/faded hair loss is a defect. Locate both actual outer head bounds; never copy a child/return box. The whole visible head must fit12px inside EACH return edge (opaque pixels). Natural occlusion needs a specific solid occluder and coherent depth; a mask/blend line or perspective is no excuse.\nHEAD_RETURN_EVIDENCE: '+JSON.stringify({version:p.version,returned:p.returned,feather:p.feather,...(p.sourceBindingVersion?{sourceBindingVersion:p.sourceBindingVersion,sourceCompositionSha256:p.sourceCompositionSha256}:{})})+'\nIn the SAME final outer answer add "head":{"version":"'+TARGET_HEAD_RETURN_VERSION+'","rawHead":{"left":0,"top":0,"width":1,"height":1},"shippingHead":{"left":0,"top":0,"width":1,"height":1},"rawCrown":"pass|fail|uncertain","shippingCrown":"pass|fail|uncertain","observation":"specific RAW to SHIPPING crown evidence"}. Replace example coordinates with observed complete target head rectangles. A located defect requires repair, never a routine second opinion. All assessment, continuity, head and doubt fields remain mandatory.';

}

/** Unmarked historical receipts keep their paid v1 question byte-for-byte. */
export function targetHeadVersionOfReceipt(receipt:{headPolicyVersion?:unknown}){
 if(receipt.headPolicyVersion===undefined)return TARGET_HEAD_RETURN_VERSION;
 if(receipt.headPolicyVersion===TARGET_HEAD_VISIBLE_VERSION)return TARGET_HEAD_VISIBLE_VERSION;
 throw Error('HEAD_RETURN: unsupported candidate head policy');
}

import { z } from 'zod';

/** A named inspection in the same MEDIUM answer, never a second judge request. */
export const TARGET_HEAD_RETURN_VERSION = 'target-head-return/v1' as const;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const rect = z.object({ left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),
  width:z.number().int().positive(),height:z.number().int().positive() }).strict()
  .refine(v=>v.left+v.width<=512&&v.top+v.height<=768);
export const targetHeadEvidenceSchema = z.object({ version:z.literal(TARGET_HEAD_RETURN_VERSION), gameId:z.string(),hideId:z.string(),
  sourceRequestKey:z.string(),sourceFingerprint:digest,sourcePayloadSha256:digest,normalizedRawSha256:digest,
  shippingSha256:digest,geometrySha256:digest,identitySha256:digest,returned:rect,feather:z.literal(12) }).strict();
export type TargetHeadEvidence = z.infer<typeof targetHeadEvidenceSchema>;
const status=z.enum(['pass','fail','uncertain']);
export const targetHeadAnswerSchema=z.object({ version:z.literal(TARGET_HEAD_RETURN_VERSION),rawHead:rect,shippingHead:rect,
  rawCrown:status,shippingCrown:status,observation:z.string().min(12).max(600) }).strict();
export type TargetHeadDecision={disposition:'pass'|'repair'|'unresolved';reason:string};
export function targetHeadReturnDecision(raw:string|null,evidence:TargetHeadEvidence|undefined):TargetHeadDecision{
  const unresolved={disposition:'unresolved' as const,reason:'HEAD_RETURN: missing or unreadable native head evidence'};
  const proof=targetHeadEvidenceSchema.safeParse(evidence);if(!proof.success)return unresolved;
  let document:unknown;try{document=JSON.parse((raw??'').trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i,'$1'));}catch{return unresolved;}
  const outer=document as {version?:unknown;head?:unknown};if(outer?.version!=='single-sol-medium/v1')return unresolved;
  const parsed=targetHeadAnswerSchema.safeParse(outer.head);if(!parsed.success)return unresolved;
  const a=parsed.data,p=proof.data,r=p.returned,f=p.feather;
  if(a.rawCrown==='fail'||a.shippingCrown==='fail')return{disposition:'repair',reason:'HEAD_RETURN: the target crown is visibly incomplete'};
  if(a.rawCrown!=='pass'||a.shippingCrown!=='pass')return unresolved;
  // These bounds describe the actually opaque return, not the requested child
  // box. A verbal PASS cannot override a located head crossing the blend edge.
  const inside=(h:z.infer<typeof rect>)=>h.left>=r.left+f&&h.top>=r.top+f
    &&h.left+h.width<=r.left+r.width-f&&h.top+h.height<=r.top+r.height-f;
  if(!inside(a.rawHead)||!inside(a.shippingHead))return{disposition:'repair',reason:'HEAD_RETURN: the complete target head crosses the opaque return boundary'};
  const discrepancy=Math.max(...(['left','top','width','height'] as const).map(k=>Math.abs(a.rawHead[k]-a.shippingHead[k])));
  if(discrepancy>12)return{disposition:'repair',reason:'HEAD_RETURN: target head geometry differs between retained RAW and shipping'};
  return{disposition:'pass',reason:'HEAD_RETURN: complete crown retained inside the opaque return'};
}

export function targetHeadReturnPrompt(evidence:TargetHeadEvidence){
 const p=targetHeadEvidenceSchema.parse(evidence);
 return '\nNATIVE TARGET HEAD CHECK '+TARGET_HEAD_RETURN_VERSION+'. Last TWO images: retained provider RAW normalized512x768, then exact SHIPPING512x768, both crop-local axes. RAW is diagnosis, never player approval. Trace the intended target FULL crown, hair/hat, scalp and face in both; ignore bystanders clipped only by this evidence crop. Even slight straight/faded hair loss is a defect. Locate both actual outer head bounds; never copy a child/return box. The whole visible head must fit12px inside EACH return edge (opaque pixels). Natural occlusion needs a specific solid occluder and coherent depth; a mask/blend line or perspective is no excuse.\nHEAD_RETURN_EVIDENCE: '+JSON.stringify({version:p.version,returned:p.returned,feather:p.feather})+'\nIn the SAME final outer answer add "head":{"version":"'+TARGET_HEAD_RETURN_VERSION+'","rawHead":{"left":0,"top":0,"width":1,"height":1},"shippingHead":{"left":0,"top":0,"width":1,"height":1},"rawCrown":"pass|fail|uncertain","shippingCrown":"pass|fail|uncertain","observation":"specific RAW to SHIPPING crown evidence"}. Replace example coordinates with observed complete target head rectangles. A located defect requires repair, never a routine second opinion. All assessment, continuity, head and doubt fields remain mandatory.';

}

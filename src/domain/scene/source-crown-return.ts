import { z } from 'zod';
import { sourcePlacementSha256 as hash } from './source-placement-release';
import type { AuthoredLocalPatchReturnContract, PatchRectangle } from './local-patch-return-region';

/** A new, source-qualified authoring correction. Existing v4 and shrink-only
 * recovery contracts remain unchanged; a caller cannot choose an expansion. */
export const SOURCE_CROWN_RETURN_VERSION='source-crown-return/v1' as const;
export const SOURCE_CROWN_COMPOSITION_VERSION='source-crown-compose/v1' as const;
const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[A-Za-z0-9_:-]{1,240}$/);
const rect=z.object({left:z.number().int().nonnegative(),top:z.number().int().nonnegative(),width:z.number().int().positive(),height:z.number().int().positive()}).strict();
export const SOURCE_CROWN_RETURN_CONTRACTS=Object.freeze([
 {boardId:'amazon',hideId:'amazon-detectives-hide-3',sourceSha256:'2d641f25808666a72cf092bac5069ba0c9ab68b518199c3d584cdc802c8b885d',sourcePixelsSha256:'c1abc61738e5d507df8733990c7b1144aaaf99925485b50a747cc1ca87fd0ec0',crop:{left:3230,top:1070,width:512,height:768},child:{left:305,top:155,width:165,height:350},parentReturned:{left:290,top:140,width:221,height:560},returned:{left:290,top:100,width:221,height:600}},
 {boardId:'paris',hideId:'paris-detectives-hide-3',sourceSha256:'85e29b9efead0e06eea5b9cc40d9a7d2af84f114cb1bdf01338c9cbf381f01a4',sourcePixelsSha256:'554948340f53925b56ed2c4d09902f30f8d7546ad36fff11c2fa6165f0db23b6',crop:{left:3328,top:200,width:512,height:768},child:{left:152,top:335,width:150,height:220},parentReturned:{left:140,top:323,width:174,height:244},returned:{left:140,top:283,width:174,height:284}},
] as const);
export type SourceCrownContract=typeof SOURCE_CROWN_RETURN_CONTRACTS[number];
export function sourceCrownContractFor(parent:AuthoredLocalPatchReturnContract):SourceCrownContract|null{
 const c=SOURCE_CROWN_RETURN_CONTRACTS.find(c=>c.hideId===parent.hideId);
 if(!c||parent.contentVersion!==13||parent.boardId!==c.boardId||parent.source.sha256!==c.sourceSha256
  ||parent.source.art!==`public/scenes/journey-${c.boardId}-detectives-v${c.boardId==='amazon'?3:4}/base.webp`||parent.source.width!==3840||parent.source.height!==2160
  ||hash(parent.crop)!==hash(c.crop)||hash(parent.child)!==hash(c.child)||hash(parent.local)!==hash(c.parentReturned)||!parent.sourcePlacement)return null;
 return c;
}
export const sourceCrownCorrectionSchema=z.object({version:z.literal(SOURCE_CROWN_RETURN_VERSION),contractSha256:digest,parentSha256:digest,
 gameId:id,rowId:id,attempt:z.number().int().min(1).max(3),sourceRequestKey:z.string().min(1).max(240),sourceFingerprint:digest,sourcePayloadSha256:digest,
 normalizedRawSha256:digest,sourcePngSha256:digest,baselineImageSha256:digest,imageSha256:digest,identitySha256:digest,
 returned:rect,outsideReturnChangedPixels:z.literal(0),unchangedBelowTop:z.number().int().nonnegative(),changedBelowBandPixels:z.literal(0)}).strict();
export type SourceCrownCorrection=z.infer<typeof sourceCrownCorrectionSchema>;
export function sourceCrownReturned(parent:AuthoredLocalPatchReturnContract,value:unknown):PatchRectangle|null{
 const p=sourceCrownCorrectionSchema.safeParse(value),c=sourceCrownContractFor(parent);
 return p.success&&c&&p.data.parentSha256===hash(parent)&&p.data.contractSha256===hash(c)&&hash(p.data.returned)===hash(c.returned)
  &&p.data.unchangedBelowTop===c.parentReturned.top+12?p.data.returned:null;
}

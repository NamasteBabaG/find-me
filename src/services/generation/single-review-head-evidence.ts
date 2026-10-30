import { wholeSourceContextMarkerSchema } from "../../domain/generation/whole-source-context-purchase";
import { readWholeSourceContextPin, wholeSourceContextMarkerFor, wholeSourceContextPublicationAuthorized } from "./whole-source-context-pin";
import { extractWholeSourceContextShipping } from "./whole-source-context-pixels";
import { sourcePlacementForHide } from "./source-placement-release";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import sharp from 'sharp';
import type { Prisma } from '@prisma/client';
import { targetHeadEvidenceSchema, targetHeadVersionOfReceipt, TARGET_HEAD_VISIBLE_VERSION, type TargetHeadEvidence } from '../../domain/generation/target-head-return';
import { retainedNormalHeadSchema,RETAINED_NORMAL_HEAD_VERSION,RETAINED_NORMAL_HEAD_ACTION } from '../../domain/generation/retained-normal-head';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { PrismaRetainedPurchaseStore } from '../../infra/db/prisma-retained-purchase-store';
import { sameChargeEvidence } from './world-budget';
import { sha256Bytes as sha } from './fixed-sprite';
import { sourceBodyBirthRequestKey } from './detectives-operational-policy';
import { sourceBodyBirthMarkerSchema } from '../../domain/generation/detectives-operational-policy';
import { localPatchReturnRegion, LOCAL_PATCH_COMPOSITION_VERSION, AUTHORED_PATCH_COMPOSITION_VERSION, type PatchRectangle } from '../../domain/scene/local-patch-return-region';
import { cropOf, maskForHide, type LocalPatchHide } from '../../domain/scene/local-patch-hides';
import { LEGACY_PAID_JOIN_HEAD_VERSION, legacyPaidJoinHeadPlan } from '../../domain/generation/legacy-paid-join-head';
import { measureHeadRetention } from '../../domain/generation/head-retention';

type Receipt=Record<string,unknown>;
const legacyCompositionHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,compositionSource:r.compositionSource,recoveryComposition:r.recoveryComposition})));
const normalCompositionHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,authoredReturn:r.authoredReturn,retainedNormalHead:r.retainedNormalHead})));
const object=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
function sourceKey(hide:Pick<LocalPatchHide,'id'|'pose'>,attempt:number,receipt:Receipt){
 if(receipt.retainedNormalHead!==undefined){
  const p=retainedNormalHeadSchema.parse(receipt.retainedNormalHead);
  if(p.originalAttempt>attempt||p.sourceRequestKey!==`${hide.id}:${hide.pose}:render:${p.originalAttempt}`||receipt.headSourceVersion!==undefined
    ||targetHeadVersionOfReceipt(receipt)!==TARGET_HEAD_VISIBLE_VERSION||receipt.authoredRecovery!==undefined||receipt.crownReturn!==undefined
    ||receipt.propJoinCorrection!==undefined||![LOCAL_PATCH_COMPOSITION_VERSION,AUTHORED_PATCH_COMPOSITION_VERSION].includes(String(receipt.compositionVersion)))
   throw Error('HEAD_RETURN: invalid retained normal source binding');
  return p.sourceRequestKey;
 }
 if(receipt.headSourceVersion!==undefined){
  const plan=receipt.headSourceVersion===LEGACY_PAID_JOIN_HEAD_VERSION&&legacyPaidJoinHeadPlan(receipt,hide,attempt);
  if(!plan)throw Error('HEAD_RETURN: legacy paid composition binding is invalid');
  return plan.sourceRequestKey;
 }
 const birth=sourceBodyBirthMarkerSchema.safeParse(receipt.sourceBodyBirth);
 if(birth.success)return sourceBodyBirthRequestKey(birth.data);
 const recovery=object(object(receipt.authoredRecovery)?.source),prop=object(receipt.propJoinCorrection);
 const crown=object(receipt.crownReturn); const key=crown?.sourceRequestKey??recovery?.requestKey??prop?.requestKey;
 return typeof key==='string'?key:`${hide.id}:${hide.pose}:render:${attempt}`;
}
async function normalSourceAuthorized(db:Prisma.TransactionClient,gameId:string,receipt:Receipt,paid:Awaited<ReturnType<typeof readSettledTargetRaw>>){
 if(receipt.retainedNormalHead===undefined)return;
 const p=retainedNormalHeadSchema.parse(receipt.retainedNormalHead),audit=await db.auditLog.findUnique({where:{id:p.auditId}});
 const saved=audit&&JSON.parse(audit.metaJson??'null');
 if(!audit||audit.actorType!=='SYSTEM'||audit.actorId!==null||audit.action!==RETAINED_NORMAL_HEAD_ACTION||audit.entityType!=='Game'||audit.entityId!==gameId
  ||JSON.stringify(saved?.retainedNormalHead)!==JSON.stringify(p)||saved?.candidateSha256!==receipt.judgedSha256
  ||p.shippingSha256!==receipt.judgedSha256||p.geometrySha256!==receipt.geometrySha256
  ||p.sourceFingerprint!==paid.kept.operationFingerprint||p.sourcePayloadSha256!==paid.kept.payloadSha256||p.normalizedRawSha256!==sha(paid.normalized))
  throw Error('HEAD_RETURN: retained normal source audit differs');
}
const decoded=async(png:Buffer)=>{const {data,info}=await sharp(png,{limitInputPixels:8294400}).removeAlpha().raw().toBuffer({resolveWithObject:true});
 return{data,width:info.width,height:info.height,channels:info.channels};};
/** Measured retention of exactly these authenticated RAW and SHIPPING bytes. */
export async function headRetentionOf(raw:Buffer,shipping:Buffer,returned:PatchRectangle){
 return measureHeadRetention(await decoded(raw),await decoded(shipping),returned);
}
/** The candidate's own shipped bytes, by its row's exact receipt, never a caller URL. */
async function authenticatedShipping(db:Prisma.TransactionClient,input:{gameId:string;imageSha256:string;judgeJson:string|null;assetId?:string}){
 if(!input.judgeJson)return null;
 const assetId=input.assetId??(await db.targetVariantAsset.findFirst({where:{judgeJson:input.judgeJson,targetInstance:{gameScene:{gameId:input.gameId}}},select:{assetId:true}}))?.assetId;
 const asset=assetId?await db.asset.findUnique({where:{id:assetId}}):null;
 if(!asset||asset.deletedAt||asset.status!=='READY'||asset.type!=='TARGET_SPRITE'||asset.providerRequestId!==input.gameId)return null;
 const blob=await db.fileBlob.findUnique({where:{key:asset.storagePath}}),bytes=blob?Buffer.from(blob.data):null;
 return bytes&&sha(bytes)===input.imageSha256?bytes:null;
}
export async function readSettledTargetRaw(db:Prisma.TransactionClient,gameId:string,key:string){
 const worldId=gameId+':board-wizard',stored=await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(worldId);
 const bill=stored?.snapshot.requests.find(b=>b.requestKey===key),kept=await new PrismaRetainedPurchaseStore(db).get(worldId,key);
 if(!bill||!['settled','linked'].includes(bill.state)||!('evidence' in bill)||bill.scope!=='image'||bill.conflicts.length
   ||!kept?.evidence||kept.scope!=='image'||kept.operationFingerprint!==bill.operationFingerprint||!sameChargeEvidence(kept.evidence,bill.evidence))
  throw Error('HEAD_RETURN: exact settled retained painting required');
 const wire=JSON.parse(kept.bytes.toString());
 if(wire.version!=='local-patch-render/v1'||wire.rejected!==null||typeof wire.bytesBase64!=='string')throw Error('HEAD_RETURN: retained painting is unreadable');
 const original=Buffer.from(wire.bytesBase64,'base64');if(original.toString('base64')!==wire.bytesBase64)throw Error('HEAD_RETURN: invalid retained painting bytes');
 let normalized:Buffer;
 if(wire.wholeSourceContext!==undefined||key==='greatwall-v12-2:peeking:render:4'){
  const marker=wholeSourceContextMarkerSchema.parse(wire.wholeSourceContext?.marker),pin=await readWholeSourceContextPin(db,gameId);
  if(!pin||key!==pin.selected.requestKey||JSON.stringify(marker)!==JSON.stringify(wholeSourceContextMarkerFor(pin))
    ||JSON.stringify(wire.wholeSourceContext?.plan)!==JSON.stringify(pin.selected.plan)
    ||!await wholeSourceContextPublicationAuthorized(db,{gameId,variantId:pin.selected.rowId,hideId:pin.selected.hideId,attempts:4,sceneVersion:12,judgeJson:JSON.stringify({wholeSourceContext:marker})}))
   throw Error('HEAD_RETURN: exact native context authority and retained mapping required');
  const context=await resolveLocalPatchBoardsForGame(db,gameId,12),hide=context.boards.flatMap(b=>b.hides).find(h=>h.id===pin.selected.hideId),companion=hide&&sourcePlacementForHide(context,hide.id);
  if(!hide||!companion?.sourceNeighbors)throw Error('HEAD_RETURN: trusted original native context required');
  normalized=await extractWholeSourceContextShipping(original,pin.selected.plan,companion.sourceNeighbors.contract,maskForHide(hide));
 }else normalized=await sharp(original,{limitInputPixels:8294400}).resize(512,768,{fit:'fill'}).png().toBuffer();
 return{kept,wire,original,normalized};
}
export async function singleReviewHeadEvidence(db:Prisma.TransactionClient,input:{gameId:string;hide:LocalPatchHide;attempt:number;
 receipt:Receipt;shipping:Buffer;geometrySha256:string;identitySha256:string}){
 const key=sourceKey(input.hide,input.attempt,input.receipt),paid=await readSettledTargetRaw(db,input.gameId,key);
 await normalSourceAuthorized(db,input.gameId,input.receipt,paid);
 if(input.receipt.retainedNormalHead!==undefined&&retainedNormalHeadSchema.parse(input.receipt.retainedNormalHead).identitySha256!==input.identitySha256)
  throw Error('HEAD_RETURN: retained normal identity differs');
 const legacy=input.receipt.headSourceVersion===LEGACY_PAID_JOIN_HEAD_VERSION?legacyPaidJoinHeadPlan(input.receipt,input.hide,input.attempt):null;
 if(legacy&&(legacy.rawSha256!==sha(paid.normalized)||JSON.stringify(legacy.crop)!==JSON.stringify(cropOf(input.hide))))
  throw Error('HEAD_RETURN: legacy retained RAW differs from its actual composition');
 const returned=(legacy?.returned??object(input.receipt.crownReturn)?.returned??object(input.receipt.authoredRecovery)?.returnWindow??object(input.receipt.authoredReturn)?.local
  ??localPatchReturnRegion(cropOf(input.hide),maskForHide(input.hide),input.hide.returnRect).local) as PatchRectangle;
 const version=targetHeadVersionOfReceipt(input.receipt);
 const evidence=targetHeadEvidenceSchema.parse({version,gameId:input.gameId,hideId:input.hide.id,
  sourceRequestKey:key,sourceFingerprint:paid.kept.operationFingerprint,sourcePayloadSha256:paid.kept.payloadSha256,
  normalizedRawSha256:sha(paid.normalized),shippingSha256:sha(input.shipping),geometrySha256:input.geometrySha256,
  identitySha256:input.identitySha256,returned,feather:12,...(legacy?{sourceBindingVersion:LEGACY_PAID_JOIN_HEAD_VERSION,sourceCompositionSha256:legacyCompositionHash(input.receipt)}
   :input.receipt.retainedNormalHead!==undefined?{sourceBindingVersion:RETAINED_NORMAL_HEAD_VERSION,sourceCompositionSha256:normalCompositionHash(input.receipt)}:{}),
  // v1 questions and decisions stay byte-identical; only visible-head evidence is measured.
  ...(version===TARGET_HEAD_VISIBLE_VERSION?{retention:await headRetentionOf(paid.normalized,input.shipping,returned)}:{})});
 return{evidence,raw:paid.normalized};
}
/** Re-read the retained bill and original provider bytes on publication. A
 * copied head PASS, mutable URL or caller-provided RAW cannot admit a target. */
export async function singleReviewHeadEvidenceMatches(db:Prisma.TransactionClient,input:{gameId:string;hideId:string;imageSha256:string;attempts:number;sceneVersion:number;
 geometrySha256:string;identitySha256:string;judgeJson:string|null;assetId?:string},evidence:TargetHeadEvidence|undefined){
 try{const parsed=targetHeadEvidenceSchema.safeParse(evidence);if(!parsed.success)return false;const p=parsed.data;
  if(p.gameId!==input.gameId||p.hideId!==input.hideId||p.shippingSha256!==input.imageSha256||p.geometrySha256!==input.geometrySha256||p.identitySha256!==input.identitySha256)return false;
  const j=JSON.parse(input.judgeJson??'null');
  if(!j||targetHeadVersionOfReceipt(j)!==p.version)return false;
  if((j.retainedNormalHead!==undefined?RETAINED_NORMAL_HEAD_VERSION:j.headSourceVersion??undefined)!==p.sourceBindingVersion)return false;
  if(p.sourceBindingVersion&&p.sourceCompositionSha256!==(p.sourceBindingVersion===RETAINED_NORMAL_HEAD_VERSION?normalCompositionHash(j):legacyCompositionHash(j)))return false;
  if(!j||sourceKey({id:input.hideId,pose:j.pose},input.attempts,j)!==p.sourceRequestKey)return false;
  const paid=await readSettledTargetRaw(db,input.gameId,p.sourceRequestKey);
  await normalSourceAuthorized(db,input.gameId,j,paid);
  if(j.retainedNormalHead!==undefined){const n=retainedNormalHeadSchema.parse(j.retainedNormalHead);if(n.identitySha256!==input.identitySha256)return false;}
  const legacy=p.sourceBindingVersion===LEGACY_PAID_JOIN_HEAD_VERSION?legacyPaidJoinHeadPlan(j,{id:input.hideId,pose:j.pose},input.attempts):null;
  if(p.sourceBindingVersion===LEGACY_PAID_JOIN_HEAD_VERSION&&(!legacy||legacy.rawSha256!==sha(paid.normalized)))return false;
  let returned=legacy?.returned??j?.crownReturn?.returned??j?.authoredRecovery?.returnWindow??j?.authoredReturn?.local;
  if(!returned){const context=await resolveLocalPatchBoardsForGame(db,input.gameId,input.sceneVersion),hide=context.boards.flatMap(b=>b.hides).find(h=>h.id===input.hideId);if(!hide)return false;returned=localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).local;}
  if(paid.kept.operationFingerprint!==p.sourceFingerprint||paid.kept.payloadSha256!==p.sourcePayloadSha256
   ||sha(paid.normalized)!==p.normalizedRawSha256||JSON.stringify(returned)!==JSON.stringify(p.returned))return false;
  if(!p.retention)return true;
  // The measurement is re-derived from the authenticated paid RAW and the shipped
  // bytes; a copied, stale or edited reading cannot admit or refuse a target.
  const shipping=await authenticatedShipping(db,input);
  return !!shipping&&JSON.stringify(await headRetentionOf(paid.normalized,shipping,returned))===JSON.stringify(p.retention);
 }catch{return false;}
}

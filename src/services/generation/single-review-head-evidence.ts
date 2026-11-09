import { wholeSourceContextMarkerSchema } from "../../domain/generation/whole-source-context-purchase";
import { readWholeSourceContextPin, wholeSourceContextMarkerFor, wholeSourceContextPublicationAuthorized } from "./whole-source-context-pin";
import { extractWholeSourceContextShipping } from "./whole-source-context-pixels";
import { sourcePlacementForHide } from "./source-placement-release";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import sharp from 'sharp';
import { normalizeJourneyHeadProviderPng } from './journey-head-provider-frame';
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
import { HEAD_PIXEL_CORRECTION_ACTION, HEAD_PIXEL_CORRECTION_VERSION, headPixelCorrectionSchema } from '../../domain/generation/head-pixel-correction';
import { CROWN_TAB_ACTION, CROWN_TAB_VERSION, crownTabSchema, crownTabWindow } from '../../domain/generation/crown-tab';
import { SOURCE_FIGURE_RETURN_VERSION, sourceFigureReturnSchema, sourceFigureAuthorityFor, sourceFigureHeadWindow, sourceFigureHash } from '../../domain/generation/source-figure-return';
import { retainedWindowMarkerSchema, retainedWindowCanonicalHash, RETAINED_WINDOW_VERSION, retainedWindowRegion,
  retainedWindowHeadMask, alignRetainedWindowRaw } from '../../domain/generation/retained-window';
import { retainedWindowAuthorityFor } from '../../../content/detectives/retained-window-v1';
import { JOURNEY_SOURCE_HEAD_VERSION, journeyHeadMarkerSchema, journeyHeadAuthorityFor, journeyHeadHash } from '../../domain/generation/journey-source-head';
import { JOURNEY_SUNBURST_TAIL_VERSION } from '../../domain/generation/journey-sunburst-tail';

type Receipt=Record<string,unknown>;
const tabHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,authoredReturn:r.authoredReturn,crownTab:r.crownTab})));
const legacyCompositionHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,compositionSource:r.compositionSource,recoveryComposition:r.recoveryComposition})));
const normalCompositionHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,authoredReturn:r.authoredReturn,retainedNormalHead:r.retainedNormalHead})));
const correctionHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,authoredReturn:r.authoredReturn,headPixelCorrection:r.headPixelCorrection})));
const figureHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,authoredReturn:r.authoredReturn,authoredRecovery:r.authoredRecovery,sourceFigureReturn:r.sourceFigureReturn})));
const windowHash=(r:Receipt)=>sha(Buffer.from(JSON.stringify({compositionVersion:r.compositionVersion,authoredReturn:r.authoredReturn,authoredRecovery:r.authoredRecovery,retainedWindow:r.retainedWindow})));
const journeyCompositionHash=(r:Receipt)=>journeyHeadHash({journeyHeadRecovery:r.journeyHeadRecovery,journeyHeadComposition:r.journeyHeadComposition,compositionVersion:r.compositionVersion,authoredReturn:r.authoredReturn});
const bindingOf=(r:Receipt)=>r.journeyHeadRecovery!==undefined?JOURNEY_SOURCE_HEAD_VERSION:r.retainedWindow!==undefined?RETAINED_WINDOW_VERSION:r.sourceFigureReturn!==undefined?SOURCE_FIGURE_RETURN_VERSION:r.crownTab!==undefined?CROWN_TAB_VERSION:r.retainedNormalHead!==undefined?RETAINED_NORMAL_HEAD_VERSION:r.headPixelCorrection!==undefined?HEAD_PIXEL_CORRECTION_VERSION:r.headSourceVersion??undefined;
const compositionOf=(version:unknown,r:Receipt)=>version===JOURNEY_SOURCE_HEAD_VERSION?journeyCompositionHash(r):version===RETAINED_WINDOW_VERSION?windowHash(r):version===SOURCE_FIGURE_RETURN_VERSION?figureHash(r):version===CROWN_TAB_VERSION?tabHash(r):version===RETAINED_NORMAL_HEAD_VERSION?normalCompositionHash(r):version===HEAD_PIXEL_CORRECTION_VERSION?correctionHash(r):legacyCompositionHash(r);
/** The new tail changes the SOURCE head permission, never its saved authored
 * parent. Preparation and publication must rederive the same judged frame. */
function journeyTailReturned(r:Receipt){
 if(object(r.journeyHeadRecovery)?.version!==JOURNEY_SUNBURST_TAIL_VERSION)return undefined;
 const marker=journeyHeadMarkerSchema.parse(r.journeyHeadRecovery);
 const a=journeyHeadAuthorityFor(r.authoredReturn as Parameters<typeof journeyHeadAuthorityFor>[0],marker);
 if(!a)throw Error('HEAD_RETURN: finite Sunburst tail permission differs');
 return a.returned;
}
function windowAuthority(receipt:Receipt){
 const m=retainedWindowMarkerSchema.parse(receipt.retainedWindow),a=retainedWindowAuthorityFor(receipt.authoredReturn as Parameters<typeof retainedWindowAuthorityFor>[0]);
 if(!a||retainedWindowCanonicalHash(a)!==m.authoritySha256)throw Error('HEAD_RETURN: retained window public permission differs');
 return{m,a};
}
async function windowRetentionRaw(receipt:Receipt,raw:Buffer){
 if(receipt.retainedWindow===undefined)return raw;
 const{m}=windowAuthority(receipt),{data,info}=await sharp(raw).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const mapped=alignRetainedWindowRaw({data,width:info.width,height:info.height,channels:info.channels},m.sampleX,m.sampleY);
 return sharp(Buffer.from(mapped.data),{raw:{width:512,height:768,channels:4}}).png().toBuffer();
}
const object=(v:unknown):Record<string,unknown>|null=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
/** The window a head is judged against: a crown tab adds its own rows above the return. */
const judgedWindow=(receipt:Receipt,returned:PatchRectangle):PatchRectangle=>{
 if(receipt.retainedWindow!==undefined)return retainedWindowRegion(windowAuthority(receipt).a);
 if(receipt.sourceFigureReturn!==undefined){
  const m=sourceFigureReturnSchema.parse(receipt.sourceFigureReturn);
  const a=sourceFigureAuthorityFor(receipt.authoredReturn as Parameters<typeof sourceFigureAuthorityFor>[0],returned);
  if(!a||sourceFigureHash(a)!==m.authoritySha256)throw Error('HEAD_RETURN: whole-figure permission differs');
  return sourceFigureHeadWindow(a);
 }
 if(receipt.crownTab===undefined)return returned;
 const m=crownTabSchema.parse(receipt.crownTab);
 if(JSON.stringify(m.returned)!==JSON.stringify(returned))throw Error('HEAD_RETURN: crown tab return differs from its window');
 return crownTabWindow(m.returned,m.tab);
};
function sourceKey(hide:Pick<LocalPatchHide,'id'|'pose'>,attempt:number,receipt:Receipt):string{
 if(receipt.journeyHeadRecovery!==undefined){
  const m=journeyHeadMarkerSchema.parse(receipt.journeyHeadRecovery),a=journeyHeadAuthorityFor(receipt.authoredReturn as Parameters<typeof journeyHeadAuthorityFor>[0],m);
  if(!a||journeyHeadHash(a)!==m.authoritySha256||hide.id!==m.hideId||attempt!==2||a.pose!==hide.pose
   ||m.requestKey!==hide.id+':'+hide.pose+':render:2'||targetHeadVersionOfReceipt(receipt)!==TARGET_HEAD_VISIBLE_VERSION)
   throw Error('HEAD_RETURN: finite journey-head source binding differs');
  return m.requestKey;
 }
 if(receipt.retainedWindow!==undefined){
  const{m}=windowAuthority(receipt);
  if(m.hideId!==hide.id||m.attempts!==attempt||m.candidateSha256!==receipt.judgedSha256||receipt.compositionVersion!==RETAINED_WINDOW_VERSION
    ||targetHeadVersionOfReceipt(receipt)!==TARGET_HEAD_VISIBLE_VERSION)throw Error('HEAD_RETURN: retained window source differs');
  return m.sourceRequestKey;
 }
 if(receipt.sourceFigureReturn!==undefined){
  const m=sourceFigureReturnSchema.parse(receipt.sourceFigureReturn),{sourceFigureReturn:_figure,...baseline}=receipt;
  if(m.hideId!==hide.id||m.attempts!==attempt||m.candidateSha256!==receipt.judgedSha256
    ||targetHeadVersionOfReceipt(receipt)!==TARGET_HEAD_VISIBLE_VERSION||sourceKey(hide,attempt,baseline)!==m.sourceRequestKey
    ||['crownTab','headPixelCorrection','retainedNormalHead','headSourceVersion'].some(k=>receipt[k]!==undefined))
   throw Error('HEAD_RETURN: invalid whole-figure source binding');
  return m.sourceRequestKey;
 }
 if(receipt.crownTab!==undefined){
  // The tab is over the same paid painting its baseline was composed from.
  const m=crownTabSchema.parse(receipt.crownTab),{crownTab:_tab,...baseline}=receipt;
  if(m.hideId!==hide.id||m.candidateSha256!==receipt.judgedSha256||receipt.retainedNormalHead!==undefined||receipt.headPixelCorrection!==undefined
    ||targetHeadVersionOfReceipt(receipt)!==TARGET_HEAD_VISIBLE_VERSION||sourceKey(hide,attempt,baseline)!==m.sourceRequestKey)
   throw Error('HEAD_RETURN: invalid crown tab source binding');
  return m.sourceRequestKey;
 }
 if(receipt.headPixelCorrection!==undefined){
  // The correction carries its own exact alias chain; the receipt keeps no second one.
  const m=headPixelCorrectionSchema.parse(receipt.headPixelCorrection);
  if(receipt.retainedNormalHead!==undefined||receipt.headSourceVersion!==undefined||receipt.authoredRecovery!==undefined||receipt.crownReturn!==undefined
    ||receipt.propJoinCorrection!==undefined||targetHeadVersionOfReceipt(receipt)!==TARGET_HEAD_VISIBLE_VERSION||m.candidateSha256!==receipt.judgedSha256
    ||(m.alias?m.sourceRequestKey!==m.alias.retainedNormalHead.sourceRequestKey:m.sourceRequestKey!==`${hide.id}:${hide.pose}:render:${attempt}`))
   throw Error('HEAD_RETURN: invalid head pixel correction source binding');
  return m.sourceRequestKey;
 }
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
async function correctionSourceAuthorized(db:Prisma.TransactionClient,gameId:string,receipt:Receipt,paid:Awaited<ReturnType<typeof readSettledTargetRaw>>){
 if(receipt.headPixelCorrection===undefined)return;
 const m=headPixelCorrectionSchema.parse(receipt.headPixelCorrection),audit=await db.auditLog.findUnique({where:{id:m.auditId}});
 const saved=audit&&JSON.parse(audit.metaJson??'null');
 if(!audit||audit.actorType!=='SYSTEM'||audit.actorId!==null||audit.action!==HEAD_PIXEL_CORRECTION_ACTION||audit.entityType!=='Game'||audit.entityId!==gameId
  ||JSON.stringify(saved?.marker)!==JSON.stringify(m)||saved?.candidateSha256!==receipt.judgedSha256||m.geometrySha256!==receipt.geometrySha256
  ||m.sourceFingerprint!==paid.kept.operationFingerprint||m.sourcePayloadSha256!==paid.kept.payloadSha256||m.normalizedRawSha256!==sha(paid.normalized))
  throw Error('HEAD_RETURN: head pixel correction audit differs');
 // The baseline's own alias audit still binds the ORIGINAL image, never the correction.
 if(m.alias)await normalSourceAuthorized(db,gameId,{retainedNormalHead:m.alias.retainedNormalHead,judgedSha256:m.baselineShippingSha256,geometrySha256:m.baselineGeometrySha256},paid);
}
async function tabSourceAuthorized(db:Prisma.TransactionClient,gameId:string,receipt:Receipt,paid:Awaited<ReturnType<typeof readSettledTargetRaw>>){
 if(receipt.crownTab===undefined)return;
 const m=crownTabSchema.parse(receipt.crownTab),audit=await db.auditLog.findUnique({where:{id:m.auditId}});
 const saved=audit&&JSON.parse(audit.metaJson??'null');
 if(!audit||audit.actorType!=='SYSTEM'||audit.actorId!==null||audit.action!==CROWN_TAB_ACTION||audit.entityType!=='Game'||audit.entityId!==gameId
  ||JSON.stringify(saved?.marker)!==JSON.stringify(m)||saved?.candidateSha256!==receipt.judgedSha256||m.geometrySha256!==receipt.geometrySha256
  ||m.sourceFingerprint!==paid.kept.operationFingerprint||m.sourcePayloadSha256!==paid.kept.payloadSha256||m.normalizedRawSha256!==sha(paid.normalized))
  throw Error('HEAD_RETURN: crown tab audit differs');
}
async function figureSourceAuthorized(db:Prisma.TransactionClient,gameId:string,receipt:Receipt){
 if(receipt.sourceFigureReturn===undefined)return;
 const m=sourceFigureReturnSchema.parse(receipt.sourceFigureReturn),row=await db.targetVariantAsset.findUnique({where:{id:m.rowId},select:{assetId:true}});
 if(!row?.assetId||!await(await import('./source-figure-return')).sourceFigurePublicationMatches(db,{gameId,sceneVersion:13,
   hideId:m.hideId,variantId:m.rowId,assetId:row.assetId,judgeJson:JSON.stringify(receipt),identitySha256:m.identitySha256}))
  throw Error('HEAD_RETURN: whole-figure paid source, baseline or candidate differs');
}
async function windowSourceAuthorized(db:Prisma.TransactionClient,gameId:string,receipt:Receipt){
 if(receipt.retainedWindow===undefined)return;
 const{m}=windowAuthority(receipt),row=await db.targetVariantAsset.findUnique({where:{id:m.rowId},select:{assetId:true}});
 if(!row?.assetId||!await(await import('./retained-window-recovery')).retainedWindowEvidenceMatches(db,{gameId,sceneVersion:13,
  hideId:m.hideId,variantId:m.rowId,assetId:row.assetId,judgeJson:JSON.stringify(receipt),identitySha256:m.identitySha256}))
  throw Error('HEAD_RETURN: retained window audit, SOURCE, RAW or candidate differs');
}
async function journeySourceAuthorized(db:Prisma.TransactionClient,gameId:string,receipt:Receipt){
 if(receipt.journeyHeadRecovery===undefined)return;
 if(!await(await import('./journey-source-head-recovery')).journeyHeadCompositionMatches(db,{gameId,hideId:journeyHeadMarkerSchema.parse(receipt.journeyHeadRecovery).hideId,receipt}))
  throw Error('HEAD_RETURN: finite journey SOURCE, paid RAW or candidate differs');
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
 if(wire.journeyHeadRecovery!==undefined){
  journeyHeadMarkerSchema.parse(wire.journeyHeadRecovery);
  normalized=(await normalizeJourneyHeadProviderPng(original)).png;
 }else if(wire.wholeSourceContext!==undefined||key==='greatwall-v12-2:peeking:render:4'){
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
 await correctionSourceAuthorized(db,input.gameId,input.receipt,paid);
 await tabSourceAuthorized(db,input.gameId,input.receipt,paid);
 await figureSourceAuthorized(db,input.gameId,input.receipt);
 await windowSourceAuthorized(db,input.gameId,input.receipt);
 await journeySourceAuthorized(db,input.gameId,input.receipt);
 if(input.receipt.retainedWindow!==undefined&&windowAuthority(input.receipt).m.identitySha256!==input.identitySha256)
  throw Error('HEAD_RETURN: retained window identity differs');
 if(input.receipt.sourceFigureReturn!==undefined&&sourceFigureReturnSchema.parse(input.receipt.sourceFigureReturn).identitySha256!==input.identitySha256)
  throw Error('HEAD_RETURN: whole-figure identity differs');
 if(input.receipt.crownTab!==undefined&&crownTabSchema.parse(input.receipt.crownTab).identitySha256!==input.identitySha256)
  throw Error('HEAD_RETURN: crown tab identity differs');
 if(input.receipt.retainedNormalHead!==undefined&&retainedNormalHeadSchema.parse(input.receipt.retainedNormalHead).identitySha256!==input.identitySha256)
  throw Error('HEAD_RETURN: retained normal identity differs');
 if(input.receipt.headPixelCorrection!==undefined&&headPixelCorrectionSchema.parse(input.receipt.headPixelCorrection).identitySha256!==input.identitySha256)
  throw Error('HEAD_RETURN: head pixel correction identity differs');
 const legacy=input.receipt.headSourceVersion===LEGACY_PAID_JOIN_HEAD_VERSION?legacyPaidJoinHeadPlan(input.receipt,input.hide,input.attempt):null;
 if(legacy&&(legacy.rawSha256!==sha(paid.normalized)||JSON.stringify(legacy.crop)!==JSON.stringify(cropOf(input.hide))))
  throw Error('HEAD_RETURN: legacy retained RAW differs from its actual composition');
 const returned=judgedWindow(input.receipt,(journeyTailReturned(input.receipt)??legacy?.returned??object(input.receipt.crownReturn)?.returned??object(input.receipt.authoredRecovery)?.returnWindow??object(input.receipt.authoredReturn)?.local
  ??localPatchReturnRegion(cropOf(input.hide),maskForHide(input.hide),input.hide.returnRect).local) as PatchRectangle);
 const version=targetHeadVersionOfReceipt(input.receipt);
 const evidence=targetHeadEvidenceSchema.parse({version,gameId:input.gameId,hideId:input.hide.id,
  sourceRequestKey:key,sourceFingerprint:paid.kept.operationFingerprint,sourcePayloadSha256:paid.kept.payloadSha256,
  normalizedRawSha256:sha(paid.normalized),shippingSha256:sha(input.shipping),geometrySha256:input.geometrySha256,
  identitySha256:input.identitySha256,returned,feather:12,...(legacy?{sourceBindingVersion:LEGACY_PAID_JOIN_HEAD_VERSION,sourceCompositionSha256:legacyCompositionHash(input.receipt)}
   :input.receipt.journeyHeadRecovery!==undefined?{sourceBindingVersion:JOURNEY_SOURCE_HEAD_VERSION,sourceCompositionSha256:journeyCompositionHash(input.receipt)}
   :input.receipt.retainedWindow!==undefined?{sourceBindingVersion:RETAINED_WINDOW_VERSION,sourceCompositionSha256:windowHash(input.receipt),
    compoundHeadMask:retainedWindowHeadMask(windowAuthority(input.receipt).a,windowAuthority(input.receipt).m.sampleX,windowAuthority(input.receipt).m.sampleY)}
   :input.receipt.sourceFigureReturn!==undefined?{sourceBindingVersion:SOURCE_FIGURE_RETURN_VERSION,sourceCompositionSha256:figureHash(input.receipt)}
   :input.receipt.retainedNormalHead!==undefined?{sourceBindingVersion:RETAINED_NORMAL_HEAD_VERSION,sourceCompositionSha256:normalCompositionHash(input.receipt)}
   :input.receipt.crownTab!==undefined?{sourceBindingVersion:CROWN_TAB_VERSION,sourceCompositionSha256:tabHash(input.receipt)}
   :input.receipt.headPixelCorrection!==undefined?{sourceBindingVersion:HEAD_PIXEL_CORRECTION_VERSION,sourceCompositionSha256:correctionHash(input.receipt)}:{}),
  // v1 questions and decisions stay byte-identical; only visible-head evidence is measured.
  ...(version===TARGET_HEAD_VISIBLE_VERSION?{retention:await headRetentionOf(await windowRetentionRaw(input.receipt,paid.normalized),input.shipping,returned)}:{})});
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
  if(bindingOf(j)!==p.sourceBindingVersion)return false;
  if(p.sourceBindingVersion&&p.sourceCompositionSha256!==compositionOf(p.sourceBindingVersion,j))return false;
  if(!j||sourceKey({id:input.hideId,pose:j.pose},input.attempts,j)!==p.sourceRequestKey)return false;
  const paid=await readSettledTargetRaw(db,input.gameId,p.sourceRequestKey);
  await normalSourceAuthorized(db,input.gameId,j,paid);
  await correctionSourceAuthorized(db,input.gameId,j,paid);
  await tabSourceAuthorized(db,input.gameId,j,paid);
  await figureSourceAuthorized(db,input.gameId,j);
  await windowSourceAuthorized(db,input.gameId,j);
  await journeySourceAuthorized(db,input.gameId,j);
  if(j.retainedWindow!==undefined){const{m,a}=windowAuthority(j);if(m.identitySha256!==input.identitySha256
   ||JSON.stringify(p.compoundHeadMask)!==JSON.stringify(retainedWindowHeadMask(a,m.sampleX,m.sampleY)))return false;}
  if(j.sourceFigureReturn!==undefined&&sourceFigureReturnSchema.parse(j.sourceFigureReturn).identitySha256!==input.identitySha256)return false;
  if(j.crownTab!==undefined&&crownTabSchema.parse(j.crownTab).identitySha256!==input.identitySha256)return false;
  if(j.retainedNormalHead!==undefined){const n=retainedNormalHeadSchema.parse(j.retainedNormalHead);if(n.identitySha256!==input.identitySha256)return false;}
  if(j.headPixelCorrection!==undefined&&headPixelCorrectionSchema.parse(j.headPixelCorrection).identitySha256!==input.identitySha256)return false;
  const legacy=p.sourceBindingVersion===LEGACY_PAID_JOIN_HEAD_VERSION?legacyPaidJoinHeadPlan(j,{id:input.hideId,pose:j.pose},input.attempts):null;
  if(p.sourceBindingVersion===LEGACY_PAID_JOIN_HEAD_VERSION&&(!legacy||legacy.rawSha256!==sha(paid.normalized)))return false;
  let returned=journeyTailReturned(j)??legacy?.returned??j?.crownReturn?.returned??j?.authoredRecovery?.returnWindow??j?.authoredReturn?.local;
  if(!returned){const context=await resolveLocalPatchBoardsForGame(db,input.gameId,input.sceneVersion),hide=context.boards.flatMap(b=>b.hides).find(h=>h.id===input.hideId);if(!hide)return false;returned=localPatchReturnRegion(cropOf(hide),maskForHide(hide),hide.returnRect).local;}
  returned=judgedWindow(j,returned);
  if(paid.kept.operationFingerprint!==p.sourceFingerprint||paid.kept.payloadSha256!==p.sourcePayloadSha256
   ||sha(paid.normalized)!==p.normalizedRawSha256||JSON.stringify(returned)!==JSON.stringify(p.returned))return false;
  if(!p.retention)return true;
  // The measurement is re-derived from the authenticated paid RAW and the shipped
  // bytes; a copied, stale or edited reading cannot admit or refuse a target.
  const shipping=await authenticatedShipping(db,input);
  return !!shipping&&JSON.stringify(await headRetentionOf(await windowRetentionRaw(j,paid.normalized),shipping,returned))===JSON.stringify(p.retention);
 }catch{return false;}
}

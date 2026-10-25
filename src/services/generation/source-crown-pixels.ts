import { Prisma } from '@prisma/client';
import { env } from '../../lib/env';
import type { Container } from '../container';
import { SOURCE_CROWN_RETURN_CONTRACTS,sourceCrownContractFor,sourceCrownCorrectionSchema,sourceCrownReturned,SOURCE_CROWN_COMPOSITION_VERSION,SOURCE_CROWN_RETURN_VERSION,type SourceCrownCorrection } from '../../domain/scene/source-crown-return';
import { boardConditioningHash as hash } from './board-conditioned-source';
import { sha256Bytes as sha } from './fixed-sprite';
import { composeSourceCrown } from './source-crown-compose';
import { resolveLocalPatchBoardsForGame } from './source-placement-release';
import { expectedAuthoredLocalPatchReturn } from './local-patch-authored-return';
import { singleLowReviewAuthorization } from './single-low-policy';
import { readSettledTargetRaw } from './single-review-head-evidence';
import { readShippedBoardArt } from './local-patch-hide';
import { localPatchGeometry } from './local-patch-geometry';
import { localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { sceneBySlug } from '../scene-catalog.service';
import { fenceLocalPatchImages } from './local-patch-lifecycle';

const same=(a:unknown,b:unknown)=>hash(a)===hash(b);
export const SOURCE_CROWN_PIXELS_ACTION='generation:source-crown-pixels/v1';
export const sourceCrownPixelAuditId=(p:SourceCrownCorrection)=>'aud_crown_pixels_'+hash([p.gameId,p.rowId,p.attempt,p.sourcePayloadSha256,p.imageSha256]);
export const sourceCrownRowHash=(r:{id:string;status:string;assetId:string|null;attempts:number;judgeJson:string|null;rectJson:string|null;hitRectJson:string|null;headAnchorJson:string|null;rejectedAssetIdsJson:string|null})=>
 hash(Object.fromEntries(Object.entries(r).filter(([key])=>key!=='updatedAt').sort(([a],[b])=>a.localeCompare(b))));
type Deps={readBoardArt?:typeof readShippedBoardArt};

/** Reads and derives bytes only. No authority to buy, approve or change game state. */
export async function planSourceCrownCandidate(c:Container,gameId:string,hideId:string,deps:Deps={}){
 if(env().APP_ENV!=='qa'||!SOURCE_CROWN_RETURN_CONTRACTS.some(c=>c.hideId===hideId))return null;
 const authority=await singleLowReviewAuthorization(c.db,gameId);if(authority?.kind!=='from-birth'||authority.sceneVersion!==13)return null;
 const context=await resolveLocalPatchBoardsForGame(c.db,gameId,13),board=context.boards.find(b=>b.hides.some(h=>h.id===hideId)),hide=board?.hides.find(h=>h.id===hideId);
 if(!board||!hide)return null;const parent=expectedAuthoredLocalPatchReturn(board,hide,13,context),contract=parent&&sourceCrownContractFor(parent);if(!parent||!contract)return null;
 const game=await c.db.game.findUnique({where:{id:gameId},include:{childProfile:true,scenes:true,orders:true}}),child=game?.childProfile,scene=game?.scenes.find(s=>s.sceneSlug===board.board);
 if(!game||game.deletedAt||!game.ownerId||!child||child.deletedAt||child.ownerId!==game.ownerId||!child.identityAssetId||!child.ageYears||!scene||scene.sceneVersion!==13
  ||!['TARGETS_GENERATING','READY','DELIVERED'].includes(game.status)||!game.orders.some(o=>o.userId===game.ownerId&&o.paymentStatus==='PAID'&&o.paidAt&&!o.refundedAt)
  ||game.orders.some(o=>o.refundedAt||o.paymentStatus==='REFUNDED'))return null;
 const row=await c.db.targetVariantAsset.findFirst({where:{variant:'A',provider:'local-patch',targetInstance:{gameSceneId:scene.id,targetId:hide.targetId}}});
 if(!row||row.status!=='GENERATED'||!row.assetId||row.attempts<1||row.attempts>3||!row.judgeJson)return null;
 const j=JSON.parse(row.judgeJson);if(j.crownReturn!==undefined||j.authoredRecovery!==undefined||j.propJoinCorrection!==undefined||j.foreground!==undefined||j.sourceBodyBirth!==undefined||j.sourceBodyRepair!==undefined
  ||!same(j.authoredReturn,parent)||j.wireFault!==null||j.renderFault!=null)return null;
 const requestKey=`${hide.id}:${hide.pose}:render:${row.attempts}`,paid=await readSettledTargetRaw(c.db,gameId,requestKey);
 if(!same(paid.wire.authoredReturn,parent))return null;
 const identity=await c.db.asset.findUniqueOrThrow({where:{id:child.identityAssetId}}),asset=await c.db.asset.findUniqueOrThrow({where:{id:row.assetId}});
 if(identity.ownerId!==game.ownerId||identity.type!=='IDENTITY_SHEET'||identity.visibility!=='PRIVATE'||identity.status!=='READY'||identity.deletedAt
  ||sha(await c.storage.get(identity.storagePath))!==authority.identitySha256||asset.ownerId!==game.ownerId||asset.type!=='TARGET_SPRITE'||asset.visibility!=='GAME'||asset.provider!=='local-patch'
  ||asset.providerRequestId!==gameId||asset.status!=='READY'||asset.deletedAt||sha(await c.storage.get(asset.storagePath))!==j.judgedSha256)return null;
 const before=await(deps.readBoardArt??readShippedBoardArt)(board.art,contract.sourceSha256),joined=await composeSourceCrown(before,paid.original,parent);
 if(!joined||joined.proof.baselineImageSha256!==j.judgedSha256)return null;
 const definition=sceneBySlug(board.board,13),measured=await localPatchGeometry({hide,boardPng:before,patchPng:joined.shipping,board:definition.art,contentVersion:13});
 const geometry={rectJson:JSON.stringify(measured.geometry.rect),hitRectJson:JSON.stringify(measured.geometry.hitRect),headAnchorJson:JSON.stringify(measured.geometry.anchor)};
 const correction=sourceCrownCorrectionSchema.parse({version:SOURCE_CROWN_RETURN_VERSION,contractSha256:hash(contract),parentSha256:hash(parent),gameId,rowId:row.id,attempt:row.attempts,
  sourceRequestKey:requestKey,sourceFingerprint:paid.kept.operationFingerprint,sourcePayloadSha256:paid.kept.payloadSha256,identitySha256:authority.identitySha256,...joined.proof});
 const assetId='ast_crown_'+hash([gameId,hide.id,correction.imageSha256]).slice(0,28),key='game/'+assetId+'.png';
 const {boardReview:_oldReview,verdict:_oldVerdict,qualityDisposition:_oldDisposition,...base}=j;
 const judgeJson=JSON.stringify({...base,crownReturn:correction,compositionVersion:SOURCE_CROWN_COMPOSITION_VERSION,reviewState:'pending-board-review',verdict:null,wireFault:null,renderFault:null,
  judgedSha256:correction.imageSha256,geometrySha256:localPatchPublicationGeometryHash(geometry),geometryBasis:measured.basis,measuredFraction:measured.measuredFraction,seam:joined.seam,compositionPermission:joined.compositionPermission});
 return{game,scene,hide,row,identity,authority,assetId,key,geometry,judgeJson,correction,shipping:joined.shipping,originalInput:{gameId,sceneVersion:13,hideId:hide.id,variantId:row.id,attempts:row.attempts,
  identityAssetId:identity.id,identitySha256:authority.identitySha256,assetId:asset.id,imageSha256:j.judgedSha256 as string,geometrySha256:localPatchPublicationGeometryHash(row),judgeJson:row.judgeJson}};
}
export type SourceCrownPlan=NonNullable<Awaited<ReturnType<typeof planSourceCrownCandidate>>>;

/** Caller owns the generation/published-repair fence. This writes only new
 * pixels and an undecided candidate; an old visual PASS is never copied. */
export async function commitSourceCrownCandidate(tx:Prisma.TransactionClient,p:SourceCrownPlan){
 const current=await tx.targetVariantAsset.findUniqueOrThrow({where:{id:p.row.id}});
 if(sourceCrownRowHash(current)!==sourceCrownRowHash(p.row))throw Error('CROWN_RETURN: target changed before composition');
 const auditId=sourceCrownPixelAuditId(p.correction);if(await tx.auditLog.findUnique({where:{id:auditId}}))throw Error('CROWN_RETURN: composition was already applied');
 await tx.asset.create({data:{id:p.assetId,ownerId:p.game.ownerId!,type:'TARGET_SPRITE',visibility:'GAME',status:'READY',storagePath:p.key,mimeType:'image/png',width:512,height:768,
  bytes:p.shipping.length,costCents:0,provider:'local-patch',providerRequestId:p.game.id}});
 await tx.fileBlob.create({data:{key:p.key,data:new Uint8Array(p.shipping),contentType:'image/png'}});
 await tx.auditLog.create({data:{id:auditId,actorType:'SYSTEM',action:SOURCE_CROWN_PIXELS_ACTION,entityType:'Game',entityId:p.game.id,metaJson:JSON.stringify({version:SOURCE_CROWN_RETURN_VERSION,
  correction:p.correction,previousAssetId:p.row.assetId,previousJudgeJson:p.row.judgeJson,previousGeometry:{rectJson:p.row.rectJson,hitRectJson:p.row.hitRectJson,headAnchorJson:p.row.headAnchorJson},providerCalls:0,attemptsPreserved:true,approvalTransferred:false})}});
 const rejected:unknown=JSON.parse(p.row.rejectedAssetIdsJson??'[]');if(!Array.isArray(rejected)||rejected.some(v=>typeof v!=='string'))throw Error('CROWN_RETURN: old image inventory changed');
 const saved=await tx.targetVariantAsset.updateMany({where:{id:p.row.id,status:p.row.status,assetId:p.row.assetId,attempts:p.row.attempts,judgeJson:p.row.judgeJson},
  data:{...p.geometry,assetId:p.assetId,status:'GENERATED',judgeJson:p.judgeJson,lastError:null,rejectedAssetIdsJson:JSON.stringify([...new Set([...rejected,p.row.assetId])])}});
 if(saved.count!==1)throw Error('CROWN_RETURN: concurrent target change');
 await tx.targetInstance.update({where:{id:p.row.targetInstanceId},data:{status:'GENERATED',spriteKind:'image',spriteAssetId:p.assetId}});
}
/** Before the first ordinary review only; never another paid image or opinion. */
export async function applySourceCrownReturn(c:Container,gameId:string,hideId:string,deps:Deps&{fence(tx:Prisma.TransactionClient):Promise<void>}){
 if(c.storage.id!=='db')return null;const p=await planSourceCrownCandidate(c,gameId,hideId,deps);
 if(!p||p.game.status!=='TARGETS_GENERATING')return null;const j=JSON.parse(p.row.judgeJson!);
 if(j.reviewState!=='pending-board-review'||j.boardReview!==undefined)return null;
 await c.db.$transaction(async tx=>{await fenceLocalPatchImages(tx,gameId);await deps.fence(tx);await commitSourceCrownCandidate(tx,p);
  await tx.gameScene.update({where:{id:p.scene.id},data:{generationStatus:'NEEDS_REGENERATION',configJson:null}});
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});return p.assetId;
}
export async function sourceCrownCompositionMatches(db:Prisma.TransactionClient,input:{gameId:string;hideId:string;sceneVersion:number;judgeJson:string|null;variantId?:string;assetId?:string;identitySha256?:string}){
 try{const j=JSON.parse(input.judgeJson??'null');if(j?.crownReturn===undefined)return j?.compositionVersion!==SOURCE_CROWN_COMPOSITION_VERSION;
  const p=sourceCrownCorrectionSchema.parse(j.crownReturn),parent=j.authoredReturn,returned=sourceCrownReturned(parent,p),authority=await singleLowReviewAuthorization(db,input.gameId);
  if(!returned||input.sceneVersion!==13||p.gameId!==input.gameId||p.rowId!==input.variantId||input.identitySha256!==undefined&&p.identitySha256!==input.identitySha256||authority?.kind!=='from-birth'||authority.sceneVersion!==13
   ||authority.identitySha256!==p.identitySha256||j.compositionVersion!==SOURCE_CROWN_COMPOSITION_VERSION||j.judgedSha256!==p.imageSha256
   ||p.sourceRequestKey!==`${input.hideId}:${j.pose}:render:${p.attempt}`)return false;
  const row=await db.targetVariantAsset.findUnique({where:{id:p.rowId},include:{targetInstance:{include:{gameScene:true}}}});
  if(!row||row.targetInstance.gameScene.gameId!==input.gameId||row.attempts!==p.attempt||row.assetId!==input.assetId||row.judgeJson!==input.judgeJson)return false;
  const audit=await db.auditLog.findUnique({where:{id:sourceCrownPixelAuditId(p)}}),entry=JSON.parse(audit?.metaJson??'null');
  if(!audit||audit.actorType!=='SYSTEM'||audit.actorId!==null||audit.action!==SOURCE_CROWN_PIXELS_ACTION||audit.entityType!=='Game'||audit.entityId!==input.gameId
   ||!same(entry?.correction,p)||entry?.approvalTransferred!==false||entry?.providerCalls!==0)return false;
  const paid=await readSettledTargetRaw(db,input.gameId,p.sourceRequestKey);if(!same(paid.wire.authoredReturn,parent)||paid.kept.operationFingerprint!==p.sourceFingerprint||paid.kept.payloadSha256!==p.sourcePayloadSha256)return false;
  const before=await readShippedBoardArt(parent.source.art,parent.source.sha256),joined=await composeSourceCrown(before,paid.original,parent);
  if(!joined||!Object.entries(joined.proof).every(([k,v])=>same((p as unknown as Record<string,unknown>)[k],v)))return false;
  const old=await db.asset.findUnique({where:{id:entry.previousAssetId}}),oldBlob=old?await db.fileBlob.findUnique({where:{key:old.storagePath}}):null;
  const asset=input.assetId?await db.asset.findUnique({where:{id:input.assetId}}):null,blob=asset?await db.fileBlob.findUnique({where:{key:asset.storagePath}}):null;
  return !!old&&old.type==='TARGET_SPRITE'&&old.visibility==='GAME'&&old.status==='READY'&&!old.deletedAt&&old.providerRequestId===input.gameId&&!!oldBlob&&sha(Buffer.from(oldBlob.data))===p.baselineImageSha256
   &&!!asset&&asset.type==='TARGET_SPRITE'&&asset.visibility==='GAME'&&asset.provider==='local-patch'&&asset.providerRequestId===input.gameId&&asset.ownerId===old.ownerId&&asset.status==='READY'&&!asset.deletedAt&&!!blob&&sha(Buffer.from(blob.data))===p.imageSha256;
 }catch{return false;}
}

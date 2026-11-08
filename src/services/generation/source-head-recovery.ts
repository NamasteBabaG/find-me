import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { isDeepStrictEqual as same } from 'node:util';
import type { Container } from '../container';
import { env } from '../../lib/env';
import { DbStorage } from '../../infra/storage/db';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { PrismaRetainedPurchaseStore } from '../../infra/db/prisma-retained-purchase-store';
import { readQaCompletionCapacity } from './qa-completion-capacity';
import { qaCompletionCapacityId, qaCompletionReceiptSchema, QA_COMPLETION_CAP } from '../../domain/generation/qa-completion-capacity';
import { qaCompletionUnknownsPreserved } from '../../domain/generation/qa-completion-recovery';
import { SOURCE_HEAD_RECOVERY_VERSION, SOURCE_HEAD_RECOVERY_ACTION, sourceHeadHash as hash, sourceHeadAuthorityForPlacement,
  sourceHeadMarker, sourceHeadMarkerSchema, type SourceHeadMarker } from '../../domain/generation/source-head-recovery';
import { resolveLocalPatchBoardsForGame,sourcePlacementForHide } from './source-placement-release';
import { expectedAuthoredLocalPatchReturn } from './local-patch-authored-return';
import { localPatchPublicationGeometryHash, hasLocalPatchPublicationPolicy } from './local-patch-publication-policy';
import { singleMediumReviewPolicyOf } from './single-medium-policy';
import { readSettledTargetRaw } from './single-review-head-evidence';
import { reproduceSourceHeadShipping } from './source-head-pixels';
import { sha256Bytes as sha } from './fixed-sprite';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import type { LocalPatchHideDeps } from './local-patch-hide';

const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const pinBody=z.object({version:z.literal(SOURCE_HEAD_RECOVERY_VERSION),gameId:id,worldId:z.string(),ownerId:id,
  completionAuthorizationSha256:digest,authoritySha256:digest,identitySha256:digest,capMicroUsd:z.literal(QA_COMPLETION_CAP),
  rowId:id,hideId:id,originalAttempts:z.literal(3),authorizedAttempt:z.literal(4),requestKey:z.string().max(240),
  previousJudgeJson:z.string().max(250000),previousJudgeSha256:digest,previousAssetId:id,previousRowSha256:digest,rowInvariantSha256:digest,
  protectedRows:z.array(z.object({id,sha256:digest}).strict()).length(26),
  originalRequests:z.array(z.object({requestKey:z.string().max(500),sha256:digest}).strict()).min(1),
  createdAt:z.string().datetime()}).strict();
const pinSchema=pinBody.extend({authorizationSha256:digest}).strict();
export type SourceHeadPin=z.infer<typeof pinSchema>;
export const sourceHeadRecoveryId=(gameId:string)=>'aud_source_head_'+gameId;
type Row={id:string;status:string;attempts:number;judgeJson:string|null;assetId:string|null;[key:string]:unknown};
const rowKeys=['id','targetInstanceId','variant','status','attempts','assetId','rectJson','hitRectJson','headAnchorJson','judgeJson',
  'promptVersion','provider','model','costCents','rejectedAssetIdsJson','lastError'];
const rowHash=(row:Row)=>hash(rowKeys.map(k=>[k,row[k]??null]));
const invariantHash=(row:Row)=>hash(rowKeys.filter(k=>!['status','attempts','judgeJson','lastError'].includes(k)).map(k=>[k,row[k]??null]));
type Db=Prisma.TransactionClient;
type ReadArt=NonNullable<LocalPatchHideDeps['readBoardArt']>;
const sourceArt:ReadArt=async(art,sha)=>(await import('./local-patch-hide')).readShippedBoardArt(art,sha);
const check=(ok:unknown,why:string):void=>{if(!ok)throw Error('SOURCE_HEAD: '+why);};
const scoped=(db:Db)=>({db,storage:new DbStorage(db)} as unknown as Container);

/** Immutable, one-time finite source strategy under the EXISTING completion
 * grant. It is not a world-cap extension, counter reset or approval of art. */
export async function sourceHeadRecoveryPinOf(db:Db,gameId:string):Promise<SourceHeadPin|null>{
  const record=await db.auditLog.findUnique({where:{id:sourceHeadRecoveryId(gameId)}});if(!record)return null;
  const p=pinSchema.parse(JSON.parse(record.metaJson??'null')),{authorizationSha256,...body}=p;
  check(record.actorType==='SYSTEM'&&record.actorId===null&&record.action===SOURCE_HEAD_RECOVERY_ACTION&&record.entityType==='Game'
    &&record.entityId===gameId&&p.gameId===gameId&&p.worldId===gameId+':board-wizard'&&hash(body)===authorizationSha256
    &&record.metaJson===JSON.stringify(p),'invalid finite authority');
  const capacity=await readQaCompletionCapacity(scoped(db),p.worldId);
  // The existing reader already verifies the normal successful photo purge
  // while retaining payment, ownership, identity and enrollment binding.
  check(capacity?.capMicroUsd===QA_COMPLETION_CAP&&capacity.authorizationSha256===p.completionAuthorizationSha256,'original completion authority changed');
  const context=await resolveLocalPatchBoardsForGame(db,gameId,12),board=context.boards.find(b=>b.hides.some(h=>h.id===p.hideId)),hide=board?.hides.find(h=>h.id===p.hideId);
  const authority=sourceHeadAuthorityForPlacement(sourcePlacementForHide(context,p.hideId));
  check(authority&&board&&hide&&hide.pose===authority.pose&&hash(authority)===p.authoritySha256&&p.requestKey===p.hideId+':'+authority.pose+':render:4'
    &&sha(Buffer.from(p.previousJudgeJson))===p.previousJudgeSha256,'public source or previous paid receipt changed');
  const ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(p.worldId);
  check(ledger&&p.originalRequests.every(old=>ledger.snapshot.requests.some(r=>r.requestKey===old.requestKey&&hash(r)===old.sha256)),
    'historical purchases or UNKNOWN reserves changed');
  return p;
}
export function sourceHeadRecoveryCandidate(p:SourceHeadPin,row:Row){
  if(row.id!==p.rowId)return false;
  if(row.status==='FAILED'&&row.attempts===3)return rowHash(row)===p.previousRowSha256;
  return row.status==='PENDING'&&row.attempts===4&&invariantHash(row)===p.rowInvariantSha256&&same(sourceHeadMarker(row),sourceHeadRecoveryMarkerFor(p));
}
export const sourceHeadRecoveryMarkerFor=(p:SourceHeadPin):SourceHeadMarker=>sourceHeadMarkerSchema.parse({version:SOURCE_HEAD_RECOVERY_VERSION,
  authorizationSha256:p.authorizationSha256,authoritySha256:p.authoritySha256,rowId:p.rowId,hideId:p.hideId,originalAttempts:3,
  authorizedAttempt:4,previousJudgeSha256:p.previousJudgeSha256,requestKey:p.requestKey});

export async function resumeSourceHeadRecovery(c:Container,gameId:string,observeRefusal?:(reason:string)=>void){
  const refuse=(reason:string)=>{observeRefusal?.(reason);return false;};
  if(env().APP_ENV!=='qa'||c.storage.id!=='db'||await c.db.auditLog.findUnique({where:{id:sourceHeadRecoveryId(gameId)}}))return refuse('scope-or-existing-pin');
  const capacity=await readQaCompletionCapacity(c,gameId+':board-wizard');if(!capacity)return refuse('original-capacity');
  return c.db.$transaction(async tx=>{
    // The lifecycle fence updates Game.updatedAt. Take the protected snapshot
    // after that lock, so our own fence cannot invalidate the final CAS.
    await fenceLocalPatchImages(tx,gameId);
    const cc={...c,db:tx,storage:new DbStorage(tx)} as unknown as Container;
    const game=await tx.game.findUnique({where:{id:gameId},include:{childProfile:true,scenes:true,orders:true}}),child=game?.childProfile;
    const job=await tx.generationJob.findUnique({where:{id:'job_'+gameId}});
    if(!game||!child||!job||game.deletedAt||child.deletedAt||game.status!=='TARGETS_GENERATING'||game.readyAt||game.configJson
      ||!game.paidAt||game.scenes.length!==9||!game.scenes.every(s=>s.sceneVersion===12)||job.status!=='FAILED'
      ||job.currentStep!=='local-patch:recovery-exhausted'||!child.identityAssetId)return refuse('game-or-job');
    if(game.orders.some(o=>o.refundedAt||o.paymentStatus==='REFUNDED')||!game.orders.some(o=>o.userId===game.ownerId&&o.paymentStatus==='PAID'&&o.paidAt))return refuse('payment');
    const currentCapacity=await readQaCompletionCapacity(cc,gameId+':board-wizard');if(currentCapacity?.authorizationSha256!==capacity.authorizationSha256)return refuse('capacity-race');
    const record=await tx.auditLog.findUnique({where:{id:qaCompletionCapacityId(gameId)}}),grant=qaCompletionReceiptSchema.parse(JSON.parse(record?.metaJson??'null'));
    const ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(gameId+':board-wizard');
    const audit=await (await import('./board-conditioned-wizard')).boardWizardBudgetOf(cc).audit(gameId+':board-wizard');
    if(!ledger||audit.capMicroUsd!==QA_COMPLETION_CAP||audit.held||audit.pendingRequestKeys.length||audit.remainingMicroUsd<400000
      ||!qaCompletionUnknownsPreserved(ledger.snapshot.requests,grant.unknowns))return refuse('budget');
    const rows=await tx.targetVariantAsset.findMany({where:{variant:'A',targetInstance:{gameScene:{gameId}}},include:{targetInstance:{include:{gameScene:true}}}});
    if(rows.length!==27||rows.filter(r=>r.status==='FAILED').length!==1||rows.filter(r=>r.status==='GENERATED').length!==26)return refuse('collection');
    const row=rows.find(r=>r.status==='FAILED')!,old=JSON.parse(row.judgeJson??'null');
    const context=await resolveLocalPatchBoardsForGame(tx,gameId,12),board=context.boards.find(b=>b.board===row.targetInstance.gameScene.sceneSlug),hide=board?.hides.find(h=>h.targetId===row.targetInstance.targetId);
    const parent=board&&hide?expectedAuthoredLocalPatchReturn(board,hide,12,context):null,a=hide&&sourceHeadAuthorityForPlacement(sourcePlacementForHide(context,hide.id));
    if(!a||!board||!hide||child.ageYears!==a.ageYears||!row.assetId||row.attempts!==3||old?.hide!==a.hideId||old.selfRepair?.subjectV2Cycles!==3
      ||old.wireFault!==null||old.reviewState!=='board-review-complete'||old.verdict?.verdict!=='fail'||!same(old.authoredReturn,parent??undefined)
      ||old.sourceHeadRecovery!==undefined||old.sourceBodyRepair!==undefined||old.sourceFigureReturn!==undefined)return refuse('candidate-history');
    await readSettledTargetRaw(tx,gameId,old.authoredRecovery?.source?.requestKey??a.hideId+':'+a.pose+':render:3');
    const key=a.hideId+':'+a.pose+':render:4';
    if(ledger.snapshot.requests.some(r=>r.requestKey===key)||await new PrismaRetainedPurchaseStore(tx).get(gameId+':board-wizard',key))return refuse('fourth-purchase-exists');
    const identity=await tx.asset.findUnique({where:{id:child.identityAssetId}}),policy=await singleMediumReviewPolicyOf(tx,gameId);
    if(!identity||identity.visibility!=='PRIVATE'||identity.type!=='IDENTITY_SHEET'||identity.status!=='READY'||identity.deletedAt||identity.ownerId!==game.ownerId)return refuse('identity');
    const identitySha256=sha(await cc.storage.get(identity.storagePath));if(!policy||policy.identitySha256!==identitySha256)return refuse('medium-policy');
    const protectedRows=[];
    for(const sibling of rows.filter(r=>r.id!==row.id)){
      const otherBoard=context.boards.find(b=>b.board===sibling.targetInstance.gameScene.sceneSlug),otherHide=otherBoard?.hides.find(h=>h.targetId===sibling.targetInstance.targetId);
      const asset=sibling.assetId?await tx.asset.findUnique({where:{id:sibling.assetId}}):null;
      if(!asset||!otherHide||asset.ownerId!==game.ownerId||asset.status!=='READY'||asset.deletedAt||asset.visibility!=='GAME'
        ||!await hasLocalPatchPublicationPolicy(cc,{gameId,sceneVersion:12,hideId:otherHide.id,variantId:sibling.id,attempts:sibling.attempts,
          assetId:asset.id,imageSha256:sha(await cc.storage.get(asset.storagePath)),geometrySha256:localPatchPublicationGeometryHash(sibling),
          identityAssetId:identity.id,identitySha256,judgeJson:sibling.judgeJson}))return refuse('protected-publication:'+otherHide?.id);
      protectedRows.push({id:sibling.id,sha256:rowHash(sibling)});
    }
    const body=pinBody.parse({version:SOURCE_HEAD_RECOVERY_VERSION,gameId,worldId:gameId+':board-wizard',ownerId:game.ownerId,
      completionAuthorizationSha256:capacity.authorizationSha256,authoritySha256:hash(a),identitySha256,capMicroUsd:QA_COMPLETION_CAP,
      rowId:row.id,hideId:a.hideId,originalAttempts:3,authorizedAttempt:4,requestKey:key,previousJudgeJson:row.judgeJson,
      previousJudgeSha256:sha(Buffer.from(row.judgeJson!)),previousAssetId:row.assetId,previousRowSha256:rowHash(row),rowInvariantSha256:invariantHash(row),
      protectedRows,originalRequests:ledger.snapshot.requests.map(r=>({requestKey:r.requestKey,sha256:hash(r)})),createdAt:new Date().toISOString()});
    const p=pinSchema.parse({...body,authorizationSha256:hash(body)});
    const locked=await tx.game.updateMany({where:{id:gameId,ownerId:p.ownerId,status:'TARGETS_GENERATING',deletedAt:null,updatedAt:game.updatedAt},data:{updatedAt:new Date()}});
    const changed=await tx.worldBudgetLedger.updateMany({where:{worldId:p.worldId,revision:ledger.revision},data:{revision:{increment:1}}});
    const resumed=await tx.generationJob.updateMany({where:{id:job.id,gameId,status:'FAILED',currentStep:job.currentStep,attempts:job.attempts,updatedAt:job.updatedAt,lastError:job.lastError},data:{status:'QUEUED',currentStep:'local-patch',lastError:null}});
    check(locked.count===1&&changed.count===1&&resumed.count===1,'concurrent source-head wake changed');
    await tx.auditLog.create({data:{id:sourceHeadRecoveryId(gameId),actorType:'SYSTEM',action:SOURCE_HEAD_RECOVERY_ACTION,entityType:'Game',entityId:gameId,metaJson:JSON.stringify(p)}});
    return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}

export async function requireSourceHeadPurchase(c:Container,gameId:string,rowId:string){
  const game=await c.db.game.findUnique({where:{id:gameId},select:{status:true,deletedAt:true}});
  check(game?.status==='TARGETS_GENERATING'&&!game.deletedAt&&await readQaCompletionCapacity(c,gameId+':board-wizard'),'no active purchase authority');
  const p=await sourceHeadRecoveryPinOf(c.db,gameId),row=await c.db.targetVariantAsset.findUnique({where:{id:rowId}});
  check(p&&row&&sourceHeadRecoveryCandidate(p,row),'no current finite source-head purchase');
  const context=await resolveLocalPatchBoardsForGame(c.db,gameId,12),board=context.boards.find(b=>b.hides.some(h=>h.id===p!.hideId)),hide=board?.hides.find(h=>h.id===p!.hideId);
  const a=sourceHeadAuthorityForPlacement(sourcePlacementForHide(context,p!.hideId));
  check(a&&board&&hide&&hide.pose===a.pose,'public source-head geometry changed');return {pin:p!,marker:sourceHeadRecoveryMarkerFor(p!),authority:a!};
}
export async function fenceSourceHeadPurchase(db:Db,gameId:string,rowId:string,marker:SourceHeadMarker){
  const p=await sourceHeadRecoveryPinOf(db,gameId),row=await db.targetVariantAsset.findUnique({where:{id:rowId}});
  check(p&&row&&same(marker,sourceHeadRecoveryMarkerFor(p))&&sourceHeadRecoveryCandidate(p,row),'finite source-head checkpoint changed');
  const siblings=await db.targetVariantAsset.findMany({where:{id:{in:p!.protectedRows.map(r=>r.id)}}});
  check(siblings.length===26&&p!.protectedRows.every(r=>siblings.some(s=>s.id===r.id&&rowHash(s)===r.sha256)),'protected original appearances changed');
}
export async function sourceHeadPublicationAuthorized(db:Db,input:{gameId:string;variantId:string;hideId:string;attempts:number;sceneVersion:number;judgeJson:string|null}){
  try{const p=await sourceHeadRecoveryPinOf(db,input.gameId),m=sourceHeadMarker(input);return !!p&&!!m&&input.sceneVersion===12
    &&input.variantId===p.rowId&&input.hideId===p.hideId&&input.attempts===4&&same(m,sourceHeadRecoveryMarkerFor(p));}catch{return false;}
}
export async function sourceHeadCompositionEvidenceMatches(db:Db,input:{gameId:string;hideId:string;receipt:Record<string,any>;beforePng?:Buffer},readArt:ReadArt=sourceArt){
  try{
    const m=sourceHeadMarker({judgeJson:JSON.stringify(input.receipt)}),p=await sourceHeadRecoveryPinOf(db,input.gameId);
    if(!m||!p||!same(m,sourceHeadRecoveryMarkerFor(p))||p.hideId!==input.hideId)return false;
    const row=await db.targetVariantAsset.findUnique({where:{id:p.rowId}});if(!row||row.attempts!==4||!same(JSON.parse(row.judgeJson??'null'),input.receipt))return false;
    const context=await resolveLocalPatchBoardsForGame(db,input.gameId,12),board=context.boards.find(b=>b.hides.some(h=>h.id===p.hideId)),hide=board?.hides.find(h=>h.id===p.hideId);
    const parent=board&&hide?expectedAuthoredLocalPatchReturn(board,hide,12,context):null,a=hide&&sourceHeadAuthorityForPlacement(sourcePlacementForHide(context,hide.id));
    if(!a||!same(input.receipt.authoredReturn,parent??undefined)||input.receipt.authoredRecovery!==undefined||input.receipt.sourceBodyRepair!==undefined)return false;
    const paid=await readSettledTargetRaw(db,input.gameId,p.requestKey);
    if(!same(paid.wire.authoredReturn,parent??undefined)||!same(paid.wire.sourceHeadRecovery,m))return false;
    const before=input.beforePng??await readArt(a.source.art,a.source.sha256),made=await reproduceSourceHeadShipping(before,paid.normalized,a);
    const measured=await (await import('./local-patch-geometry')).localPatchGeometry({hide:hide!,boardPng:before,patchPng:made.png,board:a.source,contentVersion:12});
    const geometry={rectJson:JSON.stringify(measured.geometry.rect),hitRectJson:JSON.stringify(measured.geometry.hitRect),headAnchorJson:JSON.stringify(measured.geometry.anchor)};
    if(localPatchPublicationGeometryHash(geometry)!==input.receipt.geometrySha256||localPatchPublicationGeometryHash(row)!==input.receipt.geometrySha256)return false;
    const previous=JSON.parse(p.previousJudgeJson);
    if(!same(input.receipt.selfRepair,previous.selfRepair)||!same(input.receipt.guidedFrameRecovery,previous.guidedFrameRecovery))return false;
    const asset=row.assetId?await db.asset.findUnique({where:{id:row.assetId}}):null,game=await db.game.findUnique({where:{id:input.gameId},include:{orders:true}});
    if(!asset||!game||game.deletedAt||game.orders.some(o=>o.refundedAt||o.paymentStatus==='REFUNDED')
      ||!game.orders.some(o=>o.userId===game.ownerId&&o.paymentStatus==='PAID'&&o.paidAt)||asset.ownerId!==game.ownerId
      ||asset.deletedAt||asset.status!=='READY'||asset.visibility!=='GAME'||asset.type!=='TARGET_SPRITE'||asset.providerRequestId!==game.id)return false;
    return sha(made.png)===input.receipt.judgedSha256&&sha(await new DbStorage(db).get(asset.storagePath))===input.receipt.judgedSha256
      &&same(made.proof,input.receipt.sourceHeadComposition);
  }catch{return false;}
}

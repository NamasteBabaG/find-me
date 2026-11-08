import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { isDeepStrictEqual as same } from 'node:util';
import type { Container } from '../container';
import { env } from '../../lib/env';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { SOURCE_HEAD_JOIN_VERSION, SOURCE_HEAD_JOIN_ACTION, sourceHeadJoinMarkerSchema, type SourceHeadJoinMarker } from '../../domain/generation/source-head-join';
import { sourceHeadHash as hash, sourceHeadMarker, sourceHeadAuthorityForPlacement } from '../../domain/generation/source-head-recovery';
import { sourceHeadRecoveryPinOf, sourceHeadRecoveryMarkerFor, sourceHeadRecoveryRowHash, sourceHeadRecoveryRowInvariant, type SourceHeadPin } from './source-head-recovery';
import { readQaCompletionCapacity } from './qa-completion-capacity';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { readSettledTargetRaw } from './single-review-head-evidence';
import { resolveLocalPatchBoardsForGame, sourcePlacementForHide } from './source-placement-release';
import { reproduceSourceHeadShipping } from './source-head-pixels';
import { sha256Bytes as sha } from './fixed-sprite';

type Db=Prisma.TransactionClient;
const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const pinBody=z.object({version:z.literal(SOURCE_HEAD_JOIN_VERSION),gameId:id,rowId:id,recoveryAuthorizationSha256:digest,
  authoritySha256:digest,replayRowInvariantSha256:digest,previousJudgeJson:z.string().max(250000),previousRowSha256:digest,sourceRequestKey:z.string().max(240),
  sourceFingerprint:z.string().max(500),sourcePayloadSha256:digest,candidateSha256:digest,
  originalRequests:z.array(z.object({requestKey:z.string().max(500),sha256:digest}).strict()).min(2),createdAt:z.string().datetime()}).strict();
const pinSchema=pinBody.extend({authorizationSha256:digest}).strict();
type JoinPin=z.infer<typeof pinSchema>;
export const sourceHeadJoinId=(gameId:string)=>'aud_source_head_join_'+gameId;
const markerFor=(p:JoinPin):SourceHeadJoinMarker=>sourceHeadJoinMarkerSchema.parse({version:p.version,authorizationSha256:p.authorizationSha256,
  recoveryAuthorizationSha256:p.recoveryAuthorizationSha256,authoritySha256:p.authoritySha256,sourceRequestKey:p.sourceRequestKey,
  replayRowInvariantSha256:p.replayRowInvariantSha256,
  sourceFingerprint:p.sourceFingerprint,sourcePayloadSha256:p.sourcePayloadSha256});
const check=(ok:unknown,why:string):void=>{if(!ok)throw Error('SOURCE_HEAD_JOIN: '+why);};

/** One additive, SYSTEM-bound replay of the already-settled fourth painting.
 * Its old failure and every previous bill remain immutable in the audit. */
export async function sourceHeadJoinForRow(db:Db,gameId:string,row:{id:string;attempts:number;judgeJson:string|null},root?:SourceHeadPin){
  const receipt=JSON.parse(row.judgeJson??'null');if(receipt?.sourceHeadJoin===undefined)return null;
  const marker=sourceHeadJoinMarkerSchema.parse(receipt.sourceHeadJoin),record=await db.auditLog.findUnique({where:{id:sourceHeadJoinId(gameId)}});
  check(record,'missing free replay authority');
  const p=pinSchema.parse(JSON.parse(record!.metaJson??'null')),{authorizationSha256,...body}=p;
  check(record!.actorType==='SYSTEM'&&record!.actorId===null&&record!.action===SOURCE_HEAD_JOIN_ACTION&&record!.entityType==='Game'
    &&record!.entityId===gameId&&record!.metaJson===JSON.stringify(p)&&hash(body)===authorizationSha256,'invalid free replay authority');
  const original=root??await sourceHeadRecoveryPinOf(db,gameId);
  check(original&&original.gameId===gameId&&p.gameId===gameId&&p.rowId===row.id&&row.attempts===4
    &&p.recoveryAuthorizationSha256===original.authorizationSha256&&p.authoritySha256===original.authoritySha256
    &&p.sourceRequestKey===original.requestKey&&same(marker,markerFor(p))
    &&same(sourceHeadMarker(row),sourceHeadRecoveryMarkerFor(original)),'changed finite replay binding');
  const current=await db.targetVariantAsset.findUnique({where:{id:row.id}});
  check(current&&current.attempts===4&&(current.status!=='PENDING'||sourceHeadRecoveryRowInvariant(current)===p.replayRowInvariantSha256),
    'post-settlement row cost or geometry changed');
  const ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(original!.worldId);
  check(ledger&&p.originalRequests.length===original!.originalRequests.length+1
    &&p.originalRequests.every(old=>ledger.snapshot.requests.some(r=>r.requestKey===old.requestKey&&hash(r)===old.sha256)),
    'old purchases or full UNKNOWN reserves changed');
  const paid=await readSettledTargetRaw(db,gameId,p.sourceRequestKey);
  check(paid.kept.operationFingerprint===p.sourceFingerprint&&paid.kept.payloadSha256===p.sourcePayloadSha256
    &&same(paid.wire.sourceHeadRecovery,sourceHeadRecoveryMarkerFor(original!)),'already-paid RAW differs');
  return {marker,pin:p};
}

/** No purchase and no replacement pixels are authorized here. The normal
 * pipeline replays the same key/fingerprint, then buys only a fresh assessment. */
export async function resumeSourceHeadJoinRecovery(c:Container,gameId:string,observeRefusal?:(reason:string)=>void){
  const refuse=(why:string)=>{observeRefusal?.(why);return false;};
  if(env().APP_ENV!=='qa'||c.storage.id!=='db'||await c.db.auditLog.findUnique({where:{id:sourceHeadJoinId(gameId)}}))return refuse('scope-or-existing-pin');
  if(!await readQaCompletionCapacity(c,gameId+':board-wizard'))return refuse('original-completion-capacity');
  const root=await sourceHeadRecoveryPinOf(c.db,gameId);if(!root)return refuse('original-head-authority');
  return c.db.$transaction(async tx=>{
    await fenceLocalPatchImages(tx,gameId);
    const game=await tx.game.findUnique({where:{id:gameId},include:{childProfile:true,orders:true}}),job=await tx.generationJob.findUnique({where:{id:'job_'+gameId}});
    const p=await sourceHeadRecoveryPinOf(tx,gameId),row=p?await tx.targetVariantAsset.findUnique({where:{id:p.rowId}}):null;
    if(!game||!job||!p||!row||game.deletedAt||game.status!=='TARGETS_GENERATING'||game.readyAt||game.configJson||!game.paidAt
      ||game.childProfile?.ageYears!==7||job.status!=='FAILED'||job.currentStep!=='local-patch:recovery-exhausted'
      ||row.status!=='FAILED'||row.attempts!==4||row.assetId!==p.previousAssetId)return refuse('live-failed-fourth-head');
    if(game.orders.some(o=>o.refundedAt||o.paymentStatus==='REFUNDED')||!game.orders.some(o=>o.userId===game.ownerId&&o.paymentStatus==='PAID'&&o.paidAt))return refuse('payment');
    const previous=JSON.parse(row.judgeJson??'null');
    if(!same(sourceHeadMarker(row),sourceHeadRecoveryMarkerFor(p))||previous?.renderFault!=='quality-seam: SOURCE_HEAD: new head boundary exceeds unchanged seam/alignment limits'
      ||previous.wireFault!==null||previous.verdict!==null||previous.sourceHeadComposition!==undefined||previous.sourceHeadJoin!==undefined
      ||!same(previous.selfRepair,JSON.parse(p.previousJudgeJson).selfRepair))return refuse('exact-unreviewed-v1-join-refusal');
    const ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(p.worldId);
    if(!ledger||ledger.snapshot.requests.length!==p.originalRequests.length+1||ledger.snapshot.requests.some(r=>r.state==='pending'))return refuse('unsettled-or-extra-purchases');
    const siblings=await tx.targetVariantAsset.findMany({where:{id:{in:p.protectedRows.map(r=>r.id)}}});
    if(siblings.length!==26||!p.protectedRows.every(old=>siblings.some(r=>r.id===old.id&&sourceHeadRecoveryRowHash(r)===old.sha256)))return refuse('protected26-changed');
    let paid:Awaited<ReturnType<typeof readSettledTargetRaw>>;
    try{paid=await readSettledTargetRaw(tx,gameId,p.requestKey);}catch{return refuse('settled-retained-fourth-required');}
    if(!same(paid.wire.sourceHeadRecovery,sourceHeadRecoveryMarkerFor(p)))return refuse('retained-head-authority');
    const context=await resolveLocalPatchBoardsForGame(tx,gameId,12),a=sourceHeadAuthorityForPlacement(sourcePlacementForHide(context,p.hideId));
    if(!a||hash(a)!==p.authoritySha256)return refuse('public-source-permission');
    const before=await (await import('./local-patch-hide')).readShippedBoardArt(a.source.art,a.source.sha256);
    let made:Awaited<ReturnType<typeof reproduceSourceHeadShipping>>;
    try{made=await reproduceSourceHeadShipping(before,paid.normalized,a,SOURCE_HEAD_JOIN_VERSION);}catch{return refuse('protected-join-or-original-outer-window');}
    const body=pinBody.parse({version:SOURCE_HEAD_JOIN_VERSION,gameId,rowId:row.id,recoveryAuthorizationSha256:p.authorizationSha256,
      authoritySha256:p.authoritySha256,replayRowInvariantSha256:sourceHeadRecoveryRowInvariant(row),previousJudgeJson:row.judgeJson,previousRowSha256:sourceHeadRecoveryRowHash(row),sourceRequestKey:p.requestKey,
      sourceFingerprint:paid.kept.operationFingerprint,sourcePayloadSha256:paid.kept.payloadSha256,candidateSha256:sha(made.png),
      originalRequests:ledger.snapshot.requests.map(r=>({requestKey:r.requestKey,sha256:hash(r)})),createdAt:new Date().toISOString()});
    const pin=pinSchema.parse({...body,authorizationSha256:hash(body)});
    const locked=await tx.game.updateMany({where:{id:gameId,ownerId:p.ownerId,status:'TARGETS_GENERATING',deletedAt:null,updatedAt:game.updatedAt},data:{updatedAt:new Date()}});
    const revised=await tx.worldBudgetLedger.updateMany({where:{worldId:p.worldId,revision:ledger.revision},data:{revision:{increment:1}}});
    const changed=await tx.targetVariantAsset.updateMany({where:{id:row.id,status:'FAILED',attempts:4,assetId:row.assetId,judgeJson:row.judgeJson,updatedAt:row.updatedAt},
      data:{status:'PENDING',judgeJson:JSON.stringify({...previous,sourceHeadJoin:markerFor(pin)}),lastError:null}});
    const resumed=await tx.generationJob.updateMany({where:{id:job.id,status:'FAILED',currentStep:job.currentStep,attempts:job.attempts,updatedAt:job.updatedAt,lastError:job.lastError},data:{status:'QUEUED',currentStep:'local-patch',lastError:null}});
    check(locked.count===1&&revised.count===1&&changed.count===1&&resumed.count===1,'concurrent replay wake changed');
    await tx.auditLog.create({data:{id:sourceHeadJoinId(gameId),actorType:'SYSTEM',action:SOURCE_HEAD_JOIN_ACTION,entityType:'Game',entityId:gameId,metaJson:JSON.stringify(pin)}});
    return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}

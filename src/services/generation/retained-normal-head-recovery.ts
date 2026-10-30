import {Prisma} from '@prisma/client';
import sharp from 'sharp';
import type {Container} from '../container';
import {DbStorage} from '../../infra/storage/db';
import {PrismaWorldBudgetStore} from '../../infra/db/prisma-world-budget-store';
import {PrismaRetainedPurchaseStore} from '../../infra/db/prisma-retained-purchase-store';
import {retainedNormalHeadSchema,retainedNormalHeadRecoveryCandidate,RETAINED_NORMAL_HEAD_ACTION,RETAINED_NORMAL_HEAD_VERSION} from '../../domain/generation/retained-normal-head';
import {qaCompletionCapacityId,qaCompletionReceiptSchema,QA_COMPLETION_CAP} from '../../domain/generation/qa-completion-capacity';
import {qaCompletionUnknownsPreserved} from '../../domain/generation/qa-completion-recovery';
import {historicalHeadClearanceReassessment} from '../../domain/generation/visible-head-policy-recovery';
import {TARGET_HEAD_VISIBLE_VERSION} from '../../domain/generation/target-head-return';
import {readSingleVisualReview,readSingleVisualReviewVersion,SINGLE_MEDIUM_VISUAL_REVIEW_VERSION} from '../../domain/generation/single-visual-review';
import {isSingleMediumReviewPolicy} from '../../domain/generation/visual-review-policy';
import {readBoundSubjectQualityEnvelopeV2} from '../../domain/generation/bound-subject-quality-envelope';
import {SUBJECT_QUALITY_BUNDLE_VERSION} from '../../domain/generation/subject-quality-bundle';
import {readSourceNeighborQualityBundle} from '../../domain/generation/source-neighbor-quality-bundle';
import {readSubjectAnswerV2,SUBJECT_POLICY_V2} from '../../domain/generation/subject-policy';
import {readLocalPatchBodyContinuity,localPatchRuntimeContinuityVerdict} from '../../domain/scene/local-patch-body-continuity';
import {cropOf,maskForHide} from '../../domain/scene/local-patch-hides';
import {AUTHORED_PATCH_COMPOSITION_VERSION,LOCAL_PATCH_COMPOSITION_VERSION} from '../../domain/scene/local-patch-return-region';
import {readQaCompletionCapacity} from './qa-completion-capacity';
import {resolveLocalPatchBoardsForGame} from './source-placement-release';
import {expectedAuthoredLocalPatchReturn,authoredLocalPatchReviewBinding} from './local-patch-authored-return';
import {readSettledTargetRaw,singleReviewHeadEvidence} from './single-review-head-evidence';
import {composeBoundedLocalPatch} from './local-patch-seam';
import {localPatchGeometry} from './local-patch-geometry';
import {localPatchPublicationGeometryHash} from './local-patch-publication-policy';
import {sceneBySlug} from '../scene-catalog.service';
import {readShippedBoardArt,type LocalPatchHideDeps} from './local-patch-hide';
import {sourceNeighborQualityEvidence,CURRENT_QUALITY_READER,CURRENT_CONTINUITY_READER} from './local-patch-dual-evidence';
import {dualVisualReviewVersion} from './visual-review-release';
import {parseVisualSceneVerdicts} from './visual-review';
import {localPatchQualityDisposition} from './local-patch-judge';
import {PLAYER_REVIEW_MODE} from './local-patch-player-review';
import {subjectPlanOfHide,subjectPlanSha256,subjectUpgradeOf} from './subject-enrollment';
import {backgroundRoundOfKey,roundAnswered} from './continuity-background';
import {fenceLocalPatchImages} from './local-patch-lifecycle';
import {auditWorldBudget,sameChargeEvidence} from './world-budget';
import {sha256Bytes} from './fixed-sprite';
import {singleLowReviewAuthorization} from './single-low-policy';
import {guidedFrameMarker,guidedFrameVersionMatches} from '../../domain/generation/guided-frame-recovery';

const hash=(v:unknown)=>sha256Bytes(Buffer.from(JSON.stringify(v)));
type Candidate={id:string;status:string;attempts:number;assetId:string|null;judgeJson:string|null};

/** Reproduce at most two original NORMAL paid candidates and restore one only
 * when its original settled MEDIUM passed every other role and merely needs
 * the new close-head question. No provider interface or purchase is used. */
export async function restoreRetainedNormalHead(c:Container,gameId:string,rows:readonly Candidate[],fence:(tx:Prisma.TransactionClient)=>Promise<void>,
 readArt:LocalPatchHideDeps['readBoardArt']=readShippedBoardArt){
 const candidates=rows.filter(retainedNormalHeadRecoveryCandidate);if(!candidates.length)return false;
 const worldId=gameId+':board-wizard',grant=await readQaCompletionCapacity(c,worldId);if(!grant)return false;
 const authority=qaCompletionReceiptSchema.parse(JSON.parse((await c.db.auditLog.findUniqueOrThrow({where:{id:qaCompletionCapacityId(gameId)}})).metaJson!));
 const stored=await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldId),upgrade=await subjectUpgradeOf(c.db,gameId);
 if(!stored||!upgrade||authority.authorizationSha256!==grant.authorizationSha256)return false;
 const audit=auditWorldBudget(stored.snapshot,QA_COMPLETION_CAP);
 if(audit.held||audit.overCapMicroUsd||audit.pendingRequestKeys.length||audit.conflictRequestKeys.length||audit.overrunRequestKeys.length
  ||!qaCompletionUnknownsPreserved(stored.snapshot.requests,authority.unknowns))return false;
 const context=await resolveLocalPatchBoardsForGame(c.db,gameId,authority.state.sceneVersion),store=new PrismaRetainedPurchaseStore(c.db),originalAuthority=await singleLowReviewAuthorization(c.db,gameId),visualVersion=await dualVisualReviewVersion(c.db,gameId);
 if(!visualVersion)return false;
 for(const candidate of candidates){
  const row=await c.db.targetVariantAsset.findUniqueOrThrow({where:{id:candidate.id},include:{targetInstance:{include:{gameScene:true}}}});
  if(!retainedNormalHeadRecoveryCandidate(row)||row.targetInstance.gameScene.gameId!==gameId)continue;
  const guided=guidedFrameMarker(row);
  if(!originalAuthority||originalAuthority.sceneVersion!==authority.state.sceneVersion
   ||guided&&(guided.authorizationSha256!==originalAuthority.authorizationSha256||!guidedFrameVersionMatches(guided,authority.state.sceneVersion)))continue;
  const previous=JSON.parse(row.judgeJson!),scene=row.targetInstance.gameScene,board=context.boards.find(b=>b.board===scene.sceneSlug),hide=board?.hides.find(h=>h.targetId===row.targetInstance.targetId);
  if(!board||!hide||previous.hide!==hide.id||scene.sceneVersion!==authority.state.sceneVersion)continue;
  const plan=subjectPlanOfHide(hide.id,scene.sceneVersion);if(!plan)continue;
  const definition=sceneBySlug(scene.sceneSlug,scene.sceneVersion),original=await readArt!(board.art,definition.art.sha256??''),crop=cropOf(hide);
  const parent=expectedAuthoredLocalPatchReturn(board,hide,scene.sceneVersion,context);
  const intents=await c.db.auditLog.findMany({where:{actorType:'SYSTEM',action:'generation:sol-background-review',entityType:'Game',entityId:gameId,id:{endsWith:'_intent'},metaJson:{contains:JSON.stringify(row.id)}},orderBy:{createdAt:'desc'}});
  for(const originalAttempt of [2,1] as const){
   const sourceKey=`${hide.id}:${hide.pose}:render:${originalAttempt}`;
   if(!stored.snapshot.requests.some(r=>r.requestKey===sourceKey&&['settled','linked'].includes(r.state)))continue;
   const raw=await readSettledTargetRaw(c.db,gameId,sourceKey);
   if(hash(raw.wire.authoredReturn??null)!==hash(parent??null)||raw.wire.sourceBodyRepair!==undefined||raw.wire.sourceBodyBirth!==undefined||raw.wire.wholeSourceContext!==undefined)continue;
   const composed=await composeBoundedLocalPatch(original,crop,raw.normalized,maskForHide(hide),{playerReview:true,...(hide.returnRect?{returnRect:hide.returnRect}:{})});
   if(!composed.usable)continue;
   const shipping=await sharp(composed.candidate).extract(crop).png().toBuffer(),imageSha256=sha256Bytes(shipping),assetId='ast_lp_'+hash([gameId,hide.id,imageSha256]).slice(0,24);
   const asset=await c.db.asset.findUnique({where:{id:assetId}});
   if(!asset||asset.deletedAt||asset.status!=='READY'||asset.ownerId!==authority.state.ownerId||asset.providerRequestId!==gameId||asset.type!=='TARGET_SPRITE'||asset.visibility!=='GAME'
    ||sha256Bytes(await c.storage.get(asset.storagePath))!==imageSha256)continue;
   const measured=await localPatchGeometry({hide,boardPng:original,patchPng:shipping,board:definition.art,contentVersion:scene.sceneVersion});
   const geometry={rectJson:JSON.stringify(measured.geometry.rect),hitRectJson:JSON.stringify(measured.geometry.hitRect),headAnchorJson:JSON.stringify(measured.geometry.anchor)},geometrySha256=localPatchPublicationGeometryHash(geometry);
   const normal={compositionVersion:parent?AUTHORED_PATCH_COMPOSITION_VERSION:LOCAL_PATCH_COMPOSITION_VERSION,authoredReturn:parent??undefined,
    judgedSha256:imageSha256,geometrySha256,hide:hide.id,pose:hide.pose};
   const oldHead=await singleReviewHeadEvidence(c.db,{gameId,hide,attempt:originalAttempt,receipt:normal,shipping,geometrySha256,identitySha256:authority.state.identitySha256});
   const neighbors=sourceNeighborQualityEvidence(context,hide.id,imageSha256,normal);
   const authoredBinding=authoredLocalPatchReviewBinding({hideId:hide.id,imageSha256,geometrySha256,identitySha256:authority.state.identitySha256,...(parent?{authoredReturn:parent}:{})});
   for(const intent of intents){
    const event=JSON.parse(intent.metaJson??'null'),key=event?.intent?.requestKey;if(typeof key!=='string')continue;
    const round=await backgroundRoundOfKey(c.db,gameId,worldId,key),b=round?.intent?.binding;
    if(!round||!roundAnswered(round)||b?.variantId!==row.id||b.hideId!==hide.id||b.imageSha256!==imageSha256||b.geometrySha256!==geometrySha256
     ||b.identitySha256!==authority.state.identitySha256||b.authoredReviewBinding!==authoredBinding)continue;
    const bill=stored.snapshot.requests.find(r=>r.requestKey===key),kept=await store.get(worldId,key);
    if(!bill||!['settled','linked'].includes(bill.state)||bill.scope!=='judge'||!('evidence' in bill)||bill.conflicts.length
     ||bill.evidence.model!=='gpt-6.1-sol'||bill.evidence.providerNamespace!=='openai:find-me-existing'||!kept?.evidence||kept.scope!=='judge'
     ||kept.operationFingerprint!==bill.operationFingerprint||round.intent?.fingerprint!==kept.operationFingerprint||!sameChargeEvidence(kept.evidence,bill.evidence))continue;
    const wire=JSON.parse(kept.bytes.toString()),reading=readSingleVisualReview(wire.raw);
    if(!isSingleMediumReviewPolicy(wire.policy)||wire.model!=='gpt-6.1-sol'||wire.finishReason!=='stop'||wire.wireFault!==null||wire.costUnknown!==false||wire.fingerprint!==kept.operationFingerprint
     ||wire.authoredReviewBinding!==authoredBinding||readSingleVisualReviewVersion(wire.raw)!==SINGLE_MEDIUM_VISUAL_REVIEW_VERSION||!reading||reading.doubt!==false
     ||!historicalHeadClearanceReassessment(wire.raw,oldHead.evidence))continue;
    let assessment=reading.assessment;
    if(neighbors){const n=readSourceNeighborQualityBundle(assessment,neighbors);if(!n.ok||n.sourceNeighbors.disposition!=='pass')continue;assessment=n.assessment.raw;}
    const bundle=readBoundSubjectQualityEnvelopeV2(assessment,{version:SUBJECT_QUALITY_BUNDLE_VERSION,subjectPolicy:SUBJECT_POLICY_V2,photoSha256:upgrade.photoSha256,planSha256:subjectPlanSha256(plan)});if(!bundle)continue;
    const quality=parseVisualSceneVerdicts(bundle.quality,[hide.id],scene.sceneVersion,'ready-only/v1',PLAYER_REVIEW_MODE,CURRENT_QUALITY_READER)[hide.id];
    const subject=readSubjectAnswerV2(bundle.subject,{hideId:hide.id,ageYears:upgrade.ageYears,plan}),continuity=readLocalPatchBodyContinuity(reading.continuity,[hide.id+':people'],CURRENT_CONTINUITY_READER[visualVersion]);
    if(localPatchQualityDisposition(quality??null,scene.sceneVersion,{hideId:hide.id,reader:CURRENT_QUALITY_READER}).state!=='acceptable'||!subject.ok||subject.disposition!=='pass'
     ||localPatchRuntimeContinuityVerdict(continuity).disposition!=='pass')continue;
    const auditId='aud_normal_head_'+hash([grant.authorizationSha256,row.id,imageSha256,geometrySha256]).slice(0,40);
    if(await c.db.auditLog.findUnique({where:{id:auditId}}))continue;
    const marker=retainedNormalHeadSchema.parse({version:RETAINED_NORMAL_HEAD_VERSION,auditId,authorizationSha256:grant.authorizationSha256,
     sourceRequestKey:sourceKey,sourceFingerprint:raw.kept.operationFingerprint,sourcePayloadSha256:raw.kept.payloadSha256,normalizedRawSha256:sha256Bytes(raw.normalized),
     shippingSha256:imageSha256,geometrySha256,identitySha256:authority.state.identitySha256,originalAttempt,sourceReviewRequestKey:key,sourceReviewFingerprint:kept.operationFingerprint});
    const changed=await c.db.$transaction(async tx=>{
     await fenceLocalPatchImages(tx,gameId);await fence(tx);
     const scoped={...c,db:tx as Container['db'],storage:new DbStorage(tx)},active=await readQaCompletionCapacity(scoped,worldId),current=await tx.targetVariantAsset.findUniqueOrThrow({where:{id:row.id}});
     const game=await tx.game.findUniqueOrThrow({where:{id:gameId}}),ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId),owned=await tx.asset.findUniqueOrThrow({where:{id:asset.id}}),blob=await tx.fileBlob.findUnique({where:{key:asset.storagePath}});
     if(!active||active.authorizationSha256!==grant.authorizationSha256||game.status!=='TARGETS_GENERATING'||game.configJson||game.readyAt||current.judgeJson!==row.judgeJson||current.assetId!==row.assetId
      ||current.attempts!==row.attempts||current.status!==row.status||current.costCents!==row.costCents||!ledger||ledger.revision!==stored.revision||hash(ledger.snapshot)!==hash(stored.snapshot)
      ||owned.deletedAt||owned.status!=='READY'||owned.ownerId!==asset.ownerId||owned.providerRequestId!==gameId||owned.type!=='TARGET_SPRITE'||owned.visibility!=='GAME'||owned.storagePath!==asset.storagePath
      ||!blob||sha256Bytes(Buffer.from(blob.data))!==imageSha256)return false;
     const lockedRaw=await readSettledTargetRaw(tx,gameId,sourceKey),lockedKept=await new PrismaRetainedPurchaseStore(tx).get(worldId,key),lockedRound=await backgroundRoundOfKey(tx,gameId,worldId,key);
     if(lockedRaw.kept.payloadSha256!==raw.kept.payloadSha256||sha256Bytes(lockedRaw.normalized)!==marker.normalizedRawSha256||!lockedKept||!lockedKept.bytes.equals(kept.bytes)
      ||!lockedRound||!roundAnswered(lockedRound)||hash(lockedRound.intent)!==hash(round.intent))return false;
     const cas=await tx.worldBudgetLedger.updateMany({where:{worldId,revision:stored.revision},data:{revision:{increment:1}}});if(cas.count!==1)return false;
     await tx.auditLog.create({data:{id:auditId,actorType:'SYSTEM',action:RETAINED_NORMAL_HEAD_ACTION,entityType:'Game',entityId:gameId,metaJson:JSON.stringify({
      version:RETAINED_NORMAL_HEAD_VERSION,authorizationSha256:grant.authorizationSha256,variantId:row.id,retainedNormalHead:marker,candidateSha256:imageSha256,sourceAssetId:asset.id,
      previousJudgeJson:row.judgeJson,previousAssetId:row.assetId,previousGeometry:{rectJson:row.rectJson,hitRectJson:row.hitRectJson,headAnchorJson:row.headAnchorJson},previousCostCents:row.costCents,
      oldReviewRequestKey:key,oldReviewPayloadSha256:kept.payloadSha256,providerCalls:0,attemptsPreserved:true,cyclesPreserved:true,requestsPreserved:true})}});
     const receipt={...previous,...normal,headPolicyVersion:TARGET_HEAD_VISIBLE_VERSION,retainedNormalHead:marker,headSourceVersion:undefined,legacyHeadRecovery:undefined,
      authoredRecovery:undefined,crownReturn:undefined,propJoinCorrection:undefined,recoveryComposition:undefined,compositionSource:undefined,
      seam:composed.report,compositionPermission:composed.compositionPermission,geometryBasis:measured.basis,measuredFraction:Number(measured.measuredFraction.toFixed(4)),
      boardReview:undefined,dualContinuityCheckpoint:undefined,verdict:null,wireFault:null,renderFault:null,qualityDisposition:undefined,reviewState:'pending-board-review'};
     await tx.targetVariantAsset.update({where:{id:row.id},data:{status:'GENERATED',assetId:asset.id,...geometry,lastError:null,judgeJson:JSON.stringify(receipt)}});
     await tx.targetInstance.update({where:{id:row.targetInstanceId},data:{status:'GENERATED',spriteKind:'image',spriteAssetId:asset.id}});
     await tx.gameScene.update({where:{id:scene.id},data:{generationStatus:'NEEDS_REGENERATION',configJson:null}});return true;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
    if(changed)return true;
   }
  }
 }
 return false;
}

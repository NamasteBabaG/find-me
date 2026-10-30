import { Prisma } from '@prisma/client';
import type { Container } from '../container';
import { DbStorage } from '../../infra/storage/db';
import { PrismaWorldBudgetStore } from '../../infra/db/prisma-world-budget-store';
import { qaCompletionCapacityId,qaCompletionReceiptSchema,QA_COMPLETION_CAP } from '../../domain/generation/qa-completion-capacity';
import { qaCompletionUnknownsPreserved } from '../../domain/generation/qa-completion-recovery';
import { visibleHeadPolicyRecoveryCandidate,visibleHeadPolicyMarker,VISIBLE_HEAD_RECOVERY_VERSION } from '../../domain/generation/visible-head-policy-recovery';
import { readQaCompletionCapacity } from './qa-completion-capacity';
import { resolveLocalPatchBoardsForGame } from './source-placement-release';
import { localPatchPublicationGeometryHash } from './local-patch-publication-policy';
import { singleReviewHeadEvidence,singleReviewHeadEvidenceMatches } from './single-review-head-evidence';
import { authoredLocalPatchReviewBinding,authoredLocalPatchRecoveryEvidenceMatches } from './local-patch-authored-return';
import { SELF_REPAIR_COMPOSITION_VERSION,selfRepairDecisionSchema } from '../../domain/scene/local-patch-self-repair';
import { verifiedDualStage,qualityStageRaw,qualityStageReader,readContinuityStage,subjectStageRaw,type DualReviewProof } from './local-patch-dual-evidence';
import { parseVisualSceneVerdicts } from './visual-review';
import { localPatchQualityDisposition } from './local-patch-judge';
import { PLAYER_REVIEW_MODE } from './local-patch-player-review';
import { localPatchRuntimeContinuityVerdict } from '../../domain/scene/local-patch-body-continuity';
import { readSubjectAnswerV2,SUBJECT_POLICY_V2 } from '../../domain/generation/subject-policy';
import { subjectPlanOfHide } from './subject-enrollment';
import { backgroundRoundOfKey,roundAnswered } from './continuity-background';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { auditWorldBudget } from './world-budget';
import { sha256Bytes } from './fixed-sprite';

export const VISIBLE_HEAD_RECOVERY_ACTION='local-patch:visible-head-policy-corrected';
const hash=(value:unknown)=>sha256Bytes(Buffer.from(JSON.stringify(value)));
type Candidate={id:string;status:string;assetId:string|null;attempts:number;judgeJson:string|null};

/** Free, one-candidate source-bound transition; never a verdict or a purchase.
 * Historical paid questions and every financial/cycle field stay immutable.
 * Publication still needs a fresh normal MEDIUM answer with ALL roles passing. */
export async function reconcileVisibleHeadPolicy(c:Container,gameId:string,rows:readonly Candidate[],fence:(tx:Prisma.TransactionClient)=>Promise<void>){
 const candidates=rows.filter(visibleHeadPolicyRecoveryCandidate);if(!candidates.length)return false;
 const worldId=gameId+':board-wizard',grant=await readQaCompletionCapacity(c,worldId);if(!grant)return false;
 const authority=qaCompletionReceiptSchema.parse(JSON.parse((await c.db.auditLog.findUniqueOrThrow({where:{id:qaCompletionCapacityId(gameId)}})).metaJson!));
 const stored=await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldId);if(!stored||authority.authorizationSha256!==grant.authorizationSha256)return false;
 const audit=auditWorldBudget(stored.snapshot,QA_COMPLETION_CAP);
 if(audit.held||audit.overCapMicroUsd||audit.pendingRequestKeys.length||audit.conflictRequestKeys.length||audit.overrunRequestKeys.length
   ||!qaCompletionUnknownsPreserved(stored.snapshot.requests,authority.unknowns))return false;
 const context=await resolveLocalPatchBoardsForGame(c.db,gameId,authority.state.sceneVersion);
 for(const candidate of candidates){
  const row=await c.db.targetVariantAsset.findUniqueOrThrow({where:{id:candidate.id},include:{targetInstance:{include:{gameScene:true}}}});
  if(!visibleHeadPolicyRecoveryCandidate(row)||row.targetInstance.gameScene.gameId!==gameId)continue;
  const j=JSON.parse(row.judgeJson!),proof=j.boardReview.dual as DualReviewProof,scene=row.targetInstance.gameScene;
  const board=context.boards.find(b=>b.board===scene.sceneSlug),hide=board?.hides.find(h=>h.targetId===row.targetInstance.targetId);
  if(!hide||j.hide!==hide.id||j.pose!==hide.pose||scene.sceneVersion!==authority.state.sceneVersion||proof.single!=='single-sol-medium/v1'
    ||proof.hideId!==hide.id||proof.imageSha256!==j.judgedSha256||proof.geometrySha256!==j.geometrySha256||proof.identitySha256!==authority.state.identitySha256
    ||j.geometrySha256!==localPatchPublicationGeometryHash(row)||!proof.continuity||!proof.subject)continue;
  if(j.compositionVersion===SELF_REPAIR_COMPOSITION_VERSION&&(j.selfRepair?.phase!=='awaiting-review'||!selfRepairDecisionSchema.safeParse(j.selfRepair.decision).success))continue;
  if(j.authoredRecovery!==undefined&&!await authoredLocalPatchRecoveryEvidenceMatches(c.db,{gameId,board:board!,hide,sceneVersion:scene.sceneVersion,
    receipt:j,placementContext:context,promptVersion:row.promptVersion}))continue;
  // Read every other original role as paid, without substituting a new head
  // version into the old answer. This selects a re-review, never a PASS.
  const reader=qualityStageReader(proof.quality),plan=subjectPlanOfHide(hide.id,scene.sceneVersion);
  const base=reader?parseVisualSceneVerdicts(qualityStageRaw(proof.quality),[hide.id],scene.sceneVersion,'ready-only/v1',PLAYER_REVIEW_MODE,reader)[hide.id]:null;
  const continuityReading=readContinuityStage(proof.continuity,hide.id,proof.version);
  const subjectReading=plan&&proof.subject.subjectPolicy===SUBJECT_POLICY_V2?readSubjectAnswerV2(subjectStageRaw(proof.subject),{hideId:hide.id,ageYears:authority.state.ageYears,plan}):null;
  if(!reader||localPatchQualityDisposition(base??null,scene.sceneVersion,{hideId:hide.id,reader}).state!=='acceptable'
    ||!continuityReading||localPatchRuntimeContinuityVerdict(continuityReading).disposition!=='pass'||!subjectReading?.ok||subjectReading.disposition!=='pass')continue;
  const asset=await c.db.asset.findUniqueOrThrow({where:{id:row.assetId!}});
  if(asset.deletedAt||asset.status!=='READY'||asset.ownerId!==authority.state.ownerId||asset.providerRequestId!==gameId||asset.type!=='TARGET_SPRITE'||asset.visibility!=='GAME')continue;
  const shipping=await c.storage.get(asset.storagePath);if(sha256Bytes(shipping)!==j.judgedSha256)continue;
  const binding={gameId,hideId:hide.id,variantId:row.id,imageSha256:j.judgedSha256,geometrySha256:j.geometrySha256,
    identitySha256:authority.state.identitySha256,sceneVersion:scene.sceneVersion,attempts:row.attempts,judgeJson:row.judgeJson};
  if(!await singleReviewHeadEvidenceMatches(c.db,binding,proof.quality.headEvidence))continue;
  const options={allowSingle:true,authoredReviewBinding:authoredLocalPatchReviewBinding({...binding,authoredReturn:proof.authoredReturn,...(proof.authoredRecovery?{authoredRecovery:proof.authoredRecovery}:{})})};
  const paid=await verifiedDualStage(c.db,worldId,proof.quality,'scene-quality',options);
  const continuity=await verifiedDualStage(c.db,worldId,proof.continuity,'head-continuity',options),subject=await verifiedDualStage(c.db,worldId,proof.subject,'scene-quality',options);
  if(!paid||!continuity||!subject||!paid.bytes.equals(continuity.bytes)||!paid.bytes.equals(subject.bytes))continue;
  const round=await backgroundRoundOfKey(c.db,gameId,worldId,proof.quality.requestKey),b=round?.intent?.binding;
  if(!round||!roundAnswered(round)||round.intent?.fingerprint!==proof.quality.fingerprint||b?.variantId!==row.id||b.hideId!==hide.id
    ||b.imageSha256!==j.judgedSha256||b.geometrySha256!==j.geometrySha256||b.identitySha256!==authority.state.identitySha256)continue;
  const corrected=await singleReviewHeadEvidence(c.db,{gameId,hide,attempt:row.attempts,receipt:{...j,...visibleHeadPolicyMarker},shipping,
    geometrySha256:j.geometrySha256,identitySha256:authority.state.identitySha256});
  const id='aud_visible_head_'+hash([grant.authorizationSha256,row.id,row.judgeJson,VISIBLE_HEAD_RECOVERY_VERSION]).slice(0,40);
  const changed=await c.db.$transaction(async tx=>{
   await fenceLocalPatchImages(tx,gameId);await fence(tx);
   const scoped={...c,db:tx as Container['db'],storage:new DbStorage(tx)},active=await readQaCompletionCapacity(scoped,worldId);
   const current=await tx.targetVariantAsset.findUniqueOrThrow({where:{id:row.id}}),game=await tx.game.findUniqueOrThrow({where:{id:gameId}});
   const ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId),blob=await tx.fileBlob.findUnique({where:{key:asset.storagePath}}),owned=await tx.asset.findUniqueOrThrow({where:{id:asset.id}});
   if(!active||active.authorizationSha256!==grant.authorizationSha256||game.status!=='TARGETS_GENERATING'||game.configJson||game.readyAt
     ||current.judgeJson!==row.judgeJson||current.assetId!==row.assetId||current.status!==row.status||current.attempts!==row.attempts||current.costCents!==row.costCents
     ||!ledger||ledger.revision!==stored.revision||hash(ledger.snapshot)!==hash(stored.snapshot)||!blob||sha256Bytes(Buffer.from(blob.data))!==j.judgedSha256
     ||owned.deletedAt||owned.status!=='READY'||owned.type!=='TARGET_SPRITE'||owned.visibility!=='GAME'||owned.ownerId!==asset.ownerId||owned.providerRequestId!==gameId||owned.storagePath!==asset.storagePath)return false;
   // Re-read all paid RAW/geometry bindings under the same source/ledger fence.
   if(!await singleReviewHeadEvidenceMatches(tx,binding,proof.quality.headEvidence))return false;
   const lockedPaid=await verifiedDualStage(tx,worldId,proof.quality,'scene-quality',options);
   const lockedRound=await backgroundRoundOfKey(tx,gameId,worldId,proof.quality.requestKey);
   if(!lockedPaid||!lockedPaid.bytes.equals(paid.bytes)||!lockedRound||!roundAnswered(lockedRound)||hash(lockedRound.intent)!==hash(round.intent))return false;
   const locked=await singleReviewHeadEvidence(tx,{gameId,hide,attempt:row.attempts,receipt:{...j,...visibleHeadPolicyMarker},shipping:Buffer.from(blob.data),geometrySha256:j.geometrySha256,identitySha256:authority.state.identitySha256});
   if(hash(locked.evidence)!==hash(corrected.evidence))return false;
   const cas=await tx.worldBudgetLedger.updateMany({where:{worldId,revision:stored.revision},data:{revision:{increment:1}}});if(cas.count!==1)return false;
   await tx.auditLog.create({data:{id,actorType:'SYSTEM',action:VISIBLE_HEAD_RECOVERY_ACTION,entityType:'Game',entityId:gameId,
    metaJson:JSON.stringify({version:VISIBLE_HEAD_RECOVERY_VERSION,authorizationSha256:grant.authorizationSha256,variantId:row.id,previousJudgeJson:row.judgeJson,
     previousAssetId:row.assetId,previousCostCents:row.costCents,correctedHead:corrected.evidence,providerCalls:0,attemptsPreserved:true,cyclesPreserved:true,requestsPreserved:true})}});
   const receipt={...j,...visibleHeadPolicyMarker,visibleHeadRecovery:{version:VISIBLE_HEAD_RECOVERY_VERSION,previousReceiptSha256:hash(row.judgeJson),authorizationSha256:grant.authorizationSha256},
    boardReview:undefined,dualContinuityCheckpoint:undefined,verdict:null,wireFault:null,qualityDisposition:undefined,reviewState:'pending-board-review'};
   await tx.targetVariantAsset.update({where:{id:row.id},data:{status:'GENERATED',lastError:null,judgeJson:JSON.stringify(receipt)}});
   await tx.targetInstance.update({where:{id:row.targetInstanceId},data:{status:'GENERATED',spriteKind:'image',spriteAssetId:row.assetId}});
   await tx.gameScene.update({where:{id:scene.id},data:{generationStatus:'NEEDS_REGENERATION',configJson:null}});
   return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  if(changed)return true;
 }
 return false;
}

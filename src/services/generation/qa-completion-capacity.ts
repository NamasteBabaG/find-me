import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { QA_COMPLETION_CAPACITY, QA_COMPLETION_CAP, qaCompletionCapacityId, qaCompletionStateSchema,
  qaCompletionPlanSchema, qaCompletionReceiptSchema, type QaCompletionReceipt } from "../../domain/generation/qa-completion-capacity";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";
import { singleMediumReviewPolicyOf } from "./single-medium-policy";
import { subjectUpgradeOf } from "./subject-enrollment";
import { identityRevisionPending } from "./identity-source-revision-state";
import { identityGateReceiptOf, identityReceiptReadyForPublication } from "./board-wizard-identity-gate";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { backgroundReviewWaiting } from "./continuity-background";
import { auditWorldBudget } from "./world-budget";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { applyBoardWizardBudgetCap, type BoardWizardBudgetGrant } from "./board-wizard-budget";
import { isGameStatus, isPlayable } from "../../domain/order-state";

const ACTION = "generation:qa-medium-completion-capacity";
const EXHAUSTED = "local-patch:recovery-exhausted";
function demand(value: unknown, message: string): asserts value { if (!value) throw Error("QA_COMPLETION: " + message); }
const qualified = (c: Container) => env().APP_ENV === "qa" && c.storage?.id === "db";

/** Cheap live binding, also valid after the ordinary successful source purge.
 * The grant is withdrawn by refund, deletion, ownership or canonical changes. */
async function stateOf(c: Container, gameId: string) {
  demand(qualified(c) && /^[A-Za-z0-9_-]{1,160}$/.test(gameId), "Qualified QA world required");
  const [game,pin,enrollment]=await Promise.all([
    c.db.game.findUnique({where:{id:gameId},include:{childProfile:true,orders:true,scenes:{orderBy:{orderIndex:"asc"}}}}),
    singleMediumReviewPolicyOf(c.db,gameId),subjectUpgradeOf(c.db,gameId),
  ]);
  const child = game?.childProfile;
  demand(game && pin && enrollment && child && !game.deletedAt && game.status!=="DELETED" && !child.deletedAt
    && game.styleVersion==="local-patch-world-v1" && game.ownerId===enrollment.ownerId && child.ownerId===game.ownerId
    && child.id===game.childProfileId && child.identityAssetId===enrollment.identityAssetId && child.avatarAssetId
    && child.ageYears===enrollment.ageYears && pin.identitySha256===enrollment.identitySha256
    && game.scenes.length===9 && game.scenes.every((s,i)=>s.sceneVersion===pin.sceneVersion&&s.orderIndex===i)
    && new Set(game.scenes.map(s=>s.sceneSlug)).size===9 && !await identityRevisionPending(c.db,gameId), "Original complete MEDIUM source world required");
  const orders=game.orders.filter(o=>o.userId===game.ownerId&&o.paymentStatus==="PAID"&&o.paidAt&&!o.refundedAt);
  demand(orders.length>0&&!game.orders.some(o=>o.paymentStatus==="REFUNDED"||o.refundedAt), "Verified original payment required");
  const [identity,avatar,review,context]=await Promise.all([
    c.db.asset.findUniqueOrThrow({where:{id:child.identityAssetId}}),c.db.asset.findUniqueOrThrow({where:{id:child.avatarAssetId}}),
    identityGateReceiptOf(c.db,child.identityAssetId),resolveLocalPatchBoardsForGame(c.db,gameId,pin.sceneVersion),
  ]);
  demand([identity,avatar].every(a=>a.ownerId===game.ownerId&&a.status==="READY"&&!a.deletedAt)
    && identity.type==="IDENTITY_SHEET"&&identity.visibility==="PRIVATE"&&avatar.type==="AVATAR"&&avatar.visibility==="GAME"
    && review&&identityReceiptReadyForPublication(review,pin.sceneVersion)&&review.sheetSha256===enrollment.identitySha256
    && review.provenance.photoAssetId===enrollment.photoAssetId&&review.provenance.photoSha256===enrollment.photoSha256
    && review.provenance.ageYears===child.ageYears&&hash(review.provenance.crop)===hash(child.photoCropJson?JSON.parse(child.photoCropJson):null), "Original owned identity approval required");
  if(child.originalPhotoAssetId===enrollment.photoAssetId){
    const photo=await c.db.asset.findUnique({where:{id:enrollment.photoAssetId}});
    demand(photo&&photo.ownerId===game.ownerId&&photo.visibility==="PRIVATE"&&photo.status==="READY"&&!photo.deletedAt,"Live original private source required");
  }else{
    demand(child.originalPhotoAssetId===null&&isGameStatus(game.status)&&isPlayable(game.status)&&game.configJson, "Original private source required");
    const purges=await c.db.auditLog.findMany({where:{actorType:"SYSTEM",action:"local-patch:photo-purged-after-approval",entityType:"Asset",entityId:identity.id},select:{metaJson:true}});
    demand(purges.some(p=>JSON.parse(p.metaJson??"null")?.photoAssetId===enrollment.photoAssetId), "Verified successful source purge required");
  }
  demand(context.release&&context.manifestSha256,"Original pinned source family required");
  const state=qaCompletionStateSchema.parse({gameId,worldId:gameId+":board-wizard",ownerId:game.ownerId,childId:child.id,sceneVersion:pin.sceneVersion,
    scenesSha256:hash(game.scenes.map(s=>({id:s.id,slug:s.sceneSlug,version:s.sceneVersion,order:s.orderIndex}))),familySha256:hash({pin:context.release,manifest:context.manifestSha256}),
    paymentSha256:hash(orders.map(o=>({id:o.id,userId:o.userId,provider:o.provider,paymentStatus:o.paymentStatus,paidAt:o.paidAt,refundedAt:o.refundedAt})).sort((a,b)=>a.id.localeCompare(b.id))),
    reviewAuthoritySha256:pin.authorizationSha256,enrollmentSha256:hash(enrollment),identityReviewSha256:hash(review),
    identityAssetId:identity.id,identitySha256:enrollment.identitySha256,avatarAssetId:avatar.id,photoAssetId:enrollment.photoAssetId,
    photoSha256:enrollment.photoSha256,ageYears:child.ageYears,cropSha256:hash(child.photoCropJson?JSON.parse(child.photoCropJson):null)});
  return {game,child,identity,avatar,state};
}

async function receiptOf(c: Container, gameId: string): Promise<QaCompletionReceipt|null> {
  const row=await c.db.auditLog.findUnique({where:{id:qaCompletionCapacityId(gameId)}});if(!row)return null;
  const receipt=qaCompletionReceiptSchema.parse(JSON.parse(row.metaJson??"null")),{authorizationSha256,...body}=receipt;
  demand(row.actorType==="ADMIN"&&row.actorId===receipt.operatorId&&receipt.operatorId===receipt.state.ownerId
    &&row.action===ACTION&&row.entityType==="Game"&&row.entityId===gameId&&receipt.state.gameId===gameId
    &&receipt.state.worldId===gameId+":board-wizard"&&row.metaJson===JSON.stringify(receipt)&&authorizationSha256===hash(body), "Invalid immutable completion authority");
  const {planSha256:_plan,operatorId:_operator,ownerAuthorizationSha256:_owner,authorizedAt:_at,automaticExtension:_extension,
    requestsPreserved:_requests,attemptsPreserved:_attempts,qualityPolicyPreserved:_quality,...binding}=body;
  demand(receipt.planSha256===hash(qaCompletionPlanSchema.parse(binding)), "Completion plan binding changed");
  return receipt;
}

export async function readQaCompletionCapacity(c: Container, worldId: string): Promise<BoardWizardBudgetGrant|null> {
  if(!qualified(c)||!/^[A-Za-z0-9_-]{1,160}:board-wizard$/.test(worldId))return null;
  const gameId=worldId.slice(0,-":board-wizard".length),receipt=await receiptOf(c,gameId);if(!receipt)return null;
  let live;try{live=await stateOf(c,gameId);}catch{return null;}
  return JSON.stringify(live.state)===JSON.stringify(receipt.state)
    ?{worldId,capMicroUsd:QA_COMPLETION_CAP,authorizationSha256:receipt.authorizationSha256}:null;
}

/** No purchases or writes: freeze the exact paid unfinished world, hold and
 * financial history the owner administrator will authorize. */
export async function planQaCompletionCapacity(c: Container, gameId: string) {
  demand(!await receiptOf(c,gameId), "Completion authority already exists");
  const live=await stateOf(c,gameId),{game,child,state}=live;
  demand(game.status==="TARGETS_GENERATING"&&!game.configJson&&!game.readyAt&&child.originalPhotoAssetId===state.photoAssetId, "Unfinished original source required");
  const photo=await c.db.asset.findUniqueOrThrow({where:{id:state.photoAssetId}});
  demand(photo.ownerId===state.ownerId&&photo.visibility==="PRIVATE"&&photo.status==="READY"&&!photo.deletedAt
    &&sha256Bytes(await c.storage.get(photo.storagePath))===state.photoSha256
    &&sha256Bytes(await c.storage.get(live.identity.storagePath))===state.identitySha256, "Exact live source pixels required");
  const job=await c.db.generationJob.findUniqueOrThrow({where:{id:"job_"+gameId}});
  demand(job.status==="FAILED"&&[EXHAUSTED,"local-patch:needs-release"].includes(job.currentStep??""), "Explicit original recovery hold required");
  demand(!(await backgroundReviewWaiting(c.db,gameId,{inFlightOnly:true})).size,"Existing provider work must settle first");
  const stored=await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(state.worldId);
  demand(stored&&stored.revision<WORLD_BUDGET_LEDGER_MAX_REVISION,"Safe existing ledger required");
  const audit=applyBoardWizardBudgetCap(auditWorldBudget(stored.snapshot));
  demand(audit.committedMicroUsd>0&&!audit.overCapMicroUsd&&!audit.pendingRequestKeys.length&&!audit.conflictRequestKeys.length&&!audit.overrunRequestKeys.length, "Reconcile pending or conflicting purchases first");
  const rows=await c.db.targetVariantAsset.findMany({where:{variant:"A",targetInstance:{gameScene:{gameId}}},orderBy:{id:"asc"}});
  demand(rows.length>0,"Retained work required");
  const binding=qaCompletionPlanSchema.parse({version:QA_COMPLETION_CAPACITY,state,baseCapMicroUsd:4_000_000,capMicroUsd:QA_COMPLETION_CAP,
    jobId:job.id,jobSha256:hash(job),ledgerRevision:stored.revision,ledgerSha256:hash(stored.snapshot),rowsSha256:hash(rows),
    committedMicroUsd:audit.committedMicroUsd,reservedMicroUsd:audit.reservedMicroUsd,
    unknowns:stored.snapshot.requests.filter(r=>r.state==="unknown").map(r=>({requestKey:r.requestKey,operationFingerprint:r.operationFingerprint,reserveMicroUsd:r.reserveMicroUsd})).sort((a,b)=>a.requestKey.localeCompare(b.requestKey))});
  return {binding,planSha256:hash(binding),job};
}

/** Capacity and one requeue only. No request, image, verdict, attempt or
 * UNKNOWN reserve changes; the ordinary job still diagnoses and qualifies art. */
export async function authorizeQaCompletionCapacity(c: Container,input:{gameId:string;operatorId:string;expectedPlanSha256:string;ownerAuthorizationSha256:string}) {
  demand(qualified(c)&&/^[a-f0-9]{64}$/.test(input.expectedPlanSha256)&&/^[a-f0-9]{64}$/.test(input.ownerAuthorizationSha256),"Bound owner authorization required");
  const user=await c.db.user.findUnique({where:{id:input.operatorId}});
  demand(user&&c.adminEmails?.some(email=>email.trim().toLowerCase()===user.email.trim().toLowerCase()),"Owner administrator required");
  const previous=await receiptOf(c,input.gameId);
  if(previous){demand(previous.operatorId===input.operatorId&&previous.planSha256===input.expectedPlanSha256
    &&previous.ownerAuthorizationSha256===input.ownerAuthorizationSha256&&await readQaCompletionCapacity(c,previous.state.worldId),"Existing authorization differs");return previous;}
  const plan=await planQaCompletionCapacity(c,input.gameId);
  demand(plan.planSha256===input.expectedPlanSha256&&plan.binding.state.ownerId===input.operatorId,"Owner or completion plan changed");
  return c.db.$transaction(async tx=>{
    await fenceLocalPatchImages(tx,input.gameId);
    const scoped={...c,db:tx as Container["db"]},fresh=await planQaCompletionCapacity(scoped,input.gameId);
    demand(fresh.planSha256===plan.planSha256,"Concurrent completion state changed");
    const body={...fresh.binding,planSha256:fresh.planSha256,operatorId:input.operatorId,ownerAuthorizationSha256:input.ownerAuthorizationSha256,
      authorizedAt:new Date().toISOString(),automaticExtension:false as const,requestsPreserved:true as const,attemptsPreserved:true as const,qualityPolicyPreserved:true as const};
    const receipt=qaCompletionReceiptSchema.parse({...body,authorizationSha256:hash(body)});
    const ledger=await tx.worldBudgetLedger.updateMany({where:{worldId:receipt.state.worldId,revision:receipt.ledgerRevision},data:{revision:{increment:1}}});
    const job=await tx.generationJob.updateMany({where:{id:receipt.jobId,status:"FAILED",currentStep:fresh.job.currentStep,attempts:fresh.job.attempts,
      updatedAt:fresh.job.updatedAt,lastError:fresh.job.lastError},data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
    demand(ledger.count===1&&job.count===1,"Completion hold changed before authorization");
    await tx.auditLog.create({data:{id:qaCompletionCapacityId(input.gameId),actorType:"ADMIN",actorId:input.operatorId,action:ACTION,entityType:"Game",entityId:input.gameId,metaJson:JSON.stringify(receipt)}});
    return receipt;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}

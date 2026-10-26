import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../../lib/env";
import { BOUND_SUBJECT_QUALITY_ENVELOPE_READER } from "../../domain/generation/bound-subject-quality-envelope";
import type { Container } from "../container";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import { localPatchBoundEnvelopeUndecided } from "./local-patch-dual-evidence";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { singleMediumReviewPolicyOf } from "./single-medium-policy";
import { identityRevisionPending } from "./identity-source-revision-state";

const EXHAUSTED = "local-patch:recovery-exhausted";
const ACTION = "generation:bound-envelope-reconciliation";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
type Reader = Prisma.TransactionClient;
async function originalWorld(db: Reader, gameId: string) {
  const game = await db.game.findUnique({where:{id:gameId},include:{orders:true,scenes:true}});
  const pin = await singleMediumReviewPolicyOf(db,gameId);
  if(!game || !pin || game.deletedAt || game.status!=="TARGETS_GENERATING" || game.configJson || game.readyAt
    || game.styleVersion!=="local-patch-world-v1" || game.scenes.length!==9
    || !game.scenes.every(s=>s.sceneVersion===pin.sceneVersion)
    || !game.orders.some(o=>o.userId===game.ownerId&&o.paymentStatus==="PAID"&&o.paidAt&&!o.refundedAt)
    || game.orders.some(o=>o.paymentStatus==="REFUNDED"||o.refundedAt) || await identityRevisionPending(db,gameId)) return null;
  return {game,pin};
}

/** Read-only, including the rebuilt question and original settled answer. No
 * reservation, dispatch, settlement or business approval is performed here. */
async function eligible(c:Container,gameId:string) {
  if(env().APP_ENV!=="qa"||c.storage?.id!=="db")return null;
  const original=await originalWorld(c.db,gameId);if(!original)return null;
  const job=await c.db.generationJob.findUnique({where:{id:"job_"+gameId}});
  // The typed exhausted step covers both spent repair/evidence cycles and
  // budget exhaustion. Its display wording is not authority for a free read.
  // Every paid-answer, identity, image, budget and once-only fence below still applies.
  if(!job||job.status!=="FAILED"||job.currentStep!==EXHAUSTED
    ||!job.lastError?.startsWith("local-patch: "))return null;
  const budget=await boardWizardBudgetOf(c).audit(gameId+":board-wizard");
  // UNKNOWN money remains fully reserved. Free reconciliation grants no capacity.
  if(budget.capMicroUsd!==4000000||budget.overCapMicroUsd||budget.conflictRequestKeys.length||budget.overrunRequestKeys.length)return null;
  const ledger=await c.db.worldBudgetLedger.findUnique({where:{worldId:gameId+":board-wizard"}});if(!ledger)return null;
  const rows=await c.db.targetVariantAsset.findMany({where:{variant:"A",provider:"local-patch",status:"FAILED",
    targetInstance:{gameScene:{gameId}}},include:{targetInstance:{select:{gameSceneId:true}}},orderBy:{id:"asc"}});
  for(const row of rows){
    if(!localPatchBoundEnvelopeUndecided(row))continue;
    const id="aud_bound_envelope_"+hash({gameId,rowId:row.id,receipt:hash(row.judgeJson),reader:BOUND_SUBJECT_QUALITY_ENVELOPE_READER}).slice(0,40);
    if(await c.db.auditLog.findUnique({where:{id}}))continue;
    const {prepareLocalPatchBoardReview}=await import("./local-patch-board-review");
    const {buyDualLocalPatchReview}=await import("./local-patch-dual-review");
    const hideId=JSON.parse(row.judgeJson!).hide as string;
    const prepared=await prepareLocalPatchBoardReview(c,{gameId,sceneId:row.targetInstance.gameSceneId},{},
      {decideRetained:true,playerReview:true,skipApprovedEvidence:true,onlyHideId:hideId});
    if(!prepared.ready)continue;
    const answer=await buyDualLocalPatchReview(c,prepared,{fence:async()=>{throw Error("BOUND_ENVELOPE: read-only preflight cannot write");}},undefined,{decideRetained:true});
    if(answer.kind!=="reviewed"||!answer.salvaged||answer.proof.quality.envelopeReader!==BOUND_SUBJECT_QUALITY_ENVELOPE_READER)continue;
    return {original,job,row,ledger,id};
  }
  return null;
}

/** A normal cron can select exactly this free, verifiable unfinished adoption.
 * A forged, foreign, unbound or already consumed answer never gains a turn. */
export async function nextBoundEnvelopeReconciliation(c:Container):Promise<string|null>{
  if(env().APP_ENV!=="qa"||c.storage?.id!=="db")return null;
  const jobs=await c.db.generationJob.findMany({where:{status:"FAILED",currentStep:EXHAUSTED,
    game:{status:"TARGETS_GENERATING",deletedAt:null,styleVersion:"local-patch-world-v1"}},orderBy:{updatedAt:"asc"},select:{gameId:true}});
  for(const job of jobs)try{if(await eligible(c,job.gameId))return job.gameId;}catch{/* One invalid receipt cannot starve other worlds. */}
  return null;
}

/** Compared once against the original hold and receipt. Requeue only; the
 * ordinary fenced board review must still make every semantic decision. */
export async function resumeBoundEnvelopeReconciliation(c:Container,gameId:string):Promise<boolean>{
  const candidate=await eligible(c,gameId);if(!candidate)return false;
  const {job,row,ledger,id,original}=candidate;
  return c.db.$transaction(async tx=>{
    await fenceLocalPatchImages(tx,gameId);
    const currentWorld=await originalWorld(tx,gameId),currentRow=await tx.targetVariantAsset.findUnique({where:{id:row.id}});
    const currentLedger=await tx.worldBudgetLedger.findUnique({where:{worldId:ledger.worldId}});
    if(!currentWorld||currentWorld.pin.authorizationSha256!==original.pin.authorizationSha256||!currentRow
      ||currentRow.judgeJson!==row.judgeJson||currentRow.assetId!==row.assetId||currentRow.attempts!==row.attempts
      ||!localPatchBoundEnvelopeUndecided(currentRow)||!currentLedger||currentLedger.revision!==ledger.revision
      ||currentLedger.snapshotJson!==ledger.snapshotJson)return false;
    const changed=await tx.generationJob.updateMany({where:{id:job.id,status:job.status,currentStep:job.currentStep,
      attempts:job.attempts,updatedAt:job.updatedAt,lastError:job.lastError},data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
    if(changed.count!==1)return false;
    await tx.auditLog.create({data:{id,actorType:"SYSTEM",action:ACTION,entityType:"Game",entityId:gameId,
      metaJson:JSON.stringify({version:BOUND_SUBJECT_QUALITY_ENVELOPE_READER,kind:"software-wake",rowId:row.id,
        receiptSha256:hash(row.judgeJson),previousHoldSha256:hash(job),ledgerSha256:hash(ledger.snapshotJson),
        attemptsPreserved:true,capPreserved:true,providerCalls:0})}});
    return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
}

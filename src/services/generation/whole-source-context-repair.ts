import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { SOURCE_PLACEMENT_RELEASE } from "../../../content/adventures/source-placement-release";
import { readCollectionArt } from "./collection-art";
import { planWholeSourceContext } from "../../domain/scene/whole-source-context";
import { WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION } from "../../domain/generation/whole-source-context-purchase";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sha256Bytes as sha } from "./fixed-sprite";
import { explorersOperationalPolicyOf } from "./explorers-operational-policy";
import { sourcePlacementReleaseAuditId, resolveLocalPatchBoardsForGame } from "./source-placement-release";
import { singleLowReviewAuthorization } from "./single-low-policy";
import { singleMediumReviewPolicyOf } from "./single-medium-policy";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { sameChargeEvidence } from "./world-budget";
import { hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { readWholeSourceContextPin, wholeSourceContextPinBodySchema, wholeSourceContextPinSchema,
  wholeSourceContextPinId, wholeSourceContextWakeId, wholeSourceContextJobHash, frozenWholeSourceContextHash, wholeSourceContextRowHash, wholeSourceContextRowInvariant,
  wholeSourceContextMarkerFor, wholeSourceContextCandidate, WHOLE_SOURCE_CONTEXT_ACTION, WHOLE_SOURCE_CONTEXT_WAKE_ACTION,
  WHOLE_SOURCE_CONTEXT_REQUIRED_HEADROOM, type WholeSourceContextPin } from "./whole-source-context-pin";

function demand(value: unknown, why: string): asserts value { if (!value) throw Error("WHOLE_SOURCE_CONTEXT: " + why); }
const rowsOf = (db: Prisma.TransactionClient, gameId: string) => db.targetVariantAsset.findMany({
  where: { variant: "A", targetInstance: { gameScene: { gameId } } }, include: { targetInstance: true }, orderBy: { id: "asc" } });
const ordersHash = (orders: readonly { id: string }[]) => frozenWholeSourceContextHash([...orders].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const EXHAUSTED = "local-patch:recovery-exhausted";

/** Read-only preview. All original work remains immutable; this cannot dispatch or change capacity. */
export async function planWholeSourceContextRepair(c: Container, gameId: string, operatorId: string) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Dedicated QA database storage is required");
  demand(!await readWholeSourceContextPin(c.db, gameId), "One source-context exception only");
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: true, orders: true } });
  const child = game.childProfile;
  demand(game.ownerId === operatorId && game.status === "TARGETS_GENERATING" && !game.deletedAt && game.paidAt && !game.readyAt
    && !game.configJson && game.styleVersion === "local-patch-world-v1" && game.scenes.length === 9 && game.scenes.every(s => s.sceneVersion === 12), "Owned incomplete Explorer Journey required");
  demand(child && !child.deletedAt && child.ownerId === operatorId && child.ageYears && child.identityAssetId && child.avatarAssetId && child.originalPhotoAssetId,
    "Original private source, identity and avatar must be available");
  demand(game.orders.some(o => o.userId === operatorId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.refundedAt || o.paymentStatus === "REFUNDED"), "Original verified paid mock order required");
  const birth = await explorersOperationalPolicyOf(c.db, gameId), single = await singleLowReviewAuthorization(c.db, gameId);
  const medium = await singleMediumReviewPolicyOf(c.db, gameId), family = await c.db.auditLog.findUnique({ where: { id: sourcePlacementReleaseAuditId(gameId) } });
  demand(birth && single?.kind === "from-birth" && medium?.sceneVersion === 12 && family && medium.oneUsableAssessmentPerImage,
    "Original four-dollar birth policy and current single MEDIUM policy required");
  const worldId = gameId + ":board-wizard", budget = boardWizardBudgetOf(c), audit = await budget.audit(worldId);
  demand(audit.capMicroUsd === 4000000 && !audit.held && !audit.pendingRequestKeys.length && !audit.overCapMicroUsd
    && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length && audit.remainingMicroUsd >= WHOLE_SOURCE_CONTEXT_REQUIRED_HEADROOM,
    "The complete image and MAIN reservation must fit the original cap with UNKNOWN commitments preserved");
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldId);
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: "job_" + gameId } });
  demand(ledger && job.status === "FAILED" && job.currentStep === EXHAUSTED, "An actual exhausted normal job is required");
  const rows = await rowsOf(c.db, gameId), failed = rows.filter(r => r.status === "FAILED");
  demand(rows.length === 27 && failed.length === 1 && rows.filter(r => r.status === "GENERATED").length === 26,
    "Exactly 26 complete appearances and one concluded failure required");
  const row = failed[0]!, entry = SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === "greatwall-v12-2")!;
  const scene = game.scenes.find(s => s.sceneSlug === "greatwall"), context = await resolveLocalPatchBoardsForGame(c.db, gameId, 12);
  const board = context.boards.find(b => b.board === "greatwall"), hide = board?.hides.find(h => h.id === entry.hideId);
  demand(scene && hide && row.targetInstance.gameSceneId === scene.id && row.targetInstance.targetId === hide.targetId
    && row.provider === "local-patch" && row.attempts === 3 && row.judgeJson, "The exhausted authored Great Wall appearance must be unchanged");
  const receipt = JSON.parse(row.judgeJson);
  demand(receipt.hide === hide.id && receipt.pose === hide.pose && typeof receipt.renderFault === "string" && receipt.renderFault.startsWith("quality-seam:")
    && ["misaligned", "background-rewritten"].includes(receipt.seam?.verdict) && !receipt.wholeSourceContext,
    "A diagnosed failed third join and clipped-source context are required, not a blind retry");
  const plan = planWholeSourceContext(entry.sourceNeighbors!.contract, entry.effective.child);
  const encodedSource=await readCollectionArt(plan.source.art,plan.source.sha256);
  demand(encodedSource&&sha(encodedSource)===plan.source.sha256,"Exact encoded public source must be available before staging");
  const requestKey = hide.id + ":" + hide.pose + ":render:4", store = new PrismaRetainedPurchaseStore(c.db);
  demand(!await budget.readRequest(worldId, requestKey) && !await store.get(worldId, requestKey), "The fourth key must never have been dispatched");
  const paid = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const key = hide.id + ":" + hide.pose + ":render:" + attempt, bill = ledger.snapshot.requests.find(r => r.requestKey === key), kept = await store.get(worldId, key);
    demand(bill && ["settled", "linked"].includes(bill.state) && bill.scope === "image" && bill.conflicts.length === 0
      && kept?.evidence && kept.operationFingerprint === bill.operationFingerprint && "evidence" in bill && sameChargeEvidence(kept.evidence, bill.evidence),
      "Every original paid painting must retain its exact settled bill and RAW");
    const wire = JSON.parse(kept.bytes.toString()); demand(wire.version === "local-patch-render/v1" && wire.rejected === null && typeof wire.bytesBase64 === "string"
      && Buffer.from(wire.bytesBase64,"base64").toString("base64") === wire.bytesBase64, "An original RAW is unreadable");
    paid.push({ requestKey: key, fingerprint: kept.operationFingerprint, payloadSha256: kept.payloadSha256, evidenceSha256: hash(bill.evidence) });
  }
  // Batch the exact existing pictures, identity and source in two bounded reads.
  const assetIds = [...new Set([...rows.flatMap(r => r.assetId ? [r.assetId] : []), child.identityAssetId, child.avatarAssetId, child.originalPhotoAssetId])];
  const assets = await c.db.asset.findMany({ where: { id: { in: assetIds } } }), blobs = await c.db.fileBlob.findMany({ where: { key: { in: assets.map(a => a.storagePath) } } });
  const byId = new Map(assets.map(a => [a.id,a])), byPath = new Map(blobs.map(b => [b.key,Buffer.from(b.data)]));
  const assetBytes = (id: string, visibility: string) => {
    const asset = byId.get(id), bytes = asset && byPath.get(asset.storagePath);
    demand(asset && bytes && asset.ownerId === operatorId && asset.visibility === visibility && asset.status === "READY" && !asset.deletedAt,
      "An owned original asset is missing or changed"); return { asset, bytes };
  };
  const identity = assetBytes(child.identityAssetId,"PRIVATE"), photo = assetBytes(child.originalPhotoAssetId,"PRIVATE"), avatar = assetBytes(child.avatarAssetId,"GAME");
  demand(identity.asset.type === "IDENTITY_SHEET" && photo.asset.type === "ORIGINAL_PHOTO" && avatar.asset.type === "AVATAR"
    && sha(identity.bytes) === single.identitySha256, "The exact original source-approved identity and avatar are required");
  const protectedRows = [];
  for (const sibling of rows.filter(r => r.id !== row.id)) {
    const siblingScene = game.scenes.find(s => s.id === sibling.targetInstance.gameSceneId), siblingHide = context.boards.find(b => b.board === siblingScene?.sceneSlug)?.hides.find(h => h.targetId === sibling.targetInstance.targetId);
    demand(siblingScene && siblingHide && sibling.assetId && sibling.status === "GENERATED", "Protected inventory changed");
    const picture = assetBytes(sibling.assetId,"GAME"), geometrySha256 = localPatchPublicationGeometryHash(sibling), imageSha256 = sha(picture.bytes);
    demand(picture.asset.type === "TARGET_SPRITE" && picture.asset.providerRequestId === gameId && await hasLocalPatchPublicationPolicy(c,
      { gameId, sceneVersion:12, hideId:siblingHide.id, variantId:sibling.id, attempts:sibling.attempts, identityAssetId:identity.asset.id,
        identitySha256:sha(identity.bytes),assetId:picture.asset.id,imageSha256,geometrySha256,judgeJson:sibling.judgeJson }),
      "All 26 unchanged appearances require their actual strict publication proof");
    protectedRows.push({ rowId:sibling.id,rowSha256:wholeSourceContextRowHash(sibling),instanceId:sibling.targetInstanceId,
      instanceSha256:frozenWholeSourceContextHash(sibling.targetInstance),assetId:picture.asset.id,assetSha256:frozenWholeSourceContextHash(picture.asset),imageSha256,geometrySha256 });
  }
  const body = wholeSourceContextPinBodySchema.parse({ version:WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION,gameId,worldId,ownerId:operatorId,operatorId,
    birthAuthorizationSha256:birth.authorizationSha256,familyRecordSha256:hash(family.metaJson),childId:child.id,childSha256:frozenWholeSourceContextHash(child),ordersSha256:ordersHash(game.orders),
    identityAssetId:identity.asset.id,identitySha256:sha(identity.bytes),photoAssetId:photo.asset.id,photoSha256:sha(photo.bytes),avatarAssetId:avatar.asset.id,avatarSha256:sha(avatar.bytes),ageYears:child.ageYears,
    capMicroUsd:4000000,automaticBudgetExtension:false,approvalGranted:false,jobId:job.id,jobHoldSha256:wholeSourceContextJobHash(job),ledgerRevision:ledger.revision,ledgerSha256:hash(ledger.snapshot),
    continuationApprovalsSha256:hash(ledger.snapshot.unknownContinuationApprovals??[]),
    originalRequests:ledger.snapshot.requests.map(r => ({requestKey:r.requestKey,sha256:hash(r)})),
    selected:{rowId:row.id,sceneId:scene.id,targetInstanceId:row.targetInstanceId,hideId:hide.id,boardId:board!.board,targetId:hide.targetId,
      originalInstanceSha256:frozenWholeSourceContextHash(row.targetInstance),originalRowSha256:wholeSourceContextRowHash(row),originalInvariantSha256:wholeSourceContextRowInvariant(row),previousJudgeJson:row.judgeJson,previousLastError:row.lastError,
      originalAttempts:3,authorizedAttempt:4,requestKey,plan,paid},protectedRows });
  return { body, planSha256:hash(body), remainingMicroUsd:audit.remainingMicroUsd };
}

/** The operator stages one immutable exception. Only the normal SYSTEM queue may wake it. */
export async function stageWholeSourceContextRepair(c:Container,input:{gameId:string;operatorId:string;expectedPlanSha256:string}) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Dedicated QA database storage is required");
  const previous=await readWholeSourceContextPin(c.db,input.gameId);
  if(previous){const {createdAt:_created,authorizationSha256,...original}=previous;
    demand(previous.ownerId===input.operatorId&&hash(original)===input.expectedPlanSha256,"Existing immutable plan differs");
    return {authorizationSha256,providerCalls:0,capMicroUsd:4000000,alreadyStaged:true};}
  const preview = await planWholeSourceContextRepair(c,input.gameId,input.operatorId);
  demand(preview.planSha256 === input.expectedPlanSha256,"Preview changed; nothing was staged");
  const body = {...preview.body,createdAt:new Date().toISOString()},pin = wholeSourceContextPinSchema.parse({...body,authorizationSha256:hash(body)});
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx,input.gameId);
    demand(!await tx.auditLog.findUnique({where:{id:wholeSourceContextPinId(input.gameId)}}),"Only one exception is allowed");
    await validateFrozenContextState(tx,pin,true);
    await tx.auditLog.create({data:{id:wholeSourceContextPinId(input.gameId),actorType:"ADMIN",actorId:input.operatorId,action:WHOLE_SOURCE_CONTEXT_ACTION,
      entityType:"Game",entityId:input.gameId,metaJson:JSON.stringify(pin)}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  return {authorizationSha256:pin.authorizationSha256,providerCalls:0,capMicroUsd:4000000};
}

async function validateFrozenContextState(db:Prisma.TransactionClient,pin:WholeSourceContextPin,originalHold:boolean) {
  const game = await db.game.findUniqueOrThrow({where:{id:pin.gameId},include:{childProfile:true,orders:true}}),job = await db.generationJob.findUniqueOrThrow({where:{id:pin.jobId}});
  demand(game.ownerId===pin.ownerId && game.status==="TARGETS_GENERATING" && !game.deletedAt && !game.configJson && !game.readyAt
    && game.childProfile?.id===pin.childId && frozenWholeSourceContextHash(game.childProfile)===pin.childSha256 && ordersHash(game.orders)===pin.ordersSha256,"Original world, source identity or paid order changed");
  if(originalHold)demand(job.status==="FAILED" && job.currentStep===EXHAUSTED && wholeSourceContextJobHash(job)===pin.jobHoldSha256,"Original exhausted job changed");
  const rows = await rowsOf(db,pin.gameId);
  demand(rows.length===27 && pin.protectedRows.every(p=>rows.some(r=>r.id===p.rowId && wholeSourceContextRowHash(r)===p.rowSha256
    && r.targetInstanceId===p.instanceId && frozenWholeSourceContextHash(r.targetInstance)===p.instanceSha256)),"Protected 26 appearances changed");
  const selected = rows.find(r=>r.id===pin.selected.rowId);
  demand(selected && frozenWholeSourceContextHash(selected.targetInstance)===pin.selected.originalInstanceSha256 && (originalHold ? wholeSourceContextRowHash(selected)===pin.selected.originalRowSha256 : wholeSourceContextCandidate(pin,selected)),"Selected finite checkpoint changed");
  const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(pin.worldId);
  demand(ledger && hash(ledger.snapshot.unknownContinuationApprovals??[])===pin.continuationApprovalsSha256 && (originalHold ? ledger.revision===pin.ledgerRevision && hash(ledger.snapshot)===pin.ledgerSha256 : pin.originalRequests.every(p=>ledger.snapshot.requests.some(r=>r.requestKey===p.requestKey&&hash(r)===p.sha256))),
    "An original bill or UNKNOWN reservation changed");
}

export async function requireWholeSourceContextPurchase(c:Container,gameId:string,rowId:string) {
  const pin = await readWholeSourceContextPin(c.db,gameId);demand(pin && pin.selected.rowId===rowId,"Exact finite context grant required");
  const wake = await c.db.auditLog.findUnique({where:{id:wholeSourceContextWakeId(gameId)}}),proof=JSON.parse(wake?.metaJson??"null");
  demand(wake?.actorType==="SYSTEM"&&wake.actorId===null&&wake.action===WHOLE_SOURCE_CONTEXT_WAKE_ACTION&&wake.entityId===gameId&&wake.entityType==="Game"&&proof.authorizationSha256===pin.authorizationSha256&&proof.previousHoldSha256===pin.jobHoldSha256&&proof.providerCalls===0,"Normal SYSTEM wake required");
  await validateFrozenContextState(c.db,pin,false);
  const budget = boardWizardBudgetOf(c),audit=await budget.audit(pin.worldId),paid=await budget.readRequest(pin.worldId,pin.selected.requestKey);
  demand(audit.capMicroUsd===4000000 && !audit.overCapMicroUsd && !audit.conflictRequestKeys.length && !audit.overrunRequestKeys.length,"Original cap and all commitments must remain intact");
  if(!paid)demand(!audit.held&&audit.remainingMicroUsd>=WHOLE_SOURCE_CONTEXT_REQUIRED_HEADROOM,"Complete image and MAIN must still fit before dispatch");
  return {pin,marker:wholeSourceContextMarkerFor(pin)};
}
export async function nextWholeSourceContextWake(c:Container):Promise<string|null> {
  if(env().APP_ENV!=="qa"||c.storage.id!=="db")return null;
  const records=await c.db.auditLog.findMany({where:{action:WHOLE_SOURCE_CONTEXT_ACTION,actorType:"ADMIN"},orderBy:{createdAt:"asc"},select:{entityId:true}});
  for(const {entityId} of records)try { const pin=await readWholeSourceContextPin(c.db,entityId);if(pin&&!await c.db.auditLog.findUnique({where:{id:wholeSourceContextWakeId(entityId)}})) {
    await validateFrozenContextState(c.db,pin,true);return entityId;
  }}catch{/* Invalid or consumed authority cannot starve other worlds. */}
  return null;
}
export async function resumeWholeSourceContextRepair(c:Container,gameId:string):Promise<boolean> {
  if(env().APP_ENV!=="qa"||c.storage.id!=="db")return false;
  const pin=await readWholeSourceContextPin(c.db,gameId);if(!pin||await c.db.auditLog.findUnique({where:{id:wholeSourceContextWakeId(gameId)}}))return false;
  try{return await c.db.$transaction(async tx=>{
    await fenceLocalPatchImages(tx,gameId);
    if(await tx.auditLog.findUnique({where:{id:wholeSourceContextWakeId(gameId)}}))return false;
    const current=await tx.generationJob.findUnique({where:{id:pin.jobId}});
    if(!current||current.status!=="FAILED"||current.currentStep!==EXHAUSTED||wholeSourceContextJobHash(current)!==pin.jobHoldSha256)return false;
    await validateFrozenContextState(tx,pin,true);
    const row=await tx.generationJob.findUniqueOrThrow({where:{id:pin.jobId}});
    const changed=await tx.generationJob.updateMany({where:{id:row.id,status:row.status,currentStep:row.currentStep,attempts:row.attempts,updatedAt:row.updatedAt,lastError:row.lastError},
      data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
    if(changed.count!==1)return false;
    await tx.auditLog.create({data:{id:wholeSourceContextWakeId(gameId),actorType:"SYSTEM",action:WHOLE_SOURCE_CONTEXT_WAKE_ACTION,entityType:"Game",entityId:gameId,
      metaJson:JSON.stringify({version:WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION,authorizationSha256:pin.authorizationSha256,previousHoldSha256:pin.jobHoldSha256,providerCalls:0,attemptsPreserved:true,capPreserved:true})}});
    return true;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  }catch(error){if(error instanceof Prisma.PrismaClientKnownRequestError&&["P2002","P2034"].includes(error.code))return false;throw error;}
}

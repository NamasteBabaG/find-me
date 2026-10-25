import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DETECTIVE_PROP_JOIN as contract } from "../../../content/detectives/prop-joins";
import { PROP_JOIN_VERSION,propJoinProofSchema,conclusivePropJoinRefusal } from "../../domain/generation/prop-join";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sha256Bytes as sha } from "./fixed-sprite";
import { composeRegisteredProp } from "./prop-join-compose";
import { singleLowReviewAuthorization } from "./single-low-policy";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import { subjectUpgradeOf } from "./subject-enrollment";
import { verifiedDualStage } from "./local-patch-dual-evidence";
import { authoredLocalPatchReviewBinding } from "./local-patch-authored-return";
import { expectedAuthoredLocalPatchReturn } from "./local-patch-authored-return";
import { sceneBySlug } from "../scene-catalog.service";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { sameChargeEvidence } from "./world-budget";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { localPatchGeometry } from "./local-patch-geometry";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import type { LocalPatchHideDeps } from "./local-patch-hide";

const ACTION="generation:source-prop-registration/v1",EXHAUSTED="local-patch:recovery-exhausted";
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const rectSame=(a:typeof contract.child,b:typeof contract.child)=>!!a&&!!b&&a.left===b.left&&a.top===b.top&&a.width===b.width&&a.height===b.height;
const auditId=(gameId:string,attempt:number)=>"aud_prop_"+hash([gameId,contract.hideId,attempt]);
const wakeId=(gameId:string)=>"aud_prop_wake_"+hash([gameId,contract.hideId]);
type Reader=Pick<Prisma.TransactionClient,"game"|"auditLog">;
async function context(db:Reader,gameId:string,liveOnly=true){
 if(env().APP_ENV!=="qa")return null;
 const authority=await singleLowReviewAuthorization(db,gameId);
 if(authority?.kind!=="from-birth"||authority.sceneVersion!==13)return null;
 const game=await db.game.findUnique({where:{id:gameId},include:{childProfile:true,scenes:true,orders:true}}),child=game?.childProfile;
 if(!game||!game.ownerId||game.deletedAt||game.styleVersion!=="local-patch-world-v1"||!child||child.deletedAt
  ||child.ownerId!==game.ownerId||!child.identityAssetId||!child.ageYears||game.scenes.length!==9||game.scenes.some(s=>s.sceneVersion!==13)
  ||(liveOnly?game.status!=="TARGETS_GENERATING"||!!game.configJson:!["TARGETS_GENERATING","READY","DELIVERED"].includes(game.status))
  ||!game.orders.some(o=>o.userId===game.ownerId&&o.paymentStatus==="PAID"&&o.paidAt&&!o.refundedAt)
  ||game.orders.some(o=>o.refundedAt||o.paymentStatus==="REFUNDED"))return null;
 const subject=await subjectUpgradeOf(db,gameId);
 if(!subject||subject.identityAssetId!==child.identityAssetId||subject.ageYears!==child.ageYears
  ||liveOnly&&subject.photoAssetId!==child.originalPhotoAssetId)return null;
 const placement=await resolveLocalPatchBoardsForGame(db,gameId,13),board=placement.boards.find(b=>b.board===contract.boardId),hide=board?.hides.find(h=>h.id===contract.hideId);
 const scene=game.scenes.find(s=>s.sceneSlug===contract.boardId);
 if(!board||!hide||!scene)return null;
 const expected=expectedAuthoredLocalPatchReturn(board,hide,13,placement);
 if(!expected||expected.source.sha256!==contract.sourceSha256||!rectSame(expected.crop,contract.crop)
  ||!rectSame(expected.child,contract.child)||!rectSame(expected.local,contract.returned))return null;
 return {authority,game,child,ownerId:game.ownerId,scene,board,hide,expected};
}
const candidate=(row:{status:string;attempts:number;judgeJson:string|null},allowFresh:boolean)=>{
 let j;try{j=JSON.parse(row.judgeJson??"null");}catch{return false;}
 if(!j||j.propJoinCorrection!==undefined||j.sourceBodyBirth!==undefined||j.sourceBodyRepair!==undefined||j.authoredRecovery!==undefined||j.foreground!==undefined)return false;
 return allowFresh&&row.status==="GENERATED"&&row.attempts>=1&&row.attempts<=3&&j.reviewState==="pending-board-review"&&j.boardReview===undefined
  ||row.status==="FAILED"&&row.attempts===3&&conclusivePropJoinRefusal(row.judgeJson,contract.hideId);
};

async function authenticRefusal(db:Prisma.TransactionClient,gameId:string,row:{judgeJson:string|null},ctx:NonNullable<Awaited<ReturnType<typeof context>>>) {
 try{if(!conclusivePropJoinRefusal(row.judgeJson,contract.hideId))return false;
  const j=JSON.parse(row.judgeJson!),p=j.boardReview.dual;
  if(p.identitySha256!==ctx.authority.identitySha256||p.geometrySha256!==j.geometrySha256||!same(p.authoredReturn,ctx.expected))return false;
  const authoredReviewBinding=authoredLocalPatchReviewBinding({hideId:contract.hideId,imageSha256:j.judgedSha256,geometrySha256:j.geometrySha256,
   identitySha256:ctx.authority.identitySha256,authoredReturn:ctx.expected});
  return !!await verifiedDualStage(db,gameId+":board-wizard",p.quality,"scene-quality",{allowLean:true,allowSingle:true,authoredReviewBinding});
 }catch{return false;}
}

/** Reads only. A once-only software correction gets a normal cron turn; an
 * unrelated/historical/operator hold and an already-corrected image never do. */
export async function nextPropJoinRepair(c:Container):Promise<string|null>{
 if(env().APP_ENV!=="qa"||c.storage?.id!=="db")return null;
 const jobs=await c.db.generationJob.findMany({where:{status:"FAILED",currentStep:EXHAUSTED,
  game:{status:"TARGETS_GENERATING",deletedAt:null,styleVersion:"local-patch-world-v1"}},orderBy:{updatedAt:"asc"},select:{gameId:true}});
 for(const {gameId} of jobs){try{
  const ctx=await context(c.db,gameId);if(!ctx||await c.db.auditLog.findUnique({where:{id:wakeId(gameId)}}))continue;
  const row=await c.db.targetVariantAsset.findFirst({where:{variant:"A",provider:"local-patch",targetInstance:{gameSceneId:ctx.scene.id,targetId:ctx.hide.targetId}}});
  if(!row||!candidate(row,false)||!await authenticRefusal(c.db,gameId,row,ctx)||await c.db.auditLog.findUnique({where:{id:auditId(gameId,row.attempts)}}))continue;
  const a=await boardWizardBudgetOf(c).audit(gameId+":board-wizard");
  if(a.capMicroUsd===4000000&&!a.held&&!a.pendingRequestKeys.length&&a.remainingMicroUsd>=250000)return gameId;
 }catch{/* An invalid authority never changes another world's scheduling. */}}
 return null;
}

/** A free software wake, compared against the exact exhausted hold. No budget,
 * image allowance, paid status, approval or ready state changes here. */
export async function resumePropJoinRepair(c:Container,gameId:string):Promise<boolean>{
 const ctx=await context(c.db,gameId);if(!ctx||c.storage?.id!=="db")return false;
 const job=await c.db.generationJob.findUnique({where:{id:"job_"+gameId}});
 if(!job||job.status!=="FAILED"||job.currentStep!==EXHAUSTED||await c.db.auditLog.findUnique({where:{id:wakeId(gameId)}}))return false;
 const row=await c.db.targetVariantAsset.findFirst({where:{variant:"A",provider:"local-patch",targetInstance:{gameSceneId:ctx.scene.id,targetId:ctx.hide.targetId}}});
 if(!row||!candidate(row,false)||!await authenticRefusal(c.db,gameId,row,ctx)||await c.db.auditLog.findUnique({where:{id:auditId(gameId,row.attempts)}}))return false;
 const a=await boardWizardBudgetOf(c).audit(gameId+":board-wizard");
 if(a.capMicroUsd!==4000000||a.held||a.pendingRequestKeys.length||a.remainingMicroUsd<250000)return false;
 return c.db.$transaction(async tx=>{
  await fenceLocalPatchImages(tx,gameId);
  const live=await context(tx,gameId),current=await tx.targetVariantAsset.findUnique({where:{id:row.id}});
  if(!live||live.authority.authorizationSha256!==ctx.authority.authorizationSha256||!current||current.judgeJson!==row.judgeJson||!candidate(current,false)||!await authenticRefusal(tx,gameId,current,live))return false;
  const changed=await tx.generationJob.updateMany({where:{id:job.id,status:job.status,currentStep:job.currentStep,attempts:job.attempts,lastError:job.lastError,updatedAt:job.updatedAt},
   data:{status:"QUEUED",currentStep:"local-patch",lastError:null}});
  if(changed.count!==1)return false;
  await tx.auditLog.create({data:{id:wakeId(gameId),actorType:"SYSTEM",action:ACTION,entityType:"Game",entityId:gameId,
   metaJson:JSON.stringify({version:PROP_JOIN_VERSION,kind:"software-wake",contractSha256:hash(contract),rowId:row.id,previousHoldSha256:hash(job),attemptsPreserved:true,capPreserved:true,providerCalls:0})}});
  return true;
 });
}

async function paidRaw(db:Prisma.TransactionClient,gameId:string,requestKey:string){
 const worldId=gameId+":board-wizard",ledger=await PrismaWorldBudgetStore.forReadOnlyTransaction(db).read(worldId);
 const bill=ledger?.snapshot.requests.find(r=>r.requestKey===requestKey),kept=await new PrismaRetainedPurchaseStore(db).get(worldId,requestKey);
 if(!bill||bill.state!=="settled"||bill.scope!=="image"||bill.conflicts.length||!kept?.evidence||kept.scope!=="image"
  ||bill.operationFingerprint!==kept.operationFingerprint||!sameChargeEvidence(bill.evidence,kept.evidence))throw Error("PROP_JOIN: original paid image evidence changed");
 const wire=JSON.parse(kept.bytes.toString());
 if(wire.version!=="local-patch-render/v1"||wire.rejected!==null||typeof wire.bytesBase64!=="string")throw Error("PROP_JOIN: usable settled RAW required");
 const raw=Buffer.from(wire.bytesBase64,"base64");if(raw.toString("base64")!==wire.bytesBase64)throw Error("PROP_JOIN: invalid retained image encoding");
 return {bill,kept,wire,raw};
}

/** Runs before a fresh image's FIRST review, or once for an exact conclusive
 * old refusal after the software wake. It never buys or approves an image. */
export async function applyPropJoinRepair(c:Container,gameId:string,hideId:string|undefined,deps:{fence(tx:Prisma.TransactionClient):Promise<void>;readBoardArt?:LocalPatchHideDeps["readBoardArt"]}):Promise<string|null>{
 if(c.storage?.id!=="db"||hideId!==undefined&&hideId!==contract.hideId)return null;
 const ctx=await context(c.db,gameId);if(!ctx)return null;
 const row=await c.db.targetVariantAsset.findFirst({where:{variant:"A",provider:"local-patch",targetInstance:{gameSceneId:ctx.scene.id,targetId:ctx.hide.targetId}}});
 if(!row||!row.assetId||!candidate(row,hideId!==undefined)||await c.db.auditLog.findUnique({where:{id:auditId(gameId,row.attempts)}}))return null;
 if(row.status==="FAILED"&&!await authenticRefusal(c.db,gameId,row,ctx))return null;
 const j=JSON.parse(row.judgeJson!),requestKey=`${ctx.hide.id}:${ctx.hide.pose}:render:${row.attempts}`;
 const paid=await paidRaw(c.db,gameId,requestKey);
 if(!same(paid.wire.authoredReturn,ctx.expected)||!same(j.authoredReturn,ctx.expected))throw Error("PROP_JOIN: original authored return changed");
 const identity=await c.db.asset.findUniqueOrThrow({where:{id:ctx.child.identityAssetId!}}),oldAsset=await c.db.asset.findUniqueOrThrow({where:{id:row.assetId}});
 if(identity.ownerId!==ctx.ownerId||identity.visibility!=="PRIVATE"||identity.type!=="IDENTITY_SHEET"||identity.status!=="READY"||identity.deletedAt
  ||sha(await c.storage.get(identity.storagePath))!==ctx.authority.identitySha256||oldAsset.ownerId!==ctx.ownerId||oldAsset.providerRequestId!==gameId||oldAsset.deletedAt||oldAsset.visibility!=="GAME"||oldAsset.type!=="TARGET_SPRITE"||oldAsset.status!=="READY"||oldAsset.provider!=="local-patch"
  ||sha(await c.storage.get(oldAsset.storagePath))!==j.judgedSha256)throw Error("PROP_JOIN: owned identity or current image changed");
 const before=await (deps.readBoardArt??(await import("./local-patch-hide")).readShippedBoardArt)(ctx.board.art,contract.sourceSha256);
 const result=await composeRegisteredProp(before,paid.raw,contract);
 if(!result||result.proof.beforeImageSha256!==j.judgedSha256)return null;
 const definition=sceneBySlug(ctx.scene.sceneSlug,13),measured=await localPatchGeometry({hide:ctx.hide,boardPng:before,patchPng:result.shipping,board:definition.art,contentVersion:13});
 const geometry={rectJson:JSON.stringify(measured.geometry.rect),hitRectJson:JSON.stringify(measured.geometry.hitRect),headAnchorJson:JSON.stringify(measured.geometry.anchor)};
 const proof=propJoinProofSchema.parse({version:PROP_JOIN_VERSION,contractSha256:hash(contract),gameId,rowId:row.id,attempt:row.attempts,
  requestKey,operationFingerprint:paid.kept.operationFingerprint,payloadSha256:paid.kept.payloadSha256,rawPngSha256:sha(paid.raw),
  authorizationSha256:ctx.authority.authorizationSha256,identitySha256:ctx.authority.identitySha256,geometrySha256:localPatchPublicationGeometryHash(geometry),...result.proof});
 const assetId="ast_prop_"+hash([gameId,ctx.hide.id,requestKey,proof.imageSha256]).slice(0,28),key="game/"+assetId+".png";
 const {boardReview:_review,verdict:_verdict,qualityDisposition:_disposition,...base}=j;
 const judgeJson=JSON.stringify({...base,verdict:null,wireFault:null,renderFault:null,reviewState:"pending-board-review",seam:result.report,
  compositionPermission:result.compositionPermission,judgedSha256:proof.imageSha256,geometrySha256:proof.geometrySha256,
  geometryBasis:measured.basis,measuredFraction:Number(measured.measuredFraction.toFixed(4)),propJoinCorrection:proof});
 await c.db.$transaction(async tx=>{
  await fenceLocalPatchImages(tx,gameId);await deps.fence(tx);
  const live=await context(tx,gameId),current=await tx.targetVariantAsset.findUniqueOrThrow({where:{id:row.id}}),checked=await paidRaw(tx,gameId,requestKey);
  if(!live||live.authority.identitySha256!==proof.identitySha256||live.authority.authorizationSha256!==proof.authorizationSha256
   ||current.status!==row.status||current.attempts!==row.attempts||current.judgeJson!==row.judgeJson||current.assetId!==row.assetId
   ||checked.kept.payloadSha256!==proof.payloadSha256||sha(checked.raw)!==proof.rawPngSha256)throw Error("PROP_JOIN: state or retained pixels changed before commit");
  const saved=await tx.asset.upsert({where:{id:assetId},update:{},create:{id:assetId,ownerId:ctx.ownerId,type:"TARGET_SPRITE",visibility:"GAME",status:"READY",storagePath:key,mimeType:"image/png",width:512,height:768,bytes:result.shipping.length,costCents:0,provider:"local-patch",providerRequestId:gameId}});
  if(saved.ownerId!==ctx.ownerId||saved.storagePath!==key||saved.deletedAt||saved.status!=="READY")throw Error("PROP_JOIN: derived asset address conflict");
  const blob=await tx.fileBlob.upsert({where:{key},update:{},create:{key,data:new Uint8Array(result.shipping),contentType:"image/png"}});
  if(sha(Buffer.from(blob.data))!==proof.imageSha256)throw Error("PROP_JOIN: derived pixels changed");
  await tx.auditLog.create({data:{id:auditId(gameId,row.attempts),actorType:"SYSTEM",action:ACTION,entityType:"Game",entityId:gameId,
   metaJson:JSON.stringify({version:PROP_JOIN_VERSION,kind:"derived-pixels",proof,previousAssetId:row.assetId,previousJudgeJson:row.judgeJson,providerCalls:0,attemptsPreserved:true,approvalTransferred:false})}});
  const previous:unknown=JSON.parse(row.rejectedAssetIdsJson??"[]");if(!Array.isArray(previous)||previous.some(v=>typeof v!=="string"))throw Error("PROP_JOIN: rejected image inventory changed");
  await tx.targetVariantAsset.update({where:{id:row.id},data:{...geometry,judgeJson,status:"GENERATED",assetId,lastError:null,rejectedAssetIdsJson:JSON.stringify([...new Set([...previous,row.assetId])])}});
  await tx.targetInstance.update({where:{id:row.targetInstanceId},data:{status:"GENERATED",spriteKind:"image",spriteAssetId:assetId}});
  await tx.gameScene.update({where:{id:ctx.scene.id},data:{generationStatus:"NEEDS_REGENERATION",configJson:null}});
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:30000});
 return assetId;
}

/** Recompute the actual derived pixels from the settled immutable RAW and the
 * pinned public source. Hash claims and an old PASS are never sufficient. */
export async function propJoinPublicationMatches(db:Prisma.TransactionClient,input:{gameId:string;hideId:string;judgeJson:string|null;variantId?:string;assetId?:string}):Promise<boolean>{
 try{
  const j=JSON.parse(input.judgeJson??"null");if(j?.propJoinCorrection===undefined)return true;
  const proof=propJoinProofSchema.parse(j.propJoinCorrection),ctx=await context(db,input.gameId,false);
  if(!ctx||input.hideId!==contract.hideId||proof.gameId!==input.gameId||proof.rowId!==input.variantId||proof.contractSha256!==hash(contract)
   ||proof.authorizationSha256!==ctx.authority.authorizationSha256||proof.identitySha256!==ctx.authority.identitySha256
   ||proof.imageSha256!==j.judgedSha256||proof.geometrySha256!==j.geometrySha256||!same(j.authoredReturn,ctx.expected))return false;
  const row=await db.targetVariantAsset.findUnique({where:{id:proof.rowId}}),audit=await db.auditLog.findUnique({where:{id:auditId(input.gameId,proof.attempt)}});
  if(!row||row.attempts!==proof.attempt||!row.assetId||input.assetId!==undefined&&row.assetId!==input.assetId||!audit||audit.actorType!=="SYSTEM"||audit.actorId!==null||audit.entityId!==input.gameId||audit.entityType!=="Game"||audit.action!==ACTION)return false;
  const recorded=JSON.parse(audit.metaJson??"null");if(recorded.kind!=="derived-pixels"||!same(recorded.proof,proof)||recorded.approvalTransferred!==false)return false;
  const paid=await paidRaw(db,input.gameId,proof.requestKey);
  if(proof.requestKey!==`${ctx.hide.id}:${ctx.hide.pose}:render:${row.attempts}`||paid.kept.operationFingerprint!==proof.operationFingerprint
   ||paid.kept.payloadSha256!==proof.payloadSha256||sha(paid.raw)!==proof.rawPngSha256||!same(paid.wire.authoredReturn,ctx.expected))return false;
  const before=await (await import("./local-patch-hide")).readShippedBoardArt(ctx.board.art,contract.sourceSha256),result=await composeRegisteredProp(before,paid.raw,contract);
  if(!result||!Object.entries(result.proof).every(([k,v])=>(proof as unknown as Record<string,unknown>)[k]===v))return false;
  const asset=await db.asset.findUnique({where:{id:row.assetId}}),blob=asset?await db.fileBlob.findUnique({where:{key:asset.storagePath}}):null;
  return !!asset&&asset.ownerId===ctx.ownerId&&asset.providerRequestId===input.gameId&&asset.status==="READY"&&!asset.deletedAt&&!!blob&&sha(Buffer.from(blob.data))===proof.imageSha256;
 }catch{return false;}
}

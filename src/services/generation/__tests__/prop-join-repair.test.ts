import { mkdtempSync,realpathSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Prisma,PrismaClient } from "@prisma/client";
import { beforeAll,afterAll,afterEach,describe,expect,it,vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import { DETECTIVE_PATCH_BOARDS } from "../../../../content/detectives/runtime-release";
import { DETECTIVE_PROP_JOIN as contract } from "../../../../content/detectives/prop-joins";
import { PROP_JOIN_VERSION,conclusivePropJoinRefusal } from "../../../domain/generation/prop-join";
import { SINGLE_VISUAL_REVIEW_VERSION } from "../../../domain/generation/single-visual-review";
import { DETECTIVES_OPERATIONAL_RELEASE } from "../../../domain/generation/detectives-operational-policy";
import { composeRegisteredProp } from "../prop-join-compose";
import { applyPropJoinRepair,nextPropJoinRepair,resumePropJoinRepair,propJoinPublicationMatches } from "../prop-join-repair";
import { composeBoundedLocalPatch } from "../local-patch-seam";
import { seedApprovedGame,bill } from "./local-patch-fixtures";
import { pinVisualReviewRelease,DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { pinLeanRelease,LOCAL_PATCH_LEAN_RELEASE } from "../lean-release";
import { pinIdentitySourceRelease } from "../identity-source-release";
import { pinLocalPatchSourceFamily,resolveLocalPatchBoardsForGame } from "../source-placement-release";
import { pinDetectivesOperationalPolicy,detectivesOperationalId } from "../detectives-operational-policy";
import { buildBoardWizardIdentityStyle } from "../board-wizard-identity-style";
import { reviewBoardWizardIdentity } from "../board-wizard-identity-gate";
import { enrollLeanWorld } from "../lean-enrollment";
import { subjectUpgradeOf } from "../subject-enrollment";
import { singleLowReviewAuthorization } from "../single-low-policy";
import { boardWizardBudgetOf } from "../board-conditioned-wizard";
import { readShippedBoardArt } from "../local-patch-hide";
import { localPatchGeometry } from "../local-patch-geometry";
import { localPatchPublicationGeometryHash } from "../local-patch-publication-policy";
import { expectedAuthoredLocalPatchReturn,authoredLocalPatchReviewBinding,authoredLocalPatchPublicationMatches } from "../local-patch-authored-return";
import { allowedDualPublication } from "../local-patch-dual-publication";
import { boardConditioningHash as hash } from "../board-conditioned-source";
import { sha256Bytes as sha } from "../fixed-sprite";
import { sceneBySlug } from "../../scene-catalog.service";
import { PrismaRetainedPurchaseStore } from "../../../infra/db/prisma-retained-purchase-store";
import { purchaseOnce } from "../paid-operation";
import { SINGLE_LOW_REVIEW_POLICIES } from "../../../domain/generation/visual-review-policy";

const fixture=vi.hoisted(()=>({testers:[] as string[]}));
vi.mock("../../../lib/env",()=>({env:()=>({APP_ENV:"qa",GENERATION_ENABLED:"on",GENERATION_DAILY_CENTS:0,LOCAL_PATCH_PLAYER_REVIEW:"on",GENERATION_PROVIDER:"openai",GENERATION_MODEL:"gpt-image-2",GENERATION_QUALITY:"medium",LOCAL_PATCH_PROMPT_RELEASE:"v19",LOCAL_PATCH_IDENTITY_SOURCE:"full-source-v1"}),spendGuard:()=>({appEnv:"qa",realGeneration:true,testers:fixture.testers}),flag:()=>false,adminEmails:()=>[]}));
let db:PrismaClient,c:Container,dir:string,before:Buffer,misplacedRaw:Buffer;
beforeAll(async()=>{
 dir=realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()),"findme-prop-join-")));
 db=new PrismaClient({datasources:{db:{url:`file:${path.join(dir,"test.db").replaceAll("\\","/")}`}}});await applyTestSchema(db);
 c={db,storage:new DbStorage(db),secret:"synthetic-prop-test",appUrl:"https://qa.invalid",adminEmails:[],backgroundReview:{}} as unknown as Container;
 vi.stubGlobal("fetch",vi.fn(async()=>{throw Error("Live provider forbidden in prop-join regressions");}));
 before=await readShippedBoardArt("public/scenes/journey-paris-detectives-v4/base.webp",contract.sourceSha256);
 // PUBLIC source only: compress its lower prop toward the rear support. No
 // customer photo, generated PNG or live private receipt is a test fixture.
 const src=await sharp(before).extract(contract.crop).ensureAlpha().raw().toBuffer(),out=Buffer.from(src);
 for(let y=350;y<768;y++)for(let x=200;x<512;x++){
  const w=Math.max(0,Math.min(1,(y-350)/(727-350))),xx=Math.min(511,Math.round(200+(x-200)*(1+.4*w))),yy=Math.min(767,Math.round(y+10*w));
  for(let ch=0;ch<4;ch++)out[(y*512+x)*4+ch]=src[(yy*512+xx)*4+ch]!;
 }
 misplacedRaw=await sharp(out,{raw:{width:512,height:768,channels:4}}).resize(768,1152).png().toBuffer();
},180000);
afterEach(()=>vi.restoreAllMocks());
afterAll(async()=>{vi.unstubAllGlobals();await db.$disconnect();if(path.dirname(dir)===realpathSync(tmpdir())&&path.basename(dir).startsWith("findme-prop-join-"))rmSync(dir,{recursive:true});});
const obs=(status:string)=>({status,observation:"Explicit controlled synthetic observation for contract regression."});
function refusal(hideId:string){
 const pass=["childPresent","childOnlyOnce","childComplete","styleMatch","scaleRight","groundContact","faceLikeness","faceReadable","ageAppropriate","lightingMatch","neighborsIntact"];
 return {version:SINGLE_VISUAL_REVIEW_VERSION,assessment:{version:"quality-source-neighbor-answer/v1",assessment:{version:"quality-subject-answer/v1",quality:{hides:[{hideId,verdict:{...Object.fromEntries(pass.map(k=>[k,"pass"])),pictureWhole:"fail",severeSeam:"fail",verdict:"fail",reason:"The lower retained wheel and the repainted fork do not meet.",faults:[{check:"pictureWhole",where:"The lower public return joins two different steering positions."},{check:"severeSeam",where:"The wheel and fork are visibly disconnected at the return."}]}}]},subject:{hideId,checks:{photoLikeness:obs("pass"),canonicalAgreement:obs("pass"),faceVisible:obs("pass"),perceivedAge:{...obs("pass"),estimatedMinYears:6,estimatedMaxYears:8},requiredWardrobe:obs("not-required")},faults:[]}},sourceNeighbors:{neighbors:[{sourceId:"public-source-neighbor",status:"pass"}]}},continuity:{cases:[{state:"coherent",visibleBody:true,headConnection:"connected",faults:[]}]},doubt:false,doubtReason:null};
}
async function seed(id:string,attempts=3,fresh=false){
 const f=await seedApprovedGame(c,db,{gameId:id,approved:false,styleVersion:"local-patch-world-v1",status:"DRAFT",scenes:DETECTIVE_PATCH_BOARDS.map(b=>({slug:b.board,version:13}))});
 fixture.testers.push(f.email);await db.game.update({where:{id},data:{searchLevel:"detectives"}});await db.childProfile.update({where:{id:"chl-"+id},data:{originalPhotoAssetId:null,ageYears:7}});
 await db.$transaction(async tx=>{await pinVisualReviewRelease(tx,id,DUAL_VISUAL_REVIEW_V3);await pinLeanRelease(tx,id,LOCAL_PATCH_LEAN_RELEASE);await pinIdentitySourceRelease(tx,id);await pinLocalPatchSourceFamily(tx,id,{sceneVersion:13,searchLevel:"detectives"});await pinDetectivesOperationalPolicy(tx,id,DETECTIVES_OPERATIONAL_RELEASE,"db");});
 await db.childProfile.update({where:{id:"chl-"+id},data:{originalPhotoAssetId:"ast-photo-"+id}});await c.storage.put("private/photo-"+id+".jpg",f.sheet,"image/png");
 await db.game.update({where:{id},data:{status:"TARGETS_GENERATING"}});await db.order.create({data:{id:"ord-"+id,gameId:id,userId:f.userId,provider:"mock",packageTier:"ONE_WORLD",amountAgorot:3900,paymentStatus:"PAID",paidAt:new Date()}});
 await db.generationJob.create({data:{id:"job_"+id,gameId:id,status:fresh?"RUNNING":"FAILED",currentStep:fresh?"local-patch":"local-patch:recovery-exhausted",attempts:10,lastError:fresh?null:"Conclusive prop failure after three ordinary images"}});
 const atlas=await buildBoardWizardIdentityStyle(undefined,"board-matched-identity/v6","journey",undefined,{sceneVersion:13});
 const checks={identity:"pass",age:"pass",paintedStyle:"pass",sheetLayout:"pass",sourceFaceVisible:"pass",facialVolume:"pass",viewConsistency:"pass"};
 const identityReview=await reviewBoardWizardIdentity({db,apiKey:"synthetic-never-live",budget:boardWizardBudgetOf(c),beforeDispatch:async()=>{},write:work=>db.$transaction(work),reviewer:{review:async()=>({httpOk:true,requestId:"req_identity_"+id,body:{model:"gpt-6.1-sol",usage:{prompt_tokens:1500,completion_tokens:150},choices:[{finish_reason:"stop",message:{content:JSON.stringify({checks,reason:"Controlled synthetic identity contract only"})}}]}})}},{gameId:id,identityAssetId:"ast-sheet-"+id,sheet:f.sheet,photo:f.sheet,atlas:atlas.png,contentVersion:13,provenance:{promptVersion:"character-v8-full-source-volume-identity",quality:"medium",photoAssetId:"ast-photo-"+id,photoSha256:sha(f.sheet),ageYears:7,crop:null,style:{version:"board-matched-identity/v6",catalogSha256:atlas.catalogSha256,atlasSha256:atlas.atlasSha256}}});
 expect(identityReview.approved).toBe(true);
 expect(await enrollLeanWorld(c,id,async()=>{})).toMatchObject({state:"enrolled"});
 const placement=await resolveLocalPatchBoardsForGame(db,id,13),board=placement.boards.find(b=>b.board===contract.boardId)!,hide=board.hides.find(h=>h.id===contract.hideId)!,expected=expectedAuthoredLocalPatchReturn(board,hide,13,placement)!;
 const normalized=await sharp(misplacedRaw).resize(512,768).png().toBuffer(),composed=await composeBoundedLocalPatch(before,contract.crop,normalized,contract.child,{playerReview:true,returnRect:contract.returned}),shipping=await sharp(composed.candidate).extract(contract.crop).png().toBuffer();
 const measured=await localPatchGeometry({hide,boardPng:before,patchPng:shipping,board:sceneBySlug("paris",13).art,contentVersion:13}),geometry={rectJson:JSON.stringify(measured.geometry.rect),hitRectJson:JSON.stringify(measured.geometry.hitRect),headAnchorJson:JSON.stringify(measured.geometry.anchor)};
 const budget=boardWizardBudgetOf(c),worldId=id+":board-wizard",store=new PrismaRetainedPurchaseStore(db);
 for(let n=1;n<=attempts;n++){
  const requestKey=`${hide.id}:${hide.pose}:render:${n}`,bytes=Buffer.from(JSON.stringify({version:"local-patch-render/v1",bytesBase64:misplacedRaw.toString("base64"),rejected:null,authoredReturn:expected}));
  await purchaseOnce({ledger:budget,store},{worldId,requestKey,scope:"image",operationFingerprint:hash([id,"render",n]),reserveMicroUsd:120000,buy:async()=>({bytes,evidence:bill("render-"+id+"-"+n,58000)})});
 }
 const assetId="old-"+id;await c.storage.put("game/"+assetId+".png",shipping,"image/png");await db.asset.create({data:{id:assetId,ownerId:f.userId,type:"TARGET_SPRITE",visibility:"GAME",status:"READY",storagePath:"game/"+assetId+".png",mimeType:"image/png",width:512,height:768,bytes:shipping.length,provider:"local-patch",providerRequestId:id}});
 const authority=await singleLowReviewAuthorization(db,id),subject=await subjectUpgradeOf(db,id);expect(authority?.kind).toBe("from-birth");expect(subject?.identityAssetId).toBe("ast-sheet-"+id);
 const base={hide:hide.id,pose:hide.pose,compositionVersion:expected.version,authoredReturn:expected,seam:composed.report,compositionPermission:composed.compositionPermission,judgedSha256:sha(shipping),geometrySha256:localPatchPublicationGeometryHash(geometry),wireFault:null,renderFault:null,verdict:null,reviewState:"pending-board-review"};
 let receipt:Record<string,unknown>=base;
 if(!fresh){
  const raw=JSON.stringify(refusal(hide.id)),fingerprint=hash([id,"refusal"]),requestKey="self-repair:board:paris:"+fingerprint,policy=SINGLE_LOW_REVIEW_POLICIES[0]!;
  const stage={raw,model:"gpt-6.1-sol",policy,attempt:1,requestKey,fingerprint,costMicroUsd:37000,finishReason:"stop",wireFault:null};
  const authoredReviewBinding=authoredLocalPatchReviewBinding({hideId:hide.id,imageSha256:base.judgedSha256,geometrySha256:base.geometrySha256,identitySha256:authority!.identitySha256,authoredReturn:expected});
  const bytes=Buffer.from(JSON.stringify({...stage,costUnknown:false,authoredReviewBinding}));
  await purchaseOnce({ledger:budget,store},{worldId,requestKey,scope:"judge",operationFingerprint:fingerprint,reserveMicroUsd:210000,buy:async()=>({bytes,evidence:{...bill("refusal-"+id,37000),model:"gpt-6.1-sol"}})});
  receipt={...base,reviewState:"board-review-complete",boardReview:{dual:{hideId:hide.id,single:SINGLE_VISUAL_REVIEW_VERSION,imageSha256:base.judgedSha256,geometrySha256:base.geometrySha256,identitySha256:authority!.identitySha256,authoredReturn:expected,quality:stage,continuity:stage,subject:stage}}};
 }
 await db.targetInstance.create({data:{id:"tgt-"+id,gameSceneId:"gsc-"+id+"-paris",targetId:hide.targetId,targetType:"child",slotAId:"hide-2-A",slotBId:"hide-2-B",status:fresh?"GENERATED":"FAILED",spriteKind:"image",spriteAssetId:assetId}});
 await db.targetVariantAsset.create({data:{id:"row-"+id,targetInstanceId:"tgt-"+id,variant:"A",slotId:"hide-2-A",provider:"local-patch",promptVersion:"local-patch-fixed-scenery-v19",status:fresh?"GENERATED":"FAILED",attempts,assetId,costCents:321,...geometry,judgeJson:JSON.stringify(receipt)}});
 const fence=async(tx:Prisma.TransactionClient)=>{const q=await tx.generationJob.updateMany({where:{id:"job_"+id,status:"RUNNING",currentStep:"local-patch"},data:{currentStep:"local-patch"}});if(q.count!==1)throw Error("claim lost");};
 return {id,oldAssetId:assetId,shipping,budget,worldId,fence,receipt};
}

describe("public-source prop compositor",()=>{
 it("leaves an already aligned source unchanged",async()=>{const crop=await sharp(before).extract(contract.crop).png().toBuffer();expect(await composeRegisteredProp(before,crop,contract)).toBeNull();});
 it("creates one bounded candidate from misplaced PUBLIC prop pixels while preserving identity and exterior",async()=>{
  const a=await composeRegisteredProp(before,misplacedRaw,contract),b=await composeRegisteredProp(before,misplacedRaw,contract);
  expect(a).not.toBeNull();expect(a!.proof).toMatchObject({protectedChangedPixels:0,outsideReturnChangedPixels:0});expect(a!.proof.relativeScore).toBeLessThan(.7);expect(a!.proof.imageSha256).toBe(b!.proof.imageSha256);
 });
 it("refuses a malformed source geometry",async()=>{await expect(composeRegisteredProp(before,misplacedRaw,{...contract,crop:{...contract.crop,width:510}})).rejects.toThrow("geometry");});
 it.each(["faceReadable","childComplete","ageAppropriate"])("does not wake for a %s failure",key=>{
  const w=refusal(contract.hideId);(w.assessment.assessment.quality.hides[0]!.verdict as Record<string,unknown>)[key]="fail";
  const stage={raw:JSON.stringify(w),model:"gpt-6.1-sol",policy:{effort:"low"},requestKey:"q",fingerprint:"f"};
  expect(conclusivePropJoinRefusal(JSON.stringify({reviewState:"board-review-complete",judgedSha256:"x",boardReview:{dual:{single:SINGLE_VISUAL_REVIEW_VERSION,hideId:contract.hideId,imageSha256:"x",quality:stage,continuity:stage,subject:stage}}}),contract.hideId)).toBe(false);
 });
});
describe("paid lineage, finite software wake and publication",()=>{
 it("keeps all charges and three attempts, discards the old decision, then requires a fresh judge",async()=>{
  const f=await seed("prop-financial");const old=await f.budget.audit(f.worldId);
  expect(await nextPropJoinRepair(c)).toBe(f.id);expect(await resumePropJoinRepair(c,f.id)).toBe(true);expect(await resumePropJoinRepair(c,f.id)).toBe(false);
  await db.generationJob.update({where:{id:"job_"+f.id},data:{status:"RUNNING",currentStep:"local-patch"}});
  const id=await applyPropJoinRepair(c,f.id,undefined,{fence:f.fence});expect(id).toMatch(/^ast_prop_/);
  const row=await db.targetVariantAsset.findUniqueOrThrow({where:{id:"row-"+f.id}}),j=JSON.parse(row.judgeJson!);
  expect(row).toMatchObject({attempts:3,costCents:321,status:"GENERATED"});expect(j).toMatchObject({verdict:null,reviewState:"pending-board-review",propJoinCorrection:{version:PROP_JOIN_VERSION,protectedChangedPixels:0,outsideReturnChangedPixels:0}});expect(j.boardReview).toBeUndefined();
  expect(await f.budget.audit(f.worldId)).toEqual(old);expect(JSON.parse(row.rejectedAssetIdsJson!)).toContain(f.oldAssetId);
  const binding={gameId:f.id,hideId:contract.hideId,judgeJson:row.judgeJson,variantId:row.id,assetId:row.assetId!};
  expect(await propJoinPublicationMatches(db,binding)).toBe(true);
  expect(await propJoinPublicationMatches(db,{...binding,assetId:f.oldAssetId})).toBe(false);
  const {propJoinCorrection:_omitted,...stripped}=j;
  expect(await authoredLocalPatchPublicationMatches(db,{...binding,sceneVersion:13,judgeJson:JSON.stringify(stripped)})).toBe(false);
  expect(await allowedDualPublication(db,{...binding,sceneVersion:13,identityAssetId:"ast-sheet-"+f.id,identitySha256:j.propJoinCorrection.identitySha256,imageSha256:j.judgedSha256,geometrySha256:j.geometrySha256,attempts:3})).toBe(false);
  expect(await applyPropJoinRepair(c,f.id,undefined,{fence:f.fence})).toBeNull();
  await db.game.update({where:{id:f.id},data:{status:"DELIVERED",configJson:"{\"synthetic\":true}"}});await db.childProfile.update({where:{id:"chl-"+f.id},data:{originalPhotoAssetId:null}});
  expect(await propJoinPublicationMatches(db,binding)).toBe(true);

  const changed={...j,propJoinCorrection:{...j.propJoinCorrection,sx:j.propJoinCorrection.sx+.02}};
  expect(await propJoinPublicationMatches(db,{...binding,judgeJson:JSON.stringify(changed)})).toBe(false);
 },180000);
 it("repairs a fresh image BEFORE its first paid question",async()=>{
  const f=await seed("prop-fresh",1,true),old=await f.budget.audit(f.worldId);
  expect(await applyPropJoinRepair(c,f.id,contract.hideId,{fence:f.fence})).toMatch(/^ast_prop_/);expect(await f.budget.audit(f.worldId)).toEqual(old);
  const row=await db.targetVariantAsset.findUniqueOrThrow({where:{id:"row-"+f.id}});expect(row.attempts).toBe(1);expect(JSON.parse(row.judgeJson!).boardReview).toBeUndefined();
 },180000);
 it("does not trust a modified old refusal and never spends another image",async()=>{
  const f=await seed("prop-tampered");const row=await db.targetVariantAsset.findUniqueOrThrow({where:{id:"row-"+f.id}}),j=JSON.parse(row.judgeJson!);j.boardReview.dual.quality.raw=j.boardReview.dual.quality.raw.replace("lower retained wheel","upper invented wheel");j.boardReview.dual.continuity=j.boardReview.dual.quality;j.boardReview.dual.subject=j.boardReview.dual.quality;
  await db.targetVariantAsset.update({where:{id:row.id},data:{judgeJson:JSON.stringify(j)}});
  expect(await resumePropJoinRepair(c,f.id)).toBe(false);expect(await applyPropJoinRepair(c,f.id,undefined,{fence:f.fence})).toBeNull();
 },180000);
 it("refuses insufficient capacity or a withdrawn from-birth authority",async()=>{
  const f=await seed("prop-cap");const a=await f.budget.audit(f.worldId),amount=a.remainingMicroUsd-200000;
  await f.budget.reserve(f.worldId,{requestKey:"representative-spend",scope:"image",operationFingerprint:hash("spend"),reserveMicroUsd:amount});await f.budget.settle(f.worldId,"representative-spend",bill("spent-"+f.id,amount));
  expect(await resumePropJoinRepair(c,f.id)).toBe(false);expect((await f.budget.audit(f.worldId)).capMicroUsd).toBe(4000000);
  await db.auditLog.delete({where:{id:detectivesOperationalId(f.id)}});expect(await applyPropJoinRepair(c,f.id,contract.hideId,{fence:f.fence})).toBeNull();
 },180000);
 it("cannot save a late derived image after deletion",async()=>{
  const f=await seed("prop-deleted",1,true),old=await f.budget.audit(f.worldId);
  await expect(applyPropJoinRepair(c,f.id,contract.hideId,{fence:f.fence,readBoardArt:async()=>{await db.game.update({where:{id:f.id},data:{status:"DELETED",deletedAt:new Date()}});return before;}})).rejects.toThrow("deleted");
  expect(await db.asset.count({where:{id:{startsWith:"ast_prop_"},providerRequestId:f.id}})).toBe(0);expect(await f.budget.audit(f.worldId)).toEqual(old);
 },180000);
});

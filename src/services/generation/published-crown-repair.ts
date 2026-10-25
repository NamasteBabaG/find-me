import { WorldBudgetError } from "./world-budget";
import { bindBookImage } from "../../domain/adventure/image-binding";
import sharp from "sharp";
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { Container } from '../container';
import { env } from '../../lib/env';
import { GameConfigSchema,SpriteRefSchema,parseGameConfig } from '../../domain/game/config';
import { SOURCE_CROWN_RETURN_CONTRACTS,sourceCrownCorrectionSchema } from '../../domain/scene/source-crown-return';
import { SINGLE_VISUAL_REVIEW_VERSION } from '../../domain/generation/single-visual-review';
import { readSubjectAnswerV2 } from '../../domain/generation/subject-policy';
import { boardConditioningHash as hash } from './board-conditioned-source';
import { sha256Bytes as sha } from './fixed-sprite';
import { boardWizardBudgetOf } from './board-conditioned-wizard';
import { singleLowReviewAuthorization } from './single-low-policy';
import { ensureSingleMediumReviewPolicy } from './single-medium-policy';
import { hasLocalPatchPublicationPolicy,localPatchPublicationGeometryHash,type LocalPatchPublicationBinding } from './local-patch-publication-policy';
import { allowedDualPublication } from './local-patch-dual-publication';
import { subjectStageRaw } from './local-patch-dual-evidence';
import { subjectPlanOfHide,type SubjectUpgradeReceipt } from './subject-enrollment';
import { planSourceCrownCandidate,commitSourceCrownCandidate,sourceCrownRowHash,sourceCrownCompositionMatches,type SourceCrownPlan } from './source-crown-pixels';
import { fenceLocalPatchImages } from './local-patch-lifecycle';
import { advanceContinuityInBackground } from './continuity-background';
import { prepareLocalPatchBoardReview, reviewLocalPatchBoard } from './local-patch-board-review';
import { signedAssetUrl } from '../asset.service';

const VERSION='published-crown-repair/v1' as const,ACTION='generation:published-crown-repair/v1',STATE_ACTION='generation:published-crown-repair-state/v1';
const pinId=(id:string)=>'aud_published_crown_'+hash(id),stateId=(id:string)=>'aud_published_crown_state_'+hash(id);
const demand=(v:unknown,why:string):void=>{if(!v)throw Error('PUBLISHED_CROWN: '+why);};
const digest=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[A-Za-z0-9_:-]{1,240}$/);
const binding=z.object({gameId:id,sceneVersion:z.literal(13),hideId:id,variantId:id,attempts:z.number().int().min(1).max(3),identityAssetId:id,
 identitySha256:digest,assetId:id,imageSha256:digest,geometrySha256:digest,judgeJson:z.string().min(1)}).strict();
const geometry=z.object({rectJson:z.string().min(1).max(2000),hitRectJson:z.string().min(1).max(2000),headAnchorJson:z.string().min(1).max(2000)}).strict();
const selected=z.object({hideId:id,boardId:id,targetId:id,sceneId:id,rowId:id,targetInstanceId:id,attempt:z.number().int().min(1).max(3),
 candidateAssetId:id,candidateImageSha256:digest,candidateGeometry:geometry,correction:sourceCrownCorrectionSchema,originalInput:binding}).strict();
const schema=z.object({version:z.literal(VERSION),gameId:id,operatorId:id,ownerId:id,identityAssetId:id,identitySha256:digest,ageYears:z.number().int().min(1).max(18),
 worldCapMicroUsd:z.literal(4000000),automaticBudgetExtension:z.literal(false),originalConfigSha256:digest,jobStateSha256:digest,
 selected:z.array(selected).length(2),protectedRows:z.array(z.object({rowId:id,rowSha256:digest}).strict()).length(25),createdAt:z.string().datetime(),authorizationSha256:digest}).strict();
type Pin=z.infer<typeof schema>;
const stateSchema=z.object({version:z.literal(VERSION),authorizationSha256:digest,phase:z.enum(['staged','blocked','committed']),reason:z.string().max(1000).nullable(),configSha256:digest.nullable()}).strict();
const jobHash=(j:{id:string;status:string;attempts:number;currentStep:string|null;lastError:string|null})=>hash([j.id,j.status,j.attempts,j.currentStep,j.lastError]);
const rowsOf=(db:Prisma.TransactionClient,gameId:string)=>db.targetVariantAsset.findMany({where:{variant:'A',targetInstance:{gameScene:{gameId}}},orderBy:{id:'asc'}});

async function stateOf(db:Prisma.TransactionClient,p:Pin){
 const a=await db.auditLog.findUnique({where:{id:stateId(p.gameId)}}),s=stateSchema.safeParse(JSON.parse(a?.metaJson??'null'));
 return a?.actorType==='SYSTEM'&&a.actorId===null&&a.action===STATE_ACTION&&a.entityType==='Game'&&a.entityId===p.gameId&&s.success&&s.data.authorizationSha256===p.authorizationSha256?s.data:null;
}
async function stateWrite(db:Prisma.TransactionClient,p:Pin,phase:'staged'|'blocked'|'committed',reason:string|null=null,configSha256:string|null=null){
 const metaJson=JSON.stringify(stateSchema.parse({version:VERSION,authorizationSha256:p.authorizationSha256,phase,reason,configSha256}));
 await db.auditLog.upsert({where:{id:stateId(p.gameId)},update:{metaJson},create:{id:stateId(p.gameId),actorType:'SYSTEM',action:STATE_ACTION,entityType:'Game',entityId:p.gameId,metaJson}});
}
export async function publishedCrownRepairOf(db:Prisma.TransactionClient,gameId:string,sceneId?:string){
 if(env().APP_ENV!=="qa")return null;
 const a=await db.auditLog.findUnique({where:{id:pinId(gameId)}});if(!a)return null;
 try{const p=schema.parse(JSON.parse(a.metaJson??'null')),{authorizationSha256,...body}=p;
  if(env().APP_ENV!=='qa'||a.actorType!=='ADMIN'||a.actorId!==p.operatorId||a.entityType!=='Game'||a.entityId!==gameId||a.action!==ACTION
   ||p.gameId!==gameId||p.operatorId!==p.ownerId||hash(body)!==authorizationSha256
   ||!SOURCE_CROWN_RETURN_CONTRACTS.every(c=>p.selected.some(s=>s.hideId===c.hideId&&s.boardId===c.boardId&&s.correction.contractSha256===hash(c)))
   ||new Set(p.selected.map(s=>s.rowId)).size!==2||new Set(p.protectedRows.map(s=>s.rowId)).size!==25||p.selected.some(s=>p.protectedRows.some(r=>r.rowId===s.rowId))
   ||sceneId!==undefined&&!p.selected.some(s=>s.sceneId===sceneId))return null;
  const authority=await singleLowReviewAuthorization(db,gameId),game=await db.game.findUnique({where:{id:gameId},include:{childProfile:true,scenes:true,orders:true}}),child=game?.childProfile;
  if(authority?.kind!=='from-birth'||authority.sceneVersion!==13||authority.identitySha256!==p.identitySha256
   ||!game||game.deletedAt||game.ownerId!==p.ownerId||!['READY','DELIVERED'].includes(game.status)||game.styleVersion!=='local-patch-world-v1'
   ||!child||child.deletedAt||child.ownerId!==p.ownerId||child.identityAssetId!==p.identityAssetId||child.ageYears!==p.ageYears
   ||game.scenes.length!==9||game.scenes.some(s=>s.sceneVersion!==13)
   ||!game.orders.some(o=>o.userId===p.ownerId&&o.paymentStatus==='PAID'&&o.paidAt&&!o.refundedAt)||game.orders.some(o=>o.refundedAt||o.paymentStatus==='REFUNDED'))return null;
  const state=await stateOf(db,p);if(!state||sha(Buffer.from(game.configJson??''))!==(state.phase==='committed'?state.configSha256:p.originalConfigSha256))return null;
  return{pin:p,state,game,child};
 }catch{return null;}
}

/** Reviewable software plan. Exactly two diagnosed public-source windows, no
 * purchases, source restoration, new identity, job reset or art approval. */
export async function planPublishedCrownRepair(c:Container,gameId:string){
 demand(env().APP_ENV==='qa'&&c.storage.id==='db','durable QA required');demand(!await c.db.auditLog.findUnique({where:{id:pinId(gameId)}}),'one repair only');
 const plans:SourceCrownPlan[]=[];for(const contract of SOURCE_CROWN_RETURN_CONTRACTS){const p=await planSourceCrownCandidate(c,gameId,contract.hideId);demand(p,'exact retained RAW must reproduce the published crop');if(p)plans.push(p);}
 const first=plans[0]!,{game}=first;demand(['READY','DELIVERED'].includes(game.status)&&game.configJson&&game.ownerId,'a delivered complete world required');
 const rows=await rowsOf(c.db,gameId);demand(rows.length===27&&rows.every(r=>r.status==='GENERATED'),'all 27 original decisions required');
 for(const p of plans){const j=JSON.parse(p.row.judgeJson!),proof=j.boardReview?.dual;demand(proof?.single===SINGLE_VISUAL_REVIEW_VERSION&&proof.quality?.policy.effort==='low','original LOW false-pass lineage required');
  demand(await hasLocalPatchPublicationPolicy(c,p.originalInput),'old receipt must be genuine evidence, not a claimed pass');}
 const job=await c.db.generationJob.findUniqueOrThrow({where:{id:'job_'+gameId}});demand(job.status==='DONE'&&job.currentStep===null,'generation must already be finished');
 const budget=await boardWizardBudgetOf(c).audit(gameId+':board-wizard');demand(budget.capMicroUsd===4000000&&!budget.held&&!budget.pendingRequestKeys.length&&!budget.conflictRequestKeys.length&&!budget.overrunRequestKeys.length,'original four-dollar accounting must remain intact');
 const body={version:VERSION,gameId,operatorId:game.ownerId!,ownerId:game.ownerId!,identityAssetId:first.identity.id,identitySha256:first.authority.identitySha256,ageYears:game.childProfile!.ageYears!,
  worldCapMicroUsd:4000000 as const,automaticBudgetExtension:false as const,originalConfigSha256:sha(Buffer.from(game.configJson!)),jobStateSha256:jobHash(job),
  selected:plans.map(p=>({hideId:p.hide.id,boardId:p.scene.sceneSlug,targetId:p.hide.targetId,sceneId:p.scene.id,rowId:p.row.id,targetInstanceId:p.row.targetInstanceId,attempt:p.row.attempts,
   candidateAssetId:p.assetId,candidateImageSha256:p.correction.imageSha256,candidateGeometry:p.geometry,correction:p.correction,originalInput:{...p.originalInput,sceneVersion:13 as const}})),
  protectedRows:rows.filter(r=>!plans.some(p=>p.row.id===r.id)).map(r=>({rowId:r.id,rowSha256:sourceCrownRowHash(r)})),createdAt:new Date().toISOString()};
 const pin=schema.parse({...body,authorizationSha256:hash(body)});
 // The plan shown in the form excludes its clock, so re-reading an unchanged
 // plan does not invalidate the submit. The immutable saved pin keeps it.
 const {createdAt:_clock,...stable}=body;return{pin,plans,planSha256:hash(stable),remainingMicroUsd:budget.remainingMicroUsd};
}
export async function stagePublishedCrownRepair(c:Container,input:{gameId:string;operatorId:string;expectedPlanSha256:string}){
 const prior=await publishedCrownRepairOf(c.db,input.gameId);if(prior){const {authorizationSha256,createdAt:_clock,...stable}=prior.pin;demand(prior.pin.operatorId===input.operatorId&&hash(stable)===input.expectedPlanSha256,"idempotent replay requires the same authenticated owner and original software plan");return authorizationSha256;}
 const p=await planPublishedCrownRepair(c,input.gameId);demand(p.pin.operatorId===input.operatorId&&p.planSha256===input.expectedPlanSha256,'owner and displayed software plan must match');
 await ensureSingleMediumReviewPolicy(c,input.gameId,async()=>{});
 await c.db.$transaction(async tx=>{await fenceLocalPatchImages(tx,input.gameId);
  const game=await tx.game.findUniqueOrThrow({where:{id:input.gameId}}),job=await tx.generationJob.findUniqueOrThrow({where:{id:'job_'+input.gameId}}),rows=await rowsOf(tx,input.gameId);
  demand(game.ownerId===input.operatorId&&['READY','DELIVERED'].includes(game.status)&&sha(Buffer.from(game.configJson??''))===p.pin.originalConfigSha256&&jobHash(job)===p.pin.jobStateSha256,'publication changed before staging');
  demand(rows.length===27&&p.pin.protectedRows.every(s=>rows.some(r=>r.id===s.rowId&&sourceCrownRowHash(r)===s.rowSha256)),'unchanged siblings must remain exact');
  await tx.auditLog.create({data:{id:pinId(input.gameId),actorType:'ADMIN',actorId:input.operatorId,action:ACTION,entityType:'Game',entityId:input.gameId,metaJson:JSON.stringify(p.pin)}});
  await stateWrite(tx,p.pin,'staged');for(const candidate of p.plans)await commitSourceCrownCandidate(tx,candidate);
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});return p.pin.authorizationSha256;
}

export type CrownSubjectAnchor={version:'crown-unchanged-face-anchor/v1';repairSha256:string;sourceAssetId:string;sourceImageSha256:string;sourceSubjectFingerprint:string;sourceSubjectRawSha256:string;unchangedBelowTop:number;sourceCrop:{left:number;top:number;width:number;height:number};referencePngSha256:string};
/** A privacy-preserving evidence anchor after normal photo deletion. The exact
 * old source-approved target is compared again; it is explicitly NOT a photo
 * or a transferred acceptance of new pixels. RAW/core equality is mandatory. */
export async function publishedCrownSubjectAnchor(c:Pick<Container,'db'|'storage'>,gameId:string,hideId:string,upgrade:SubjectUpgradeReceipt){
 const live=await publishedCrownRepairOf(c.db,gameId);if(!live||live.state.phase!=='staged')return null;
 const s=live.pin.selected.find(s=>s.hideId===hideId);if(!s||upgrade.identityAssetId!==live.pin.identityAssetId||upgrade.identitySha256!==live.pin.identitySha256||upgrade.ageYears!==live.pin.ageYears)return null;
 const row=await c.db.targetVariantAsset.findUnique({where:{id:s.rowId}});if(!row||row.assetId!==s.candidateAssetId||row.attempts!==s.attempt)return null;
 if(!await sourceCrownCompositionMatches(c.db,{gameId,hideId,sceneVersion:13,variantId:row.id,assetId:row.assetId,identitySha256:live.pin.identitySha256,judgeJson:row.judgeJson}))return null;
 if(!await allowedDualPublication(c.db,s.originalInput))return null;
 const j=JSON.parse(s.originalInput.judgeJson),subject=j.boardReview.dual.subject,plan=subjectPlanOfHide(hideId,13);if(!plan)return null;
 const reading=readSubjectAnswerV2(subjectStageRaw(subject),{hideId,ageYears:live.pin.ageYears,plan});
 if(!reading.ok||reading.disposition!=='pass'||subject.photoSha256!==upgrade.photoSha256)return null;
 const asset=await c.db.asset.findUnique({where:{id:s.originalInput.assetId}});if(!asset||asset.ownerId!==live.pin.ownerId||asset.providerRequestId!==gameId||asset.status!=='READY'||asset.deletedAt)return null;
 const bytes=await c.storage.get(asset.storagePath);if(sha(bytes)!==s.originalInput.imageSha256)return null;
 const sourceCrop=JSON.parse(s.originalInput.judgeJson).authoredReturn.child;const reference=await sharp(bytes,{limitInputPixels:8294400}).extract(sourceCrop).png().toBuffer();
 const anchor:CrownSubjectAnchor={version:'crown-unchanged-face-anchor/v1',repairSha256:live.pin.authorizationSha256,sourceAssetId:asset.id,sourceImageSha256:sha(bytes),sourceSubjectFingerprint:subject.fingerprint,
  sourceSubjectRawSha256:sha(Buffer.from(subject.raw)),unchangedBelowTop:s.correction.unchangedBelowTop,sourceCrop,referencePngSha256:sha(reference)};
 return{anchor,bytes:reference};
}
export async function publishedCrownSubjectAnchorMatches(db:Prisma.TransactionClient,gameId:string,hideId:string,anchor:CrownSubjectAnchor,upgrade:SubjectUpgradeReceipt){
 const live=await publishedCrownRepairOf(db,gameId);if(!live)return false;const s=live.pin.selected.find(s=>s.hideId===hideId);if(!s)return false;
 const j=JSON.parse(s.originalInput.judgeJson),subject=j.boardReview.dual.subject,plan=subjectPlanOfHide(hideId,13);if(!plan)return false;
 const oldAsset=await db.asset.findUnique({where:{id:s.originalInput.assetId}}),oldBlob=oldAsset?await db.fileBlob.findUnique({where:{key:oldAsset.storagePath}}):null;
 if(!oldAsset||oldAsset.ownerId!==live.pin.ownerId||oldAsset.providerRequestId!==gameId||oldAsset.deletedAt||oldAsset.status!=="READY"||!oldBlob||sha(Buffer.from(oldBlob.data))!==s.originalInput.imageSha256)return false;
 const sourceCrop=j.authoredReturn.child,reference=await sharp(Buffer.from(oldBlob.data),{limitInputPixels:8294400}).extract(sourceCrop).png().toBuffer();
 const expected:CrownSubjectAnchor={version:'crown-unchanged-face-anchor/v1',repairSha256:live.pin.authorizationSha256,sourceAssetId:s.originalInput.assetId,sourceImageSha256:s.originalInput.imageSha256,
  sourceSubjectFingerprint:subject.fingerprint,sourceSubjectRawSha256:sha(Buffer.from(subject.raw)),unchangedBelowTop:s.correction.unchangedBelowTop,sourceCrop,referencePngSha256:sha(reference)};
 const reading=readSubjectAnswerV2(subjectStageRaw(subject),{hideId,ageYears:live.pin.ageYears,plan});
 return hash(anchor)===hash(expected)&&reading.ok&&reading.disposition==='pass'&&subject.photoSha256===upgrade.photoSha256&&await allowedDualPublication(db,s.originalInput);
}

export async function nextPublishedCrownRepair(c:Container,requestedGameId:string|null){
 if(env().APP_ENV!=='qa'||c.storage.id!=='db')return null;
 const audits=await c.db.auditLog.findMany({where:{action:STATE_ACTION,entityType:'Game',...(requestedGameId?{entityId:requestedGameId}:{}),metaJson:{contains:'"phase":"staged"'}},orderBy:{createdAt:'asc'},take:4});
 for(const a of audits){const live=await publishedCrownRepairOf(c.db,a.entityId);if(live?.state.phase==='staged')return a.entityId;}return null;
}
async function crownFence(db:Prisma.TransactionClient,p:Pin){
 await fenceLocalPatchImages(db,p.gameId);const live=await publishedCrownRepairOf(db,p.gameId),job=await db.generationJob.findUnique({where:{id:'job_'+p.gameId}});
 demand(live?.state.phase==='staged'&&live.pin.authorizationSha256===p.authorizationSha256&&job&&jobHash(job)===p.jobStateSha256,'repair fence changed');
 const rows=await rowsOf(db,p.gameId);demand(rows.length===27&&p.protectedRows.every(s=>rows.some(r=>r.id===s.rowId&&sourceCrownRowHash(r)===s.rowSha256)),'a protected sibling changed');
}
/** Larger exact temporary reservations run first, while the original
 * allowance is largest. Completed bills release only their real unused bound.
 * A question already pending always drains first; never reserve both at once. */
export async function publishedCrownReviewOrder(c:Container,p:Pin){
 const pending=new Set((await boardWizardBudgetOf(c).audit(p.gameId+":board-wizard")).pendingRequestKeys);
 const planned=[];
 for(const s of p.selected){
  const row=await c.db.targetVariantAsset.findUniqueOrThrow({where:{id:s.rowId}});
  const input:LocalPatchPublicationBinding={gameId:p.gameId,sceneVersion:13,hideId:s.hideId,variantId:row.id,attempts:row.attempts,identityAssetId:p.identityAssetId,identitySha256:p.identitySha256,assetId:row.assetId!,imageSha256:s.candidateImageSha256,geometrySha256:localPatchPublicationGeometryHash(row),judgeJson:row.judgeJson};
  if(await hasLocalPatchPublicationPolicy(c,input))continue;
  const ready=await prepareLocalPatchBoardReview(c,{gameId:p.gameId,sceneId:s.sceneId},{},{playerReview:true,includePlayerCandidates:true,skipApprovedEvidence:true});
  if(!ready.ready){planned.push({selection:s,requestKey:null,reserveMicroUsd:0,pending:false});continue;}
  const exact=await(await import("./local-patch-dual-review")).prospectiveSingleVisualReviewQuestion(c,ready);
  demand(exact.singleVersion==="single-sol-medium/v1","the corrected pixels require one prospective MEDIUM question");
  planned.push({selection:s,...exact,pending:pending.has(exact.requestKey)});
 }
 return planned.sort((a,b)=>Number(b.pending)-Number(a.pending)||b.reserveMicroUsd-a.reserveMicroUsd||a.selection.hideId.localeCompare(b.selection.hideId));
}
export async function tickPublishedCrownRepair(c:Container,gameId:string,deadlineAt:number){
 const live=await publishedCrownRepairOf(c.db,gameId);if(!live||live.state.phase!=='staged')return{gameId,status:live?.game.status??null,pending:false};const p=live.pin;
 await advanceContinuityInBackground(c,gameId,{deadlineAt:deadlineAt-20000});
 const order=await publishedCrownReviewOrder(c,p);
 for(const {selection:s} of order){
  const row=await c.db.targetVariantAsset.findUniqueOrThrow({where:{id:s.rowId}});
  const input:LocalPatchPublicationBinding={gameId,sceneVersion:13,hideId:s.hideId,variantId:row.id,attempts:row.attempts,identityAssetId:p.identityAssetId,identitySha256:p.identitySha256,
   assetId:row.assetId!,imageSha256:s.candidateImageSha256,geometrySha256:localPatchPublicationGeometryHash(row),judgeJson:row.judgeJson};
  if(await hasLocalPatchPublicationPolicy(c,input))continue;
  if(row.status==='FAILED'){await stateWrite(c.db,p,'blocked',row.lastError??'Fresh MEDIUM review refused the corrected composition');return{gameId,status:live.game.status,pending:false,attention:'Corrected crown composition did not pass its fresh automatic review'};}
  let reviewed;try{reviewed=await reviewLocalPatchBoard(c,{gameId,sceneId:s.sceneId,deadlineAt},{fence:tx=>crownFence(tx,p)});}catch(error){if(!(error instanceof WorldBudgetError)||!['cap_exceeded','world_held'].includes(error.code))throw error;await stateWrite(c.db,p,'blocked','The exact MEDIUM request cannot fit the remaining original four-dollar budget; no request was sent');return{gameId,status:live.game.status,pending:false,attention:'Crown repair cannot buy its next exact question within the existing cap'};}
  if(reviewed.state==='pending'&&['Retained image awaits the current head-safe compositor','No ready appearance awaits review','Usable patches are not ready'].includes(reviewed.reason??'')){await stateWrite(c.db,p,'blocked',reviewed.reason);return{gameId,status:live.game.status,pending:false,attention:reviewed.reason??'Crown candidate is not eligible for automatic review'};}
  if(reviewed.state==='blocked'||reviewed.state==='retry'||reviewed.state==='held'){await stateWrite(c.db,p,'blocked',reviewed.reason);return{gameId,status:live.game.status,pending:false,attention:reviewed.reason??'Crown repair cannot continue within its original authority'};}
  // Sequential admission keeps the actual remaining cap authoritative; no
  // speculative second reservation or arbitrary smaller reserve is made.
  return{gameId,status:live.game.status,pending:true,...(reviewed.reason?{attention:reviewed.reason}:{})};
 }
 await c.db.$transaction(async tx=>{await crownFence(tx,p);const current=await tx.game.findUniqueOrThrow({where:{id:gameId}}),config=parseGameConfig(current.configJson!);
  for(const s of p.selected){const row=await tx.targetVariantAsset.findUniqueOrThrow({where:{id:s.rowId}}),asset=await tx.asset.findUniqueOrThrow({where:{id:s.candidateAssetId}});
   demand(row.assetId===asset.id&&row.status==='GENERATED'&&localPatchPublicationGeometryHash(row)===localPatchPublicationGeometryHash(s.candidateGeometry),'reviewed candidate changed');
   demand(await hasLocalPatchPublicationPolicy({db:tx as Container['db']},{gameId,sceneVersion:13,hideId:s.hideId,variantId:row.id,attempts:row.attempts,identityAssetId:p.identityAssetId,identitySha256:p.identitySha256,assetId:asset.id,imageSha256:s.candidateImageSha256,geometrySha256:localPatchPublicationGeometryHash(row),judgeJson:row.judgeJson}),'fresh MEDIUM publication proof required');
   const scene=config.scenes.find(scene=>scene.slug===s.boardId),target=scene?.targets.find(target=>target.id===s.targetId);demand(target,'original scene and target identities must remain');
   const sprite=SpriteRefSchema.parse({kind:'image',url:signedAssetUrl(c,asset.id),width:512,height:768,rect:JSON.parse(row.rectJson!),hitRect:JSON.parse(row.hitRectJson!),anchor:JSON.parse(row.headAnchorJson!)});
   if(target){target.sprite=sprite;target.spriteByVariant={A:sprite,B:sprite};}
   const bookBoard=config.adventure?.boards.find(board=>board.boardSlug===s.boardId),bookImage=bookBoard?.targetImages.find(image=>image.targetId===s.targetId),bound=bindBookImage(sprite);
   demand(bookImage&&bound,"the earned passport keeps the same target with its corrected image binding");if(bookImage&&bound){bookImage.A=bound;bookImage.B=bound;}
  }
  const checked=GameConfigSchema.parse(config);demand(checked.scenes.length===9&&checked.scenes.every(s=>s.targets.length===3),'all 27 appearances remain required');
  const configJson=JSON.stringify(checked);for(const scene of checked.scenes.filter(scene=>p.selected.some(s=>s.boardId===scene.slug)))await tx.gameScene.update({where:{gameId_sceneSlug:{gameId,sceneSlug:scene.slug}},data:{configJson:JSON.stringify(scene)}});
  await tx.game.update({where:{id:gameId},data:{configJson}});await stateWrite(tx,p,'committed',null,sha(Buffer.from(configJson)));
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:120000});
 return{gameId,status:live.game.status,pending:false};
}

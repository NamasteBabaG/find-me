import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { detectivePlacementFamily } from '../../../content/detectives/family-releases';
import { DETECTIVE_FAMILIES, type DetectiveWorld } from '../../../content/detectives/families';
import { sourcePlacementCanonical as canonical, sourcePlacementSha256 as hash } from '../../domain/scene/source-placement-release';
import { DETECTIVES_OPERATIONAL_RELEASE } from '../../domain/generation/detectives-operational-policy';
import { pinDetectivesOperationalPolicy, detectivesOperationalPolicyOf } from './detectives-operational-policy';
import { leanReleaseOf, LOCAL_PATCH_LEAN_RELEASE, leanReleaseAuditId } from './lean-release';
import { dualVisualReviewVersion, DUAL_VISUAL_REVIEW_V3 } from './visual-review-release';
import { identitySourceReleaseOf, IDENTITY_SOURCE_RELEASE, identitySourceAuditId } from './identity-source-release';
import { env } from '../../lib/env';
import { createHash } from 'node:crypto';

type Reader=Pick<Prisma.TransactionClient,'auditLog'>;
const demand=(v:unknown,why:string):void=>{if(!v)throw Error('SOURCE_FAMILY_SCOPE: '+why);};
const hex=z.string().regex(/^[a-f0-9]{64}$/), world=z.enum(['journey','kingdom']);
export const DETECTIVE_FAMILY_V2='local-patch-source-family/v2' as const;
export const detectiveScopeId=(gameId:string)=>'aud_source_scope_'+gameId;
const familyId=z.enum(['journey-detectives/v1','kingdom-detectives/v1']);
const sourceFields={familyId,worldSlug:world,releaseId:z.string(),manifestSha256:hex,sourceInputSha256:hex,runtimeCatalogSha256:hex,identityStyleSha256:hex};
const basePins={leanPinSha256:hex,dualPinSha256:hex,identityPinSha256:hex};
const scopeSchema=z.object({version:z.literal('local-patch-source-scope/v1'),gameId:z.string(),searchLevel:z.literal('detectives'),baseSceneVersion:z.literal(13),
  families:z.array(z.object(sourceFields).strict()).length(2),...basePins,
  operationalRelease:z.literal(DETECTIVES_OPERATIONAL_RELEASE),storageId:z.literal('db'),scopeSha256:hex}).strict();
export const detectiveFamilyV2Schema=z.object({version:z.literal(DETECTIVE_FAMILY_V2),gameId:z.string(),...sourceFields,
  searchLevel:z.literal('detectives'),baseSceneVersion:z.literal(13),...basePins,scopeSha256:hex,compositeQualificationSha256:hex,
  coverage:z.array(z.object({boardId:z.string(),hideId:z.string(),contractSha256:hex}).strict()).length(27)}).strict();
export type DetectiveFamilyV2Pin=z.infer<typeof detectiveFamilyV2Schema>;
function catalogEntry(w:DetectiveWorld){const f=detectivePlacementFamily(w);return {familyId:f.familyId,worldSlug:f.worldSlug,releaseId:f.releaseId,
  manifestSha256:f.manifestSha256,sourceInputSha256:f.sourceInputSha256,runtimeCatalogSha256:f.runtimeCatalogSha256,identityStyleSha256:f.identityStyleSha256};}
async function originalPins(db:Reader,gameId:string){
  demand(await leanReleaseOf(db,gameId)===LOCAL_PATCH_LEAN_RELEASE && await dualVisualReviewVersion(db,gameId)===DUAL_VISUAL_REVIEW_V3
    && await identitySourceReleaseOf(db,gameId)===IDENTITY_SOURCE_RELEASE,'exact original base policies required');
  const ids=[leanReleaseAuditId(gameId),'aud_visual_policy_'+gameId,identitySourceAuditId(gameId)];
  const rows=await Promise.all(ids.map(id=>db.auditLog.findUnique({where:{id}})));
  const bytes=rows.map(r=>{demand(r?.metaJson,'missing authenticated policy');return createHash('sha256').update(r!.metaJson!).digest('hex');});
  return {leanPinSha256:bytes[0]!,dualPinSha256:bytes[1]!,identityPinSha256:bytes[2]!};
}
async function expectedScope(db:Reader,gameId:string){const body={version:'local-patch-source-scope/v1' as const,gameId,searchLevel:'detectives' as const,baseSceneVersion:13 as const,
  families:DETECTIVE_FAMILIES.map(f=>catalogEntry(f.worldSlug)),...await originalPins(db,gameId),operationalRelease:DETECTIVES_OPERATIONAL_RELEASE,storageId:'db' as const};
  return scopeSchema.parse({...body,scopeSha256:hash(body)});}
function authentic(row:{actorType:string;actorId:string|null;action:string;entityType:string;entityId:string|null;metaJson:string|null},gameId:string,action:string){
  demand(row.actorType==='SYSTEM'&&row.actorId===null&&row.action===action&&row.entityType==='Game'&&row.entityId===gameId,'foreign policy record');}
export async function detectiveSourceScopeOf(db:Reader,gameId:string){const row=await db.auditLog.findUnique({where:{id:detectiveScopeId(gameId)}});if(!row)return null;
  authentic(row,gameId,'generation:source-family-scope/v1');const value=scopeSchema.parse(JSON.parse(row.metaJson??'null')),expected=await expectedScope(db,gameId);
  demand(row.metaJson===canonical(expected)&&canonical(value)===canonical(expected),'changed source scope');return Object.freeze(expected);}
/** Immutable choices authorized before the photo; world selection happens later. */
export async function pinDetectiveSourceScope(tx:Prisma.TransactionClient,gameId:string,release:typeof DETECTIVES_OPERATIONAL_RELEASE|undefined,storageId:string){
  if(release===undefined)return false;const e=env();
  demand(release===DETECTIVES_OPERATIONAL_RELEASE&&storageId==='db'&&e.APP_ENV==='qa'&&e.LOCAL_PATCH_PROMPT_RELEASE==='v19'&&e.LOCAL_PATCH_IDENTITY_SOURCE==='full-source-v1','qualified new-draft configuration required');
  const game=await tx.game.findUniqueOrThrow({where:{id:gameId},include:{childProfile:true}});
  demand(game.status==='DRAFT'&&game.styleVersion==='local-patch-world-v1'&&game.searchLevel==='detectives'&&!game.deletedAt&&!game.paidAt&&!game.readyAt&&!game.configJson&&!game.childProfile?.originalPhotoAssetId&&!game.childProfile?.identityAssetId&&!game.childProfile?.avatarAssetId,'scope is prospective before the photo');
  demand(!await tx.order.findFirst({where:{gameId}})&&!await tx.generationJob.findFirst({where:{gameId}})
    &&!await tx.worldBudgetLedger.findUnique({where:{worldId:gameId+':board-wizard'}})
    &&!await tx.auditLog.findUnique({where:{id:'aud_source_family_'+gameId}})&&!await tx.auditLog.findUnique({where:{id:'aud_source_placement_'+gameId}}),'existing work cannot gain scope');
  const receipt=await expectedScope(tx,gameId),metaJson=canonical(receipt);
  const row=await tx.auditLog.upsert({where:{id:detectiveScopeId(gameId)},update:{},create:{id:detectiveScopeId(gameId),actorType:'SYSTEM',action:'generation:source-family-scope/v1',entityType:'Game',entityId:gameId,metaJson}});
  demand(row.metaJson===metaJson,'conflicting source scope');await detectiveSourceScopeOf(tx,gameId);return true;
}
async function expectedBinding(db:Reader,gameId:string,w:DetectiveWorld){const scope=await detectiveSourceScopeOf(db,gameId);demand(scope,'scope missing');
  const f=detectivePlacementFamily(w),choice=catalogEntry(w);demand(scope!.families.some(c=>canonical(c)===canonical(choice)),'family was not authorized before photo');
  const data={version:DETECTIVE_FAMILY_V2,gameId,...choice,searchLevel:'detectives' as const,baseSceneVersion:13 as const,...await originalPins(db,gameId),scopeSha256:scope!.scopeSha256,
    coverage:f.manifest.inventory.map(e=>({boardId:e.boardId,hideId:e.hideId,contractSha256:e.sourceNeighbors!.contractSha256}))};
  return detectiveFamilyV2Schema.parse({...data,compositeQualificationSha256:hash({...data,qualification:f.manifest.qualification})});}
export async function detectiveFamilyV2Of(db:Reader,gameId:string){const row=await db.auditLog.findUnique({where:{id:'aud_source_family_'+gameId}});demand(row,'binding missing');
  authentic(row!,gameId,'generation:source-family-policy');const p=detectiveFamilyV2Schema.parse(JSON.parse(row!.metaJson??'null')),expected=await expectedBinding(db,gameId,p.worldSlug);
  demand(row!.metaJson===canonical(expected),'foreign or changed family binding');return Object.freeze(expected);}
export function detectiveSelectionWorld(scenes:readonly {sceneSlug:string;sceneVersion:number}[],whole=false):DetectiveWorld|null {
  if(!scenes.length||scenes.some(s=>s.sceneVersion!==13)||new Set(scenes.map(s=>s.sceneSlug)).size!==scenes.length)return null;
  const family=DETECTIVE_FAMILIES.find(f=>scenes.every(s=>f.boards.some(b=>b.board===s.sceneSlug))&&(!whole||scenes.length===f.boards.length));
  return family?.worldSlug??null;
}
/** Called inside the checkout Game write fence, before an order can be created.
 * Failure rolls back the family and operational policy together with the claim.
 */
export async function sealDetectiveSourceFamily(tx:Prisma.TransactionClient,gameId:string){const scope=await detectiveSourceScopeOf(tx,gameId);if(!scope)return;
  const game=await tx.game.findUniqueOrThrow({where:{id:gameId},include:{scenes:true,childProfile:true}}),w=detectiveSelectionWorld(game.scenes,true);
  demand(w&&game.searchLevel==='detectives'&&game.styleVersion==='local-patch-world-v1'&&!game.deletedAt,'exact whole selected family required');
  const old=await tx.auditLog.findUnique({where:{id:'aud_source_family_'+gameId}});
  if(old){const pin=await detectiveFamilyV2Of(tx,gameId);demand(pin.worldSlug===w,'sealed family cannot switch worlds');demand(await detectivesOperationalPolicyOf(tx,gameId),'sealed operational policy missing');return;}
  demand(['PACKAGE_SELECTED','CHECKOUT_PENDING','PAYMENT_FAILED'].includes(game.status)&&!game.paidAt&&!game.readyAt&&!game.configJson
    &&game.childProfile&&!game.childProfile.deletedAt&&game.childProfile.ownerId===game.ownerId&&game.childProfile.originalPhotoAssetId
    &&!game.childProfile.identityAssetId&&!game.childProfile.avatarAssetId,'bind after the source photo and before identity generation');
  demand(!await tx.order.findFirst({where:{gameId}})&&!await tx.generationJob.findFirst({where:{gameId}})
    &&!await tx.targetVariantAsset.findFirst({where:{targetInstance:{gameScene:{gameId}},attempts:{gt:0}}})
    &&!await tx.worldBudgetLedger.findUnique({where:{worldId:gameId+':board-wizard'}}),'cannot seal after paid work or an order');
  const pin=await expectedBinding(tx,gameId,w!);
  await tx.auditLog.create({data:{id:'aud_source_family_'+gameId,actorType:'SYSTEM',action:'generation:source-family-policy',entityType:'Game',entityId:gameId,metaJson:canonical(pin)}});
  await pinDetectivesOperationalPolicy(tx,gameId,scope.operationalRelease,scope.storageId,true);
}

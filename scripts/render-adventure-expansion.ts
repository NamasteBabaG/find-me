/** Explicit bounded local v9 runs, reusing the family-tested Bar identity.
 * One board at a time, retained purchases, separate immutable attempt keys.
 * Does not publish, seed a game, or alter existing games or renderer policy. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {PrismaClient} from '@prisma/client';
import {LocalPatchBoardSchema,assertPlaceable} from '../src/domain/scene/local-patch-hides';
import {ReadyAdventureBoardSchema} from '../src/domain/adventure/content';
import {applyTestSchema} from '../src/lib/test-schema';
import {PrismaWorldBudgetStore} from '../src/infra/db/prisma-world-budget-store';
import {CasWorldBudgetRepository} from '../src/infra/db/world-budget-repository';
import {PrismaRetainedPurchaseStore} from '../src/infra/db/prisma-retained-purchase-store';
import {WorldBudget,WorldBudgetError,auditWorldBudget,type WorldBudgetRepository} from '../src/services/generation/world-budget';
import {renderLocalPatchHide} from '../src/services/generation/local-patch-render';
import {buyLocalPatch,localPatchImagePolicyForVersion,localPatchRenderPolicySha256,LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE} from '../src/infra/generation/openai-local-patch';
import type {LocalPatchRepairCheck} from '../src/services/generation/local-patch-prompt';
const WORLD='adventure-bar-expansion-20260914-v1',CAP=3_000_000;
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
async function main(){
 const [slug,phase='--dry-run',target]=process.argv.slice(2);
 if(phase!=='--dry-run'&&existsSync('content/adventures/expansion/review-status.json'))throw Error('PAUSED: parent board feedback required before any more personal rendering');
 if(!slug||!['paris','marrakech','tokyo','greatwall','sydney','antarctica','amazon-size'].includes(slug)||!['--dry-run','--render','--repair'].includes(phase))throw Error('Choose a frozen expansion board and explicit phase');
 if(phase==='--repair'&&!target)throw Error('A repair requires exactly one hide id');
 const raw=JSON.parse(readFileSync(`content/adventures/expansion/${slug}.json`,'utf8'));
 const board=LocalPatchBoardSchema.parse(raw.patchBoard),plan=ReadyAdventureBoardSchema.parse(raw.plan);
 const art=readFileSync(board.art),meta=await sharp(art).metadata();
 if(hash(art)!==plan.art.sha256||meta.width!==3840||meta.height!==2160)throw Error('Unapproved art');
 assertPlaceable(board,{width:3840,height:2160});
 const prior='storage/adventure-bar-20260914';
 const identityReview=JSON.parse(readFileSync(`${prior}/identity-review.json`,'utf8'));
 if(!identityReview.accepted||identityReview.identitySha256!==hash(readFileSync(`${prior}/identity.png`)))throw Error('Prior approved identity changed');
 const identity=readFileSync(`${prior}/identity-normalized.png`),dir=path.resolve('storage/adventure-bar-expansion-20260914');mkdirSync(dir,{recursive:true});
 const policy=localPatchImagePolicyForVersion(9),policyHash=localPatchRenderPolicySha256(policy);
 const serialized=JSON.stringify({version:WORLD,board,plan,identitySha256:hash(identity),policyHash,ageYears:5},null,2);
 const inputFile=path.join(dir,`${slug}-inputs.json`);
 if(existsSync(inputFile)&&readFileSync(inputFile,'utf8')!==serialized)throw Error('Frozen board inputs changed');
 writeFileSync(inputFile,serialized);
 if(phase==='--dry-run'){console.log(JSON.stringify({slug,hides:board.hides.length,paidCalls:0}));return;}
 const key=process.env.OPENAI_API_KEY;if(!key)throw Error('Load the existing key securely');
 const dbPath=path.join(dir,'purchases.sqlite'),fresh=!existsSync(dbPath),db=new PrismaClient({datasources:{db:{url:`file:${dbPath.replaceAll('\\','/')}`}}});
 try{
  if(fresh)await applyTestSchema(db,process.cwd());
  const repo=new CasWorldBudgetRepository(new PrismaWorldBudgetStore(db));
  const bounded:WorldBudgetRepository={transactWorld:(id,work)=>repo.transactWorld(id,tx=>work({...tx,createRequest:async req=>{
   if(id!==WORLD||auditWorldBudget(tx.snapshot).committedMicroUsd+req.reserveMicroUsd>CAP)throw new WorldBudgetError('cap_exceeded','Personal expansion ceiling reached');return tx.createRequest(req);
  }}))};
  const ledger=new WorldBudget(bounded),store=new PrismaRetainedPurchaseStore(db);
  const png=await sharp(art).png().toBuffer(),judgeIdentityPng=await sharp(identity).resize(256,256,{fit:'inside'}).png().toBuffer();
  const repair=phase==='--repair'?JSON.parse(readFileSync(path.join(dir,`${target}-repair.json`),'utf8')):null;
  if(repair&&(repair.inputsSha256!==hash(serialized)||![2,...(slug==='amazon-size'?[3]:[])].includes(repair.attempt)||repair.hideId!==target))throw Error('Invalid explicit repair plan');
  const hides=target?board.hides.filter(h=>h.id===target):board.hides;
  if(!hides.length)throw Error('No matching hide');
  for(const hide of hides){
   const attempt=repair?repair.attempt:1;
   console.log(JSON.stringify({slug,hide:hide.id,attempt,phase:'start'}));
   const result=await renderLocalPatchHide({ledger,store,renderPolicySha256:policyHash,render:input=>buyLocalPatch(key,input,{policy})},{worldId:WORLD,contentVersion:9,board,hide,composedPng:png,identityPng:identity,judgeIdentityPng,referenceMode:LOCAL_PATCH_PORTRAIT_ONLY_REFERENCE_MODE,ageYears:5,attempt,repairChecks:repair?.checks as LocalPatchRepairCheck[]|undefined,apiKey:key});
   const prefix=path.join(dir,`${hide.id}-attempt-${attempt}`);
   if(result.shippingPng)writeFileSync(`${prefix}.png`,result.shippingPng);
   writeFileSync(`${prefix}.json`,JSON.stringify({accepted:result.accepted,inputsSha256:hash(serialized),sha256:result.shippingPng?hash(result.shippingPng):null,refusedBecause:result.refusedBecause,renderFault:result.renderFault,seam:result.seam,compositionPermission:result.compositionPermission,stoppedReason:result.stoppedReason,costUnknown:result.costUnknown,renderCents:result.renderCents,replayed:result.replayed,visualReview:'pending'},null,2));
   writeFileSync(path.join(dir,'budget.json'),JSON.stringify(await ledger.audit(WORLD),null,2));
   if(result.costUnknown||result.refusedBecause==='stopped'||!result.shippingPng)throw Error('Unresolved/missing paid result; stopped without retry');
   console.log(JSON.stringify({slug,hide:hide.id,attempt,accepted:result.accepted,phase:'retained'}));
  }
 }finally{await db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Expansion stopped');process.exitCode=1});

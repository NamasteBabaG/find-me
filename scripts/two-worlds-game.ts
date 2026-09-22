/** Isolated complete LOCAL playtest. Never updates QA, catalog or existing games. */
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {env} from '../src/lib/env';
import {getContainer} from '../src/services/container';
import {applyTestSchema} from '../src/lib/test-schema';
import {ensureUser,createMagicLink} from '../src/services/auth.service';
import {signedAssetUrl,storeAsset} from '../src/services/asset.service';
import {ensurePlayerLink} from '../src/services/share-link.service';
import {prepareAdventureConfig} from '../src/services/adventure-content.service';
import {TWO_WORLD_STORAGE} from '../content/adventures/two-worlds-production';
import {loadReviewedTwoWorlds,sha} from './lib/two-worlds-reviewed';
import {twoWorldsConfig} from './lib/two-worlds-config';
async function main(){
 const args=process.argv.slice(2);if(args.length!==1||args[0]!=='--local-reviewed')throw Error('Requires --local-reviewed');
 const e=env(),dir=path.resolve(TWO_WORLD_STORAGE),db=path.join(dir,'game.sqlite').replaceAll('\\','/'),assets=path.join(dir,'assets');
 if(e.NODE_ENV==='production'||e.APP_ENV!=='development'||e.APP_URL!=='http://localhost:3037'||e.DATABASE_URL!==`file:${db}`||path.resolve(e.STORAGE_LOCAL_DIR)!==assets||e.STORAGE_PROVIDER!=='local'||e.GENERATION_PROVIDER!=='mock'||e.GENERATION_ENABLED!=='off'||e.PAYMENT_PROVIDER!=='mock')throw Error('Isolated local preview only');
 const reviewed=await loadReviewedTwoWorlds(),c=getContainer(),gameId='game_two_worlds_bar_local_20260919_v1',childId='fam_two_worlds_bar_local_20260919';
 try{
  if(!existsSync(db))await applyTestSchema(c.db);
  if(await c.db.game.findUnique({where:{id:gameId}}))throw Error('Immutable pilot already exists; refusing to overwrite');
  const owner=await ensureUser(c,'two-worlds-bar-pilot@findme.local');
  await c.db.familyChild.create({data:{id:childId,ownerId:owner.id,displayName:'בר'}});
  async function save(id:string,type:'AVATAR'|'TARGET_SPRITE',bytes:Buffer){
   const meta=await sharp(bytes).metadata(),asset=await storeAsset(c,{ownerId:owner.id,type,visibility:'GAME',buffer:bytes,mimeType:'image/png',width:meta.width,height:meta.height,provider:'two-worlds-private-review-v1',providerRequestId:`${gameId}:${id}:${sha(bytes)}`});return signedAssetUrl(c,asset.id);
  }
  const avatarUrl=await save('avatar','AVATAR',reviewed.avatar),patchUrls:Record<string,string>={};
  for(const p of reviewed.patches)patchUrls[p.id]=await save(p.id,'TARGET_SPRITE',p.bytes);
  const config=await prepareAdventureConfig(twoWorldsConfig({gameId,childName:'בר',avatarUrl,patchUrls,geometry:reviewed.geometry,composedAt:new Date().toISOString(),boards:reviewed.boards,catalog:reviewed.catalog}),reviewed.catalog,reviewed.boards.map(b=>b.board),path.resolve('public'));
  const now=new Date();await c.db.$transaction(async tx=>{
   await tx.game.create({data:{id:gameId,ownerId:owner.id,familyChildId:childId,packageTier:'TWO_WORLDS',title:'בר בשני עולמות — 18 בורדים',status:'DELIVERED',sceneCount:config.scenes.length,styleVersion:config.styleVersion,locale:'he',draftToken:`draft_${gameId}`,configJson:JSON.stringify(config),paidAt:now,readyAt:now,deliveredAt:now,scenes:{create:config.scenes.map((scene,orderIndex)=>({id:`gsc_${gameId}_${orderIndex}`,sceneSlug:scene.slug,sceneVersion:scene.version,orderIndex,generationStatus:'QA_OK',configJson:JSON.stringify(scene)}))}}});
   await tx.order.create({data:{id:`ord_${gameId}`,gameId,userId:owner.id,packageTier:'TWO_WORLDS',paymentStatus:'PAID',amountAgorot:0,provider:'mock'}});
  });
  const result={gameId,childId,environment:'local',partial:false,held:reviewed.holds,boards:config.scenes.length,hides:reviewed.patches.length,discoveries:config.adventure!.boards.reduce((n,b)=>n+b.discoveries.length,0),player:(await ensurePlayerLink(c,gameId)).url,ownerSignIn:await createMagicLink(c,owner.id,`/family/${childId}/play/${gameId}`),evidence:reviewed.evidence};
  mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/local-game.json`,JSON.stringify(result,null,2));
  writeFileSync(`${dir}/playtest-inputs.json`,JSON.stringify({boards:reviewed.boards.map(board=>({board})),catalog:reviewed.catalog,hides:Object.fromEntries(Object.entries(reviewed.geometry).map(([id,geometry])=>[id,{geometry}]))},null,2));
  console.log(JSON.stringify({gameId,boards:result.boards,hides:result.hides,discoveries:result.discoveries,held:result.held,player:result.player}));
 }finally{await c.db.$disconnect();}
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Assembly failed');process.exitCode=1;});

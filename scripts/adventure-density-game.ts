/** Separate local-only nine-board verification and handoff games. Never overwrite. */
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {env} from '../src/lib/env';
import {getContainer} from '../src/services/container';
import {ensureUser} from '../src/services/auth.service';
import {signedAssetUrl,storeAsset} from '../src/services/asset.service';
import {ensurePlayerLink,verifyLinkToken} from '../src/services/share-link.service';
import {readFileSync} from 'node:fs';
import {prepareAdventureConfig} from '../src/services/adventure-content.service';
import {DENSITY_PATCH_BOARDS,ADVENTURE_DENSITY_BOARDS} from '../content/adventures/density-boards';
import {threeBoardConfig} from './lib/adventure-three-config';
import {loadDensityReviewedAssets,densityHash} from './lib/adventure-density-review';
async function main(){
 const args=process.argv.slice(2),verify=args[0]==='--verify-reviewed';
 if(args.length!==1||(!verify&&args[0]!=='--reviewed'))throw Error('Choose --verify-reviewed or --reviewed');
 const e=env(),expected=path.resolve('storage/adventure-three-local.sqlite');
 if(e.NODE_ENV==='production'||e.DATABASE_URL!==`file:${expected.replaceAll('\\','/')}`||e.STORAGE_PROVIDER!=='local'||e.GENERATION_PROVIDER!=='mock'||!existsSync(expected))throw Error('Existing isolated local pilot DB, local storage and mock generation required');
 // All hashes/parent rejection gates are checked before any database or asset write.
 const reviewed=await loadDensityReviewedAssets();
 const c=getContainer(),gameId=verify?'game_adventure_bar_density_verify_v3':'game_adventure_bar_density_nine_v3';
 const family=JSON.parse(readFileSync('storage/adventure-three-preflight/bar-game.json','utf8'));
 const familyToken=new URL(family.player).pathname.split('/').pop()!,familyLink=await c.db.shareLink.findUniqueOrThrow({where:{id:familyToken.split('.')[0]}});
 if(!verifyLinkToken(c,familyLink,familyToken))throw Error('Assembly signing configuration differs from the existing local server; do not load API-only environment settings for game assembly');
 const existing=await c.db.game.findUnique({where:{id:gameId}});
 if(existing){console.log(JSON.stringify({gameId,unchanged:true,player:(await ensurePlayerLink(c,gameId)).url}));return;}
 const owner=await ensureUser(c,'adventure-pilot@findme.local');
 const save=async(id:string,type:'AVATAR'|'TARGET_SPRITE',buffer:Buffer)=>{
  const meta=await sharp(buffer).metadata(),asset=await storeAsset(c,{ownerId:owner.id,type,visibility:'GAME',buffer,mimeType:'image/png',width:meta.width,height:meta.height,provider:'adventure-density-reviewed-v9',providerRequestId:`${gameId}:${id}:${densityHash(buffer)}`});
  return signedAssetUrl(c,asset.id);
 };
 const avatarUrl=await save('avatar','AVATAR',reviewed.avatar),patchUrls:Record<string,string>={};
 for(const p of reviewed.patches)patchUrls[p.id]=await save(p.id,'TARGET_SPRITE',p.buffer);
 const config=await prepareAdventureConfig(threeBoardConfig({gameId,childName:'בר',avatarUrl,patchUrls,composedAt:new Date().toISOString(),geometry:reviewed.geometry,boards:DENSITY_PATCH_BOARDS,catalog:ADVENTURE_DENSITY_BOARDS}),ADVENTURE_DENSITY_BOARDS,DENSITY_PATCH_BOARDS.map(b=>b.board),path.resolve('public'));
 const now=new Date();
 await c.db.game.create({data:{id:gameId,ownerId:owner.id,packageTier:'ONE_WORLD',title:'המסע של בר — תשעה מקומות',status:'DELIVERED',sceneCount:9,styleVersion:config.styleVersion,locale:'he',draftToken:`draft_${gameId}`,configJson:JSON.stringify(config),paidAt:now,readyAt:now,deliveredAt:now}});
 const result={gameId,player:(await ensurePlayerLink(c,gameId)).url,boards:9,hides:27,discoveries:54,localOnly:true,parentLikenessConfirmation:'pending'};
 mkdirSync('storage/adventure-density-preflight',{recursive:true});writeFileSync(`storage/adventure-density-preflight/${verify?'verification':'bar'}-game.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e instanceof Error?e.message:'Assembly stopped');process.exit(1);});

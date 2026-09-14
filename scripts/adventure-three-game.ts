/** Local-only assembly. --fixture makes clearly marked TEST targets before any
 * personal purchases. --reviewed requires all nine reviewed, hash-pinned renders.
 * Distinct immutable game ids. No replacement/deletion of any existing game. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { env } from "../src/lib/env";
import { getContainer } from "../src/services/container";
import { applyTestSchema } from "../src/lib/test-schema";
import { ensureUser, createMagicLink } from "../src/services/auth.service";
import { signedAssetUrl, storeAsset } from "../src/services/asset.service";
import { ensurePlayerLink } from "../src/services/share-link.service";
import { prepareAdventureConfig } from "../src/services/adventure-content.service";
import { THREE_PATCH_BOARDS, ADVENTURE_THREE_BOARDS } from "../content/adventures/three-boards";
import { cropOf, maskForHide } from "../src/domain/scene/local-patch-hides";
import { threeBoardConfig } from "./lib/adventure-three-config";

const hash=(v:Buffer)=>createHash("sha256").update(v).digest("hex");
async function main() {
  const args=process.argv.slice(2),fixture=args[0]==="--fixture";
  const verification=args[0]==="--verify-reviewed";
  if(args.length!==1||(!fixture&&!verification&&args[0]!=="--reviewed"))throw new Error("Choose --fixture, --verify-reviewed or --reviewed");
  const e=env(), expected=path.resolve("storage/adventure-three-local.sqlite");
  if(e.NODE_ENV==="production"||e.DATABASE_URL!==`file:${expected.replaceAll("\\","/")}`||e.STORAGE_PROVIDER!=="local"||e.GENERATION_PROVIDER!=="mock")throw new Error("Use the isolated local pilot DB, local storage and mock generation");
  mkdirSync(path.dirname(expected),{recursive:true});const fresh=!existsSync(expected),c=getContainer();
  if(fresh)await applyTestSchema(c.db);
  const gameId=fixture?"game_adventure_three_fixture_v1":verification?"game_adventure_bar_verification_v1":"game_adventure_bar_three_v1";
  const existing=await c.db.game.findUnique({where:{id:gameId}});
  if(existing) {console.log(JSON.stringify({gameId,unchanged:true,link:(await ensurePlayerLink(c,gameId)).url,ownerSignIn:await createMagicLink(c,existing.ownerId!,"/library")}));return;}
  const dir=path.resolve("storage/adventure-bar-20260914");
  const review=fixture?null:JSON.parse(readFileSync(path.join(dir,"final-review.json"),"utf8"));
  if(!fixture&&review?.accepted!==true)throw new Error("All personal renders require visual approval");
  if(!fixture){
    const inputsBytes=readFileSync(path.join(dir,'inputs.json')),inputs=JSON.parse(inputsBytes.toString());
    if(review.inputsSha256!==hash(inputsBytes))throw new Error('Review refers to different render inputs');
    const identityReview=JSON.parse(readFileSync(path.join(dir,'identity-review.json'),'utf8'));
    if(identityReview.accepted!==true||identityReview.identitySha256!==hash(readFileSync(path.join(dir,'identity.png')))||identityReview.inputsSha256!==review.inputsSha256)throw new Error('Canonical identity is not approved for these inputs');
    for(const board of THREE_PATCH_BOARDS){
      const pinned=inputs.boards.find((b:{board:{board:string}})=>b.board.board===board.board);
      if(!pinned||JSON.stringify(pinned.board)!==JSON.stringify(board)||pinned.sourceSha256!==hash(readFileSync(board.art)))throw new Error('Board art or hide geometry changed after review');
    }
  }
  const patches:Array<{id:string;buffer:Buffer}>=[];
  for(const board of THREE_PATCH_BOARDS)for(const hide of board.hides){
    let buffer:Buffer;
    if(fixture){
      const m=maskForHide(hide);
      const marker=Buffer.from(`<svg width="512" height="768"><rect x="${m.left}" y="${m.top}" width="${m.width}" height="${m.height}" rx="12" fill="#8245be" stroke="white" stroke-width="5"/><text x="${m.left+m.width/2}" y="${m.top+m.height/2}" text-anchor="middle" fill="white" font-size="24">TEST ${hide.targetId.slice(-1)}</text></svg>`);
      buffer=await sharp(readFileSync(board.art)).extract(cropOf(hide)).composite([{input:marker}]).png().toBuffer();
    }else{
      const source=review.patchSources?.[hide.id],prefix=`${board.board}-${hide.targetId}`;
      if(typeof source!=='string'||![`${prefix}.png`,`${prefix}-attempt-2.png`,`${prefix}-attempt-3.png`].includes(source))throw new Error('Unexpected reviewed patch path');
      const technical=JSON.parse(readFileSync(path.join(dir,source.replace('.png','-technical.json')),'utf8'));
      if(technical.accepted!==true||technical.costUnknown)throw new Error(`Technical refusal cannot publish: ${hide.id}`);
      buffer=readFileSync(path.join(dir,source));
      if(review.patches?.[hide.id]!==hash(buffer))throw new Error(`Unreviewed patch ${hide.id}`);
    }
    const meta=await sharp(buffer).metadata();if(meta.width!==512||meta.height!==768)throw new Error("Incorrect patch dimensions");
    patches.push({id:hide.id,buffer});
  }
  const avatar=fixture?await sharp({create:{width:256,height:256,channels:4,background:"#8245be"}}).composite([{input:Buffer.from('<svg width="256" height="256"><text x="128" y="140" text-anchor="middle" fill="white" font-size="44">TEST</text></svg>')}]).png().toBuffer():readFileSync(path.join(dir,"avatar.png"));
  if(!fixture&&review.avatarSha256!==hash(avatar))throw new Error("Unreviewed avatar");
  const owner=await ensureUser(c,"adventure-pilot@findme.local");
  const save=async(id:string,type:"AVATAR"|"TARGET_SPRITE",buffer:Buffer)=>{
    const meta=await sharp(buffer).metadata();
    const asset=await storeAsset(c,{ownerId:owner.id,type,visibility:"GAME",buffer,mimeType:"image/png",width:meta.width,height:meta.height,provider:fixture?"adventure-fixture":"adventure-reviewed-v9",providerRequestId:`${gameId}:${id}:${hash(buffer)}`});
    return signedAssetUrl(c,asset.id);
  };
  const avatarUrl=await save("avatar","AVATAR",avatar),patchUrls:Record<string,string>={};
  for(const p of patches)patchUrls[p.id]=await save(p.id,"TARGET_SPRITE",p.buffer);
  const config=await prepareAdventureConfig(threeBoardConfig({gameId,childName:fixture?"TEST":"בר",avatarUrl,patchUrls,composedAt:new Date().toISOString(),fixture,geometry:review?.geometry}),ADVENTURE_THREE_BOARDS,THREE_PATCH_BOARDS.map(b=>b.board),path.resolve("public"));
  const now=new Date();
  await c.db.game.create({data:{id:gameId,ownerId:owner.id,packageTier:"ONE_WORLD",title:fixture?"בדיקת חיבור שלושת הבורדים — TEST":"ההרפתקה של בר",status:"DELIVERED",sceneCount:3,styleVersion:config.styleVersion,locale:"he",draftToken:`draft_${gameId}`,configJson:JSON.stringify(config),paidAt:now,readyAt:now,deliveredAt:now}});
  const link=await ensurePlayerLink(c,gameId),magic=await createMagicLink(c,owner.id,"/library");
  const result={gameId,fixture,player:link.url,ownerSignIn:magic,boards:3,hides:9,discoveries:18};
  const reviewDir=path.resolve("storage/adventure-three-preflight");mkdirSync(reviewDir,{recursive:true});
  writeFileSync(path.join(reviewDir,fixture?"fixture-game.json":verification?"bar-verification-game.json":"bar-game.json"),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:"Local pilot assembly failed");process.exit(1);});

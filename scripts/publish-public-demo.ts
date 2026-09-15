/** Publishes ONLY the pre-existing public example girl, never customer assets.
 * Content-addressed files keep the book's image binding immutable. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { LocalPatchBoardSchema } from '../src/domain/scene/local-patch-hides';
import { ReadyAdventureBoardSchema, type AdventureCatalog } from '../src/domain/adventure/content';
import { attachAdventureBook } from '../src/domain/adventure/compose';
import { threeBoardConfig, type ReviewedChildGeometry } from './lib/adventure-three-config';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const dir='storage/public-demo-beach-20260915-v2';
async function asset(file:string) {
 const bytes=await sharp(file).webp({lossless:true,effort:6}).toBuffer();
 const url=`/demo/beach-v1/${sha(bytes)}.webp`;
 if(existsSync(`public${url}`)&&!readFileSync(`public${url}`).equals(bytes))throw new Error('Immutable public asset collision');
 writeFileSync(`public${url}`,bytes);return url;
}
async function main(){
 const raw=JSON.parse(readFileSync('content/demo/beach-v1-plan.json','utf8'));
 const board=LocalPatchBoardSchema.parse(raw.patchBoard),plan=ReadyAdventureBoardSchema.parse(raw.plan);
 const review=JSON.parse(readFileSync('content/demo/beach-v1-review.json','utf8')) as {accepted:boolean;boardSha256:string;patches:Record<string,{sha256:string;geometry:ReviewedChildGeometry;repair?:{kind:'foot-occlusion';sourceSha256:string;accepted:boolean}}>};
 if(!review.accepted||review.boardSha256!==sha(readFileSync(board.art))||review.boardSha256!==plan.art.sha256)throw new Error('Source-bound visual release review required');
 const identityReview=JSON.parse(readFileSync(`${dir}/identity-review.json`,'utf8'));
 if(!identityReview.accepted||identityReview.identitySha256!==sha(readFileSync(`${dir}/identity.png`)))throw new Error('Identity not reviewed');
 mkdirSync('public/demo/beach-v1',{recursive:true});
 const avatar=await asset(`${dir}/avatar.png`),identity=await asset(`${dir}/identity.png`);
 const patchUrls:Record<string,string>={},geometry:Record<string,ReviewedChildGeometry>={};
 for(const hide of board.hides){
  let file=`${dir}/${hide.id}.png`;
  const r=review.patches[hide.id];
  const technical=JSON.parse(readFileSync(`${dir}/${hide.id}.json`,'utf8'));
  if(r?.repair){
   if(hide.id!=='beach-library'||r.repair.kind!=='foot-occlusion'||!r.repair.accepted||r.repair.sourceSha256!==sha(readFileSync(file)))throw new Error('Repair source review missing');
   const repair=JSON.parse(readFileSync(`${dir}/beach-library-occlusion.json`,'utf8'));
   if(repair.sourceSha256!==r.repair.sourceSha256||repair.sha256!==r.sha256||repair.changedOutside!==0)throw new Error('Repair integrity failed');
   file=`${dir}/beach-library-occlusion.png`;
  }
  if(!r||r.sha256!==sha(readFileSync(file))||!technical.accepted||technical.costUnknown)throw new Error(`Patch review missing: ${hide.id}`);
  patchUrls[hide.id]=await asset(file);geometry[hide.id]=r.geometry;
 }
 const catalog:AdventureCatalog={version:1,releaseId:'public-beach-v1',boards:[plan]};
 const configs=Object.fromEntries((['en','he'] as const).map(locale=>{
  const name=locale==='he'?'נועה':'Anna';
  const config=threeBoardConfig({gameId:'demo',childName:name,avatarUrl:avatar,patchUrls,composedAt:'2026-09-15T00:00:00.000Z',geometry,boards:[board],catalog});
  config.locale=locale;config.styleVersion='public-beach-v1';config.worlds=undefined;
  const scene=config.scenes[0]!;scene.name=plan.name[locale];
  scene.tagline=locale==='he'?'שלושה מחבואים ושש תגליות':'Three hiding places and six discoveries';
  scene.celebration.completeText=locale==='he'?'מצאתם את שלושת המחבואים!':'You found all three hiding places!';
  scene.targets.forEach((t,i)=>{
   t.mission=locale==='he'?`מצאו את ${name}`:`Find ${name}`;
   t.item=locale==='he'?`מחבוא ${i+1}`:`Hiding place ${i+1}`;
   t.success=[locale==='he'?'מצאתם אותי!':'You found me!'];
   t.slots.forEach(s=>{s.hintText=locale==='he'?board.hides[i]!.hint!.he:['Look beside the sandcastle.','Look by the children studying the beach map.','Look among the necklace makers.'][i]!;});
   t.spriteByVariant={A:t.sprite};
  });
  return [locale,attachAdventureBook(config,catalog,['beach'])];
 }));
 writeFileSync('content/demo/beach-v1-game.json',JSON.stringify(configs,null,2)+'\n');
 writeFileSync('content/demo/beach-v1-assets.json',JSON.stringify({photo:'/demo/example-photo.jpg',photoSha256:sha(readFileSync('public/demo/example-photo.jpg')),identitySheet:identity,avatar,boardSha256:plan.art.sha256,patches:patchUrls,geometry},null,2)+'\n');
 console.log({publishedPublicExampleOnly:true,avatar,patches:Object.keys(patchUrls).length,configLocales:Object.keys(configs)});
}
main().catch(e=>{console.error(e);process.exitCode=1;});

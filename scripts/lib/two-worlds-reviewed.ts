/** Fail-closed, source-bound intake for the private two-world playtest. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {AdventureCatalogSchema} from '../../src/domain/adventure/content';
import {TWO_WORLD_RELEASE_BOARDS,TWO_WORLD_RELEASE_CATALOG,TWO_WORLD_VISUAL_HOLDS} from '../../content/adventures/two-worlds-release';
import {TWO_WORLD_STORAGE} from '../../content/adventures/two-worlds-production';
import {validateReviewedChildGeometry,type ReviewedChildGeometry} from './adventure-three-config';
export const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const AVATAR='23eab8a70550e5316599cdacc0b9abbf41d919fb284719e3f0a5afbe68b742ea';
export function selectReviewedInventory(allowPartial=false){
 const holds=Object.keys(TWO_WORLD_VISUAL_HOLDS);
 if(holds.length&&!allowPartial)throw Error(`Full release blocked by visual holds: ${holds.join(', ')}`);
 const boards=TWO_WORLD_RELEASE_BOARDS.filter(b=>!holds.includes(b.board));
 const catalog=AdventureCatalogSchema.parse({...TWO_WORLD_RELEASE_CATALOG,boards:TWO_WORLD_RELEASE_CATALOG.boards.filter(b=>boards.some(p=>p.board===b.boardSlug))});
 return {boards,catalog,holds};
}
function sourceDirectory(slug:string){
 if(slug==='adventure-newyork')return '../adventure-three-boards-20260914/storage/adventure-bar-20260914';
 if(slug==='adventure-amazon-refresh-v6')return 'storage/journey-refresh-bar-20260919';
 if(['magic-castlegate','magic-giantlibrary','fairyforest'].includes(slug))return 'storage/magic-bar-20260918';
 return `${TWO_WORLD_STORAGE}/${slug}`;
}
export async function loadReviewedTwoWorlds(allowPartial=false){
 const inventory=selectReviewedInventory(allowPartial),geometry:Record<string,ReviewedChildGeometry>={},patches:{id:string;bytes:Buffer}[]=[],evidence:Record<string,string>={};
 let avatar:Buffer|undefined;
 for(const board of inventory.boards){
  const dir=sourceDirectory(board.board),inputsBytes=readFileSync(`${dir}/inputs.json`),inputs=JSON.parse(inputsBytes.toString()),reviewBytes=readFileSync(`${dir}/final-review.json`),review=JSON.parse(reviewBytes.toString());
  const identity=readFileSync(`${dir}/avatar.png`),inputsHash=sha(inputsBytes);
  const legacy=board.board==='adventure-newyork';
  if(review.accepted!==true||review.inputsSha256!==inputsHash||review.avatarSha256!==AVATAR||sha(identity)!==AVATAR||(!legacy&&inputs.avatarSha256!==AVATAR))throw Error(`Unbound approval ${board.board}`);
  avatar=identity;
  const pinned=inputs.boards.find((p:{board:{board:string}})=>p.board.board===board.board);
  if(!pinned||JSON.stringify(pinned.board)!==JSON.stringify(board)||pinned.sourceSha256!==sha(readFileSync(board.art)))throw Error(`Changed placement/source ${board.board}`);
  evidence[board.board]=sha(reviewBytes);
  let group:ReturnType<typeof JSON.parse>;
  if(!legacy){
   const name=review.groupReviews[board.board];
   if(typeof name!=='string'||!new RegExp(`^${board.board}-review-[123]-[123]-[123]\\.json$`).test(name))throw Error('Invalid grouped review path');
   const raw=readFileSync(`${dir}/${name}`);group=JSON.parse(raw.toString());
   if(sha(raw)!==review.groupHashes[board.board]||group.inputsSha256!==inputsHash)throw Error('Changed group review');
  }
  for(const [i,h]of board.hides.entries()){
   let bytes:Buffer,g:ReviewedChildGeometry;
   if(legacy){
    const name=review.patchSources[h.id];
    if(typeof name!=='string'||path.basename(name)!==name||!/^adventure-newyork-hide-[123](?:-attempt-2)?\.png$/.test(name))throw Error('Invalid retained patch');
    bytes=readFileSync(`${dir}/${name}`);const technical=JSON.parse(readFileSync(`${dir}/${name.replace('.png','-technical.json')}`,'utf8'));
    if(!technical.accepted||technical.costUnknown||sha(bytes)!==review.patches[h.id])throw Error(`Invalid retained evidence ${h.id}`);
    g=review.geometry[h.id];
   }else{
    const selected=review.hides[h.id],attempt=selected?.attempt;
    if(![1,2,3].includes(attempt)||group.attempts[i]!==attempt||group.dispositions[h.id]?.state!=='acceptable')throw Error(`Not approved ${h.id}`);
    const prefix=`${dir}/${h.id}-attempt-${attempt}`;bytes=readFileSync(`${prefix}.png`);const technical=JSON.parse(readFileSync(`${prefix}.json`,'utf8'));
    if(!technical.accepted||technical.costUnknown||technical.inputsSha256!==inputsHash||technical.sha256!==sha(bytes)||selected.sha256!==sha(bytes)||group.patches[h.id]!==sha(bytes))throw Error(`Unbound pixels ${h.id}`);
    g=selected.geometry;
   }
   const meta=await sharp(bytes).metadata();if(meta.width!==512||meta.height!==768||(meta.pages??1)!==1)throw Error('Unexpected patch raster');
   geometry[h.id]=validateReviewedChildGeometry(g);patches.push({id:h.id,bytes});
  }
 }
 if(!avatar)throw Error('No reviewed identity');
 return {...inventory,geometry,patches,avatar,evidence};
}

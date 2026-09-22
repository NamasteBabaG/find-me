import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import sharp from 'sharp';
import {TWO_WORLD_CATALOG} from '../../content/adventures/two-worlds-discoveries';
import {TWO_WORLD_PATCH_BOARDS,TWO_WORLD_STORAGE} from '../../content/adventures/two-worlds-production';
async function main(){
 const mode=process.argv[2],out='output/two-worlds-20260919/inspection';mkdirSync(out,{recursive:true});
 for(const b of TWO_WORLD_CATALOG.boards){
  if(b.status!=='ready')continue;
  if(mode==='--items'){
   const overlays=[];
   for(const [i,d] of b.discoveries.entries()){
    const r=d.cardCrop,left=Math.round(r.x*3840),top=Math.round(r.y*2160),width=Math.round(r.w*3840),height=Math.round(r.h*2160);
    const png=await sharp(`public${b.art.base}`).extract({left,top,width,height}).resize(260,240,{fit:'contain',background:'#eee'}).png().toBuffer();
    overlays.push({input:png,left:(i%3)*280,top:Math.floor(i/3)*280+30});
    const label=Buffer.from(`<svg width="270" height="28"><text x="8" y="20" font-size="17">${i+1}. ${d.id}</text></svg>`);
    overlays.push({input:label,left:(i%3)*280,top:Math.floor(i/3)*280});
   }
   await sharp({create:{width:840,height:560,channels:3,background:'#eee'}}).composite(overlays).jpeg({quality:97}).toFile(`${out}/${b.boardSlug}-items.jpg`);
  }else if(mode==='--returns'||mode==='--contexts'){
   const board=TWO_WORLD_PATCH_BOARDS.find(v=>v.board===b.boardSlug)!;const overlays=[];
   for(const [i,h] of board.hides.entries()){
    const suffix=mode==='--contexts'?'-context':'',second=`${TWO_WORLD_STORAGE}/${b.boardSlug}/${h.id}-attempt-2${suffix}.png`;
    const file=existsSync(second)?second:`${TWO_WORLD_STORAGE}/${b.boardSlug}/${h.id}-attempt-1${suffix}.png`;
    if(existsSync(file))overlays.push({input:readFileSync(file),left:i*(mode==='--contexts'?656:528),top:0});
   }
   if(overlays.length)await sharp({create:{width:mode==='--contexts'?1952:1568,height:mode==='--contexts'?896:768,channels:3,background:'#eee'}}).composite(overlays).jpeg({quality:97}).toFile(`${out}/${b.boardSlug}-${mode==='--contexts'?'contexts':'returns'}.jpg`);
  }else throw Error('Use --items, --returns or --contexts');
 }
 console.log('Evidence refreshed; originals unchanged');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

import sharp,{type OverlayOptions} from 'sharp';
import {readFileSync} from 'node:fs';
import {EXPANSION_SPECS} from '../content/adventures/expanded-boards';
async function main(){for(const {patchBoard,plan} of EXPANSION_SPECS.slice(1)){
 const layers:OverlayOptions[]=[];
 for(const [i,d] of plan.discoveries.entries()){
  const c=d.cardCrop,l=Math.floor(c.x*3840),t=Math.floor(c.y*2160),w=Math.min(3840-l,Math.ceil(c.w*3840)),h=Math.min(2160-t,Math.ceil(c.h*2160));
  const img=await sharp(readFileSync(patchBoard.art)).extract({left:l,top:t,width:w,height:h}).resize(300,210,{fit:'contain',background:'#e8e1d5'}).png().toBuffer();
  layers.push({input:img,left:(i%3)*320+10,top:Math.floor(i/3)*250+28});
  layers.push({input:Buffer.from(`<svg width="300" height="25"><text x="5" y="18" font-size="17" fill="#222">${i+1}. ${d.id}</text></svg>`),left:(i%3)*320+10,top:Math.floor(i/3)*250});
 }
 await sharp({create:{width:960,height:500,channels:3,background:'#e8e1d5'}}).composite(layers).png().toFile(`output/imagegen/adventure-expansion-20260914-v1/${patchBoard.board}-cards-review.png`);
}}
main().catch(e=>{console.error(e);process.exitCode=1});

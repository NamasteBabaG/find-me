/** Diagnostic contact sheets only: original pixels, annotated planned edit bounds. */
import {readFileSync} from 'node:fs';
import sharp,{type OverlayOptions} from 'sharp';
async function main(){for(const slug of ['paris','marrakech','tokyo','greatwall','sydney','antarctica']){
 const {patchBoard:board,plan}=JSON.parse(readFileSync(`content/adventures/density-v3/${slug}.json`,'utf8'));
 const inputs:OverlayOptions[]=[],cards:OverlayOptions[]=[];
 for(const [i,h] of board.hides.entries()){
  const m=h.mask,svg=Buffer.from(`<svg width="512" height="768"><rect x="${m.left}" y="${m.top}" width="${m.width}" height="${m.height}" fill="none" stroke="#ff2366" stroke-width="3"/><text x="12" y="26" fill="#ff2366" font-size="24">${i+1}</text></svg>`);
  inputs.push({input:await sharp(board.art).extract({left:h.left,top:h.top,width:512,height:768}).composite([{input:svg}]).png().toBuffer(),left:i*512,top:0});
 }
 for(const [i,d] of plan.discoveries.entries()){
  const c=d.cardCrop;cards.push({input:await sharp(board.art).extract({left:Math.round(c.x*3840),top:Math.round(c.y*2160),width:Math.round(c.w*3840),height:Math.round(c.h*2160)}).resize(300,210,{fit:'contain',background:'#e8e1d5'}).png().toBuffer(),left:i%3*320+10,top:Math.floor(i/3)*245+30});
  cards.push({input:Buffer.from(`<svg width="310" height="25"><text x="5" y="18" font-size="17">${i+1}. ${d.id}</text></svg>`),left:i%3*320+10,top:Math.floor(i/3)*245});
 }
 await sharp({create:{width:1536,height:768,channels:3,background:'#e8e1d5'}}).composite(inputs).png().toFile(`output/imagegen/adventure-density-hides-v3/${slug}-contexts.png`);
 await sharp({create:{width:960,height:490,channels:3,background:'#e8e1d5'}}).composite(cards).png().toFile(`output/imagegen/adventure-density-hides-v3/${slug}-cards.png`);
}}
main().catch(e=>{console.error(e);process.exitCode=1});

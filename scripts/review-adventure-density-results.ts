import {existsSync} from 'node:fs';
import sharp,{type OverlayOptions} from 'sharp';
async function main(){for(const slug of ['paris','marrakech','tokyo','greatwall','sydney','antarctica']){
 const overlays:OverlayOptions[]=[];
 for(let i=1;i<=3;i++){
  const prefix=`storage/adventure-bar-density-20260914/adventure-${slug}-density-v3-${i}`;
  const file=['-attempt-4.png','-attempt-3.png','-attempt-2.png','-composition-recovery.png','-attempt-1.png'].map(s=>prefix+s).find(existsSync);
  if(!file)continue;
  overlays.push({input:await sharp(file).png().toBuffer(),left:(i-1)*512,top:0});
 }
 await sharp({create:{width:1536,height:768,channels:3,background:'#e8e1d5'}}).composite(overlays).png().toFile(`output/imagegen/adventure-density-hides-v3/${slug}-results.png`);
}}
main().catch(e=>{console.error(e);process.exitCode=1});

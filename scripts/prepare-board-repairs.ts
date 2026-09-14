/** Deterministic crops/masks only. AI edits are made by the bundled image CLI. */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir='output/imagegen/adventure-three-repairs-v1';
const repairs=[
  {name:'giza-boy',board:'giza',crop:{left:560,top:260,width:512,height:768},rect:{left:88,top:78,width:190,height:340}},
];
async function main(){
 mkdirSync(dir,{recursive:true});
 for(const r of repairs){
  const png=await sharp(`public/scenes/adventure-${r.board}/base.webp`).extract(r.crop).png().toBuffer();
  await sharp(png).resize(768,1152).png().toFile(`${dir}/${r.name}-input.png`);
  const rgba=Buffer.alloc(512*768*4,255);
  for(let y=r.rect.top;y<r.rect.top+r.rect.height;y++)for(let x=r.rect.left;x<r.rect.left+r.rect.width;x++)rgba[(y*512+x)*4+3]=0;
  await sharp(rgba,{raw:{width:512,height:768,channels:4}}).resize(768,1152,{kernel:'nearest'}).png().toFile(`${dir}/${r.name}-mask.png`);
 }
 writeFileSync(`${dir}/repairs.json`,JSON.stringify(repairs,null,2));
}
void main();

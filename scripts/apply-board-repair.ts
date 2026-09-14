/** Paste only the reviewed repair rectangle, never the model's surrounding crop. */
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {ADVENTURE_THREE_BOARDS} from '../content/adventures/three-boards';
const hash=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
async function main(){
 const dir='output/imagegen/adventure-three-repairs-v1';
 const r=JSON.parse(readFileSync(`${dir}/repairs.json`,'utf8'))[0];
 const original=readFileSync('public/scenes/adventure-giza/base.webp');
 const edited=await sharp(`${dir}/giza-boy-edit.png`).resize(512,768).extract(r.rect).ensureAlpha().raw().toBuffer();
 for(let y=0;y<r.rect.height;y++)for(let x=0;x<r.rect.width;x++)edited[(y*r.rect.width+x)*4+3]=Math.round(255*Math.min(1,Math.min(x,y,r.rect.width-1-x,r.rect.height-1-y)/3));
 const patch=await sharp(edited,{raw:{width:r.rect.width,height:r.rect.height,channels:4}}).png().toBuffer();
 const repaired=await sharp(original).composite([{input:patch,left:r.crop.left+r.rect.left,top:r.crop.top+r.rect.top}]).png().toBuffer();
 const plan=ADVENTURE_THREE_BOARDS.boards[0];if(plan?.status!=='ready')throw Error('Missing plan');
 for(const item of plan.discoveries){const c=item.cardCrop,box={left:Math.floor(c.x*3840),top:Math.floor(c.y*2160),width:Math.floor(c.w*3840),height:Math.floor(c.h*2160)};
  if(hash(await sharp(original).extract(box).ensureAlpha().raw().toBuffer())!==hash(await sharp(repaired).extract(box).ensureAlpha().raw().toBuffer()))throw Error(`Item pixels changed: ${item.id}`);
 }
 writeFileSync(`${dir}/giza-4k-repaired.png`,repaired);
 await sharp(repaired).extract(r.crop).png().toFile(`${dir}/giza-boy-composite.png`);
 await sharp(original).extract({left:1710,top:1020,width:320,height:400}).png().toFile(`${dir}/good-style-candidate.png`);
 await sharp(original).extract({left:1860,top:1440,width:440,height:450}).png().toFile(`${dir}/good-style-candidate-2.png`);
 console.log('Review candidate saved; all six discovery crops byte-identical; live art unchanged.');
}
void main();

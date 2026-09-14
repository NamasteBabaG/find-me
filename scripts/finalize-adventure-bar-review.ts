/** Seal the assistant's explicit visual selection; this is NOT an image judge.
 * Run only after inspecting the nine selected native patches. No provider calls. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp, {type OverlayOptions} from 'sharp';
import {THREE_PATCH_BOARDS} from '../content/adventures/three-boards';
import {validateReviewedChildGeometry} from './lib/adventure-three-config';
const selected:Array<[number,number,number,number,number,number,number]>=[
  [1,85,350,90,295,127,402], [1,134,169,105,335,183,228], [2,145,170,83,285,187,220],
  [1,170,300,99,245,211,351], [2,257,87,145,215,310,137], [1,126,275,122,338,177,336],
  [2,200,450,97,265,245,493], [2,278,222,148,422,347,291], [1,132,215,111,292,181,261],
];
async function main(){
  const dir=path.resolve('storage/adventure-bar-20260914');
  const hash=(name:string)=>createHash('sha256').update(readFileSync(path.join(dir,name))).digest('hex');
  const patches:Record<string,string>={},patchSources:Record<string,string>={},geometry:Record<string,ReturnType<typeof validateReviewedChildGeometry>>={};
  const images:OverlayOptions[]=[];let index=0;
  for(const board of THREE_PATCH_BOARDS)for(const hide of board.hides){
    const [attempt,x,y,w,h,headX,headY]=selected[index]!;
    const name=`${board.board}-${hide.targetId}${attempt===1?'':`-attempt-${attempt}`}.png`;
    const technical=JSON.parse(readFileSync(path.join(dir,name.replace('.png','-technical.json')),'utf8'));
    if(!technical.accepted||technical.costUnknown)throw new Error(`Refused: ${name}`);
    patches[hide.id]=hash(name);patchSources[hide.id]=name;
    geometry[hide.id]=validateReviewedChildGeometry({x,y,w,h,headX,headY});
    images.push({input:await sharp(path.join(dir,name)).resize(256,384).toBuffer(),left:(index%3)*280+12,top:Math.floor(index/3)*420+24});index++;
  }
  await sharp({create:{width:840,height:1260,channels:3,background:'#e8e1d5'}}).composite(images).png().toFile(path.join(dir,'selected-nine-review.png'));
  writeFileSync(path.join(dir,'final-review.json'),JSON.stringify({accepted:true,reviewer:'assistant-visual-review',inputsSha256:hash('inputs.json'),avatarSha256:hash('avatar.png'),patches,patchSources,geometry,observations:'Nine native patches inspected for Bar face and curls, age-five proportions, hands, support and seams. Four first attempts rejected and replaced: three technical seam refusals and Amazon crouching ground contact. Giza base malformed boy separately repaired with collectible pixels unchanged. This is assistant approval for a local pilot, not parent confirmation of likeness.'},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)});

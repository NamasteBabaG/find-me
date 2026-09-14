/** Localized assembly of visually reviewed native edits; approved bases stay immutable. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import sharp from 'sharp';
const hash=(v:Buffer)=>createHash('sha256').update(v).digest('hex');
const specs=[
 {slug:'marrakech',source:'C:/Users/guyna/.codex/generated_images/01a0a10f-1200-7e81-b0af-8f5e01fd78d6/exec-59cce11b-c2a1-4765-8735-23660c2ae877.png',context:[1640,580,140,100],region:[1688,606,49,49],prompt:'Replace the ambiguous violet rug mark with one small matte violet gecko with four splayed legs, visible head and curved tail; preserve framing, rug, basket, hands and hand-painted brown contours.'},
 {slug:'tokyo',source:'output/imagegen/adventure-density-hides-v3/tokyo-origami-frog-native-v1.png',context:[1265,705,115,95],region:[1307,732,42,35],prompt:'Replace only ambiguous green folded paper under the child hands with one small olive origami frog, angular folded legs, two tiny paper eyes and hand-drawn brown contours; preserve hands, framing and craft table.'},
];
async function main(){const receipt:Record<string,unknown>={};for(const s of specs){
 if(existsSync(`storage/adventure-bar-density-20260914/${s.slug}-inputs.json`))throw Error('Cannot change frozen paid inputs');
 const sourceBytes=readFileSync(`public/scenes/adventure-${s.slug}-density-v3/base.webp`);
 const [cx,cy,cw,ch]=s.context.map(v=>Math.round(v*1.875)),[left,top,width,height]=s.region.map(v=>Math.round(v*1.875));
 const edited=await sharp(s.source).resize(cw,ch,{fit:'fill'}).extract({left:left!-cx!,top:top!-cy!,width:width!,height:height!}).removeAlpha().raw().toBuffer();
 const {data:original,info}=await sharp(sourceBytes).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const pixels=Buffer.from(original),channels=info.channels;
 // A narrow deterministic feather avoids rectangle seams; all pixels outside stay byte-identical.
 for(let y=0;y<height!;y++)for(let x=0;x<width!;x++){
  const alpha=Math.min(1,Math.min(x,y,width!-1-x,height!-1-y)/6);
  for(let c=0;c<channels;c++){const dst=((top!+y)*info.width+left!+x)*channels+c,src=(y*width!+x)*channels+c;pixels[dst]=Math.round(original[dst]!*(1-alpha)+edited[src]!*alpha);}
 }
 const dir=`public/scenes/adventure-${s.slug}-density-v3-items-v1`;mkdirSync(dir,{recursive:true});
 const output=await sharp(pixels,{raw:info}).webp({lossless:true}).toBuffer();
 const decoded=await sharp(output).removeAlpha().raw().toBuffer();
 let changedOutside=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(x<left!||x>=left!+width!||y<top!||y>=top!+height!)for(let c=0;c<channels;c++){const i=(y*info.width+x)*channels+c;if(decoded[i]!==original[i])changedOutside++;}
 if(changedOutside)throw Error('Unexpected pixel drift outside item region');
 writeFileSync(`${dir}/base.webp`,output);await sharp(output).resize(768,432).webp({quality:85}).toFile(`${dir}/thumb.webp`);
 receipt[s.slug]={sourceSha256:hash(sourceBytes),generatedSha256:hash(readFileSync(s.source)),outputSha256:hash(output),region:{left,top,width,height},unchangedOutsideRegion:true,visualReviewAccepted:true,route:'native-imagegen-localized-composite',prompt:s.prompt};
 console.log(`${s.slug}: ${width}x${height} repair, zero changed pixels outside region`);
 }writeFileSync('content/adventures/density-v3/item-repairs.json',JSON.stringify(receipt,null,2)+'\n');}
main().catch(e=>{console.error(e);process.exitCode=1});

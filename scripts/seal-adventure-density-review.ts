/** Explicit assistant close-up review selections, not automatic render approvals. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import sharp from 'sharp';
import {densityHash,loadDensityReviewedAssets,DensityReviewSchema} from './lib/adventure-density-review';
const dir='storage/adventure-bar-density-20260914',oldDir='storage/adventure-bar-20260914',expDir='storage/adventure-bar-expansion-20260914';
// Native 512x768 coordinates measured from each selected shipping image.
const selections:Record<string,Array<[string,number,number,number,number,number,number]>>={
 paris:[['attempt-2',223,299,82,222,262,346],['attempt-3',109,112,99,256,154,166],['composition-recovery',98,350,113,374,153,405]],
 marrakech:[['attempt-1',244,130,103,166,294,176],['attempt-1',189,254,150,264,247,315],['attempt-4',244,363,194,277,298,431]],
 tokyo:[['attempt-1',292,283,83,225,326,326],['attempt-1',146,371,199,245,236,429],['attempt-1',264,211,160,247,317,274]],
 greatwall:[['attempt-1',120,388,93,255,171,446],['attempt-1',170,378,237,289,328,464],['attempt-1',280,345,193,252,375,411]],
 sydney:[['attempt-1',365,365,84,262,411,413],['attempt-2',312,260,140,288,361,329],['attempt-1',158,313,209,260,238,391]],
 antarctica:[['attempt-3',369,345,103,265,410,399],['attempt-2',218,443,122,194,273,492],['attempt-2',193,302,144,375,252,371]],
};
async function main(){
 if(process.argv[2]!=='--seal')throw Error('Explicit --seal required after inspecting the selected files');
 const old=JSON.parse(readFileSync(`${oldDir}/final-review.json`,'utf8'));
 const rejectionFile=`${dir}/parent-feedback-rejections.json`,rejections=JSON.parse(readFileSync(rejectionFile,'utf8'));
 for(const [image,reason] of [['adventure-paris-density-v3-2-attempt-2.png','Assistant: foreground man displaced during full-clothing repair. Superseded by attempt 3.'],['adventure-marrakech-density-v3-3-attempt-3.png','Assistant: neighbor cut at straight return boundary despite technical acceptance.'],['adventure-antarctica-density-v3-3-attempt-1.png','Assistant: clipped face at former edit boundary.']])if(!rejections.rejections.some((r:{image:string})=>r.image===image))rejections.rejections.push({image,reason});
 writeFileSync(rejectionFile,JSON.stringify(rejections,null,2));
 const make=(hideId:string,source:string,receipt:string,inputs:string,g:number[],observations:string)=>({hideId,source,sourceSha256:densityHash(readFileSync(source)),receipt,receiptSha256:densityHash(readFileSync(receipt)),inputs,inputsSha256:densityHash(readFileSync(inputs)),geometry:{x:g[0],y:g[1],w:g[2],h:g[3],headX:g[4],headY:g[5]},visualAccepted:true as const,observations});
 const entries=[];
 for(const [id,filename] of Object.entries(old.patchSources) as Array<[string,string]>){
  if(id==='adventure-amazon-2')continue;
  const g=old.geometry[id];entries.push(make(id,`${oldDir}/${filename}`,`${oldDir}/${filename.replace('.png','-technical.json')}`,`${oldDir}/inputs.json`,[g.x,g.y,g.w,g.h,g.headX,g.headY],'Reuse exact hash-pinned family-tested original patch and reviewed click geometry.'));
 }
 entries.push(make('adventure-amazon-2',`${expDir}/adventure-amazon-2-attempt-3.png`,`${expDir}/adventure-amazon-2-attempt-3.json`,`${expDir}/amazon-size-inputs.json`,[276,86,149,255,327,148],'Larger proportional crouching Bar on the dry riverbank; whole face and brown curls clear, both shoes supported, no visible cut seam.'));
 for(const [slug,rows] of Object.entries(selections))for(const [i,[suffix,...g]] of rows.entries()){
  const id=`adventure-${slug}-density-v3-${i+1}`;
  entries.push(make(id,`${dir}/${id}-${suffix}.png`,`${dir}/${id}-${suffix}.json`,`${dir}/${slug}-inputs.json`,g,'Inspected selected native shipping crop for canonical face/brown curls, coherent body and neighboring silhouettes, ground support and joins. Assistant suitability review only; parent likeness confirmation remains pending.'));
 }
 const review=DensityReviewSchema.parse({accepted:true,version:'density-nine-reviewed/v1',reviewer:'assistant-visual-review',parentLikenessConfirmation:'pending',avatarSha256:old.avatarSha256,identitySha256:densityHash(readFileSync(`${oldDir}/identity-normalized.png`)),entries});
 const file=`${dir}/final-review.json`,text=JSON.stringify(review,null,2);
 if(existsSync(file)&&readFileSync(file,'utf8')!==text)throw Error('Final review already sealed; do not replace silently');
 writeFileSync(file,text);
 await loadDensityReviewedAssets();
 mkdirSync('storage/adventure-density-preflight',{recursive:true});
 const images=['adventure-paris-density-v3-1-attempt-2','adventure-paris-density-v3-2-attempt-3','adventure-antarctica-density-v3-1-attempt-3'];
 await sharp({create:{width:1536,height:768,channels:3,background:'#e8e1d5'}}).composite(images.map((name,i)=>({input:`${dir}/${name}.png`,left:i*512,top:0}))).png().toFile('storage/adventure-density-preflight/parent-corrections.png');
 console.log(JSON.stringify({reviewed:entries.length,parentLikenessConfirmation:'pending',providerCalls:0}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:e);process.exitCode=1});

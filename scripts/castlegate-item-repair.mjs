// Local mask preparation / assembly only. Generation uses the bundled imagegen CLI.
import sharp from 'sharp';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='output/imagegen';
const base=`${dir}/magic-castlegate-v10-subtle-specular.png`;
const rawEdit=`${dir}/magic-castlegate-v11-items-generated.png`;
const output=`${dir}/magic-castlegate-v11-items.png`;
const regions=[
 {id:'upper-feather',left:805,top:510,width:175,height:230},
 {id:'duplicate-feather',left:790,top:775,width:180,height:160},
 {id:'upper-toy-dragon-distractor',left:1130,top:405,width:245,height:130},
 {id:'wooden-dragon',left:1260,top:680,width:265,height:225},
 {id:'silver-key',left:2600,top:825,width:235,height:115},
 {id:'folded-map',left:3215,top:1160,width:235,height:235},
 {id:'moon-brooch',left:2210,top:190,width:120,height:125},
];
const hash=b=>createHash('sha256').update(b).digest('hex');
const {data:original,info}=await sharp(base).removeAlpha().raw().toBuffer({resolveWithObject:true});
if(info.width!==3840||info.height!==2160||info.channels!==3)throw Error('Unexpected base dimensions');
const inside=(x,y)=>regions.some(r=>x>=r.left&&x<r.left+r.width&&y>=r.top&&y<r.top+r.height);
if(process.argv[2]==='prepare'){
 const mask=Buffer.alloc(info.width*info.height*4,255);
 for(const r of regions)for(let y=r.top;y<r.top+r.height;y++)for(let x=r.left;x<r.left+r.width;x++)mask[(y*info.width+x)*4+3]=0;
 await sharp(mask,{raw:{width:info.width,height:info.height,channels:4}}).png().toFile(`${dir}/magic-castlegate-v11-mask.png`);
 writeFileSync(`${dir}/magic-castlegate-v11-regions.json`,JSON.stringify(regions,null,2)+'\n');
 console.log('Prepared 7 local masks for 5 item repairs; base unchanged.');
}else if(process.argv[2]==='compose'){
 const {data:edited,info:ei}=await sharp(rawEdit).removeAlpha().raw().toBuffer({resolveWithObject:true});
 if(ei.width!==info.width||ei.height!==info.height||ei.channels!==3)throw Error('Edit geometry mismatch');
 const pixels=Buffer.from(original);
 for(const r of regions)for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
  const alpha=Math.min(1,Math.min(x,y,r.width-1-x,r.height-1-y)/5);
  const index=((r.top+y)*info.width+r.left+x)*3;
  for(let c=0;c<3;c++)pixels[index+c]=Math.round(original[index+c]*(1-alpha)+edited[index+c]*alpha);
 }
 await sharp(pixels,{raw:info}).png().toFile(output);
 const decoded=await sharp(output).removeAlpha().raw().toBuffer();
 let outside=0,changed=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const i=(y*info.width+x)*3;
  if(decoded[i]!==original[i]||decoded[i+1]!==original[i+1]||decoded[i+2]!==original[i+2]){changed++;if(!inside(x,y))outside++;}
 }
 if(outside)throw Error(`Unexpected drift: ${outside} pixels`);
 const receipt={source:base,generated:rawEdit,output,sourceSha256:hash(readFileSync(base)),outputSha256:hash(readFileSync(output)),width:info.width,height:info.height,regions,changedPixels:changed,changedOutsideRegions:outside,visualAcceptance:false};
 writeFileSync(`${dir}/magic-castlegate-v11-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
 for(const r of regions)await sharp(output).extract(r).png().toFile(`${dir}/v11-check-${r.id}.png`);
 console.log(JSON.stringify(receipt));
}else throw Error('Use prepare or compose');

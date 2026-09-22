/** Versioned child-free masters and source-only inspection evidence. No paid calls. */
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {TWO_WORLD_AUTHORING,TWO_WORLD_PATCH_BOARDS} from '../../content/adventures/two-worlds-production';
import {cropOf,maskForHide} from '../../src/domain/scene/local-patch-hides';
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
async function main(){
  const records=[];
  mkdirSync('output/two-worlds-20260919/inspection',{recursive:true});
  for(const [i,d] of TWO_WORLD_AUTHORING.entries()){
    const source=readFileSync(`output/imagegen/${d.master}.png`),meta=await sharp(source).metadata();
    if(meta.width!==3840||meta.height!==2160)throw Error(`Wrong master dimensions: ${d.slug}`);
    const dir=`public/scenes/${d.slug}`;mkdirSync(dir,{recursive:true});
    const bytes=await sharp(source).webp({lossless:true}).toBuffer();
    if(existsSync(`${dir}/base.webp`)&&sha(readFileSync(`${dir}/base.webp`))!==sha(bytes))throw Error(`Refusing to overwrite ${d.slug}`);
    writeFileSync(`${dir}/base.webp`,bytes);
    if(!existsSync(`${dir}/thumb.webp`))await sharp(source).resize(960,540).webp({quality:85}).toFile(`${dir}/thumb.webp`);
    const tiles=[];
    for(const [j,h] of TWO_WORLD_PATCH_BOARDS[i]!.hides.entries()){
      const crop=await sharp(source).extract(cropOf(h)).png().toBuffer(),m=maskForHide(h);
      const outline=Buffer.from(`<svg width="512" height="768"><rect x="${m.left}" y="${m.top}" width="${m.width}" height="${m.height}" fill="none" stroke="#ff004c" stroke-width="3"/></svg>`);
      const png=await sharp(crop).composite([{input:outline}]).png().toBuffer();
      tiles.push({input:png,left:j*528,top:0});
    }
    await sharp({create:{width:1568,height:768,channels:3,background:'#eee'}}).composite(tiles).jpeg({quality:96}).toFile(`output/two-worlds-20260919/inspection/${d.slug}-sources.jpg`);
    records.push({slug:d.slug,world:d.world,route:d.route,name:d.name,master:`output/imagegen/${d.master}.png`,masterSha256:sha(source),base:`/${dir.replace('public/','')}/base.webp`,sha256:sha(bytes),width:3840,height:2160});
  }
  const out=path.resolve('content/adventures/two-worlds-art.json');
  const json=JSON.stringify(records,null,2)+'\n';
  if(existsSync(out)&&readFileSync(out,'utf8')!==json)throw Error('Pinned art manifest differs; inspect before changing');
  writeFileSync(out,json);console.log(JSON.stringify({masters:records.length,paidCalls:0,inspectionOnly:true}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

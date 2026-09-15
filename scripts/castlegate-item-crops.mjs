// Prepare tightly framed imagegen inputs; compose only reviewed local regions.
import sharp from 'sharp';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='output/imagegen/castlegate-item-crops';mkdirSync(dir,{recursive:true});
const base='output/imagegen/magic-castlegate-v10-subtle-specular.png';
const jobs=[
 {id:'feather',crop:{left:650,top:450,width:512,height:512},regions:[{left:805,top:510,width:175,height:230},{left:790,top:775,width:180,height:160}],request:'There are TWO oversized feathers in this crop. Remove BOTH completely and restore the stone wall and small lower tabletop. Then put exactly ONE SMALL rust-and-cream striped feather diagonally beside the grey thread spool on the UPPER shelf. It should be about HALF the original feather length, not taller than the nearby large thread spool, with a clear slender quill and striped vane. No feather remains on the lower table. Preserve all people and the shelves, stone and spool colors. Only those two feather locations change.'},
 {id:'dragon',crop:{left:995,top:330,width:600,height:600},regions:[{left:1130,top:405,width:245,height:130},{left:1260,top:680,width:265,height:225}],request:'Fix the wooden toy animals on these shelves. On the UPPER shelf change only the curled dragon-like carving into one ordinary sleeping CARVED WOODEN CAT without wings, horns or scales. On the LOWER shelf to the right of the puppet seller, remove the malformed multiheaded beasts and replace them with one SMALL carved wooden dragon, in a clear SIDE VIEW: one head, two bat-shaped wings, four legs and one curling tail. This single dragon is about as long as the small elephant on the middle shelf, not as tall as the old malformed creature. One plain wooden horse may remain beside it, but no second dragon or winged creature anywhere. Restore the empty wood shelf around them. Preserve the man, puppets, other shelves and other animal toys.'},
 {id:'key',crop:{left:2430,top:620,width:512,height:512},regions:[{left:2600,top:825,width:235,height:115}],request:'Replace ONLY the confusing metal objects/tangle lying on the wooden tabletop to the right of the metal pitcher with ONE recognizable small silver DOOR KEY. Draw the key diagonally, with one simple OVAL BOW, one straight shaft and two square teeth at its end. No scissors, chains, knives, extra rings or extra keys. Its length is approximately half the pitcher height. Lay it flat on the wood, with a thin brown leather strap crossing just a small part of its shaft; oval bow and two teeth clearly visible. Keep fingers, pitcher and desk edges unchanged. Restore normal wood where the other metal clutter was.'},
 {id:'map',crop:{left:3070,top:1020,width:512,height:512},regions:[{left:3215,top:1160,width:235,height:235}],request:'There is a large exposed cream map standing inside the fruit basket. Make that SAME MAP much smaller: about HALF its current width and HALF its current height. Keep a visible folded paper map with a few thin route lines and a muted red dotted trail; no lettering. Tuck the bottom third behind the basket rim and tilt it slightly among the fruit. Restore fruit and background where the oversized paper used to be. IMPORTANT: keep exactly one visible map, do not remove it entirely, do not extend the woman\'s dress down over the fruit basket. Preserve the original dress hem, fruit basket shape, people and all surroundings.'},
 {id:'moon',crop:{left:2010,top:20,width:512,height:512},regions:[{left:2210,top:190,width:120,height:125}],request:'The large gold crescent fastening the blue curtain must become a SMALL CRESCENT-MOON BROOCH, about HALF its current height. Keep a clear solid crescent silhouette with two pointed tips and a concave inside edge; NOT a ring, chain, oval or tangled wire. Rotate it 30 degrees and tuck roughly a quarter behind a dark blue cloth fold, leaving most of its crescent recognizable. Dull aged brass without a bright highlight. Restore matching blue cloth around the smaller object, preserving curtain folds and trim. Nothing else changes.'},
];
// Expanded after visual inspection to remove old toy heads above the replacement.
jobs.find(j=>j.id==='dragon').regions[1]={left:1260,top:640,width:265,height:265};
if(process.argv[2]==='prepare'){
 for(const j of jobs){
  await sharp(base).extract(j.crop).png().toFile(`${dir}/${j.id}-input.png`);
  const prompt=`Use case: precise-object-edit\nImage 1 is a close crop from an approved illustrated game board, not a style suggestion. Keep EXACTLY the same crop, viewpoint, object positions and illustrated textured brushwork.\n\n${j.request}\n\nEverything outside the named objects must remain visually unchanged. Keep the same warm exposure, dark freehand outlines, small interior marks and dry matte pigment. Do not brighten, smooth, change faces, move architecture or add objects. No icons, arrows, writing, labels or outlines highlighting targets. Return only this same square crop, not a new wide scene.\n`;
  writeFileSync(`${dir}/${j.id}.prompt.txt`,prompt);
 }
 writeFileSync(`${dir}/jobs.json`,JSON.stringify(jobs,null,2)+'\n');
 console.log('Five source crops and prompts prepared.');
}else if(process.argv[2]==='compose'){
 const {data:original,info}=await sharp(base).removeAlpha().raw().toBuffer({resolveWithObject:true});
 const pixels=Buffer.from(original);
 for(const j of jobs){
  const edited=await sharp(`${dir}/${j.id}-edited.png`).resize(j.crop.width,j.crop.height,{fit:'fill'}).removeAlpha().raw().toBuffer();
  for(const r of j.regions)for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
   let a=Math.min(1,Math.min(x,y,r.width-1-x,r.height-1-y)/7);
   // Keep the untouched red spool instead of cutting across its curved edge.
   if(j.id==='feather'&&r.top===510){
    const clamp=v=>Math.max(0,Math.min(1,v));
    a*=1-clamp((r.left+x-885)/10)*clamp((r.top+y-655)/20);
   }
   const dst=((r.top+y)*info.width+r.left+x)*3,src=((r.top+y-j.crop.top)*j.crop.width+r.left+x-j.crop.left)*3;
   for(let c=0;c<3;c++)pixels[dst+c]=Math.round(original[dst+c]*(1-a)+edited[src+c]*a);
  }
 }
 const output='output/imagegen/magic-castlegate-v12-items.png';
 await sharp(pixels,{raw:info}).png().toFile(output);
 const decoded=await sharp(output).removeAlpha().raw().toBuffer();
 let outside=0; const rs=jobs.flatMap(j=>j.regions);
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const i=(y*info.width+x)*3;
  if((decoded[i]!==original[i]||decoded[i+1]!==original[i+1]||decoded[i+2]!==original[i+2])&&!rs.some(r=>x>=r.left&&x<r.left+r.width&&y>=r.top&&y<r.top+r.height))outside++;
 }
 if(outside)throw Error('Pixels changed outside local repair regions');
 const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
 writeFileSync(`${dir}/receipt.json`,JSON.stringify({source:base,sourceSha256:hash(base),output,outputSha256:hash(output),width:info.width,height:info.height,changedOutsideRegions:outside,jobs:jobs.map(({id,crop,regions})=>({id,crop,regions})),visualAcceptance:false},null,2)+'\n');
 for(const j of jobs)await sharp(output).extract(j.crop).png().toFile(`${dir}/${j.id}-composite.png`);
 console.log(`Saved ${output}; ${outside} changed pixels outside local regions.`);
}else throw Error('Use prepare or compose');

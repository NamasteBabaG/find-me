// Local crop/mask and pixel-preserving composition. No API calls or artwork synthesis here.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const source=path.join(root,'output/imagegen/journey-marrakech-v5-wide-festival.png');
const dir=path.join(root,'output/imagegen/journey-marrakech-v7-evidence');
await fs.mkdir(dir,{recursive:true});
const jobs=[
 {id:'slipper',x:900,y:830,rect:{x:1240,y:1200,w:180,h:110},instruction:'Add exactly ONE small red-and-cream striped leather babouche slipper to the empty patterned rug in the transparent mask below the seated girl and left of the orange shrub. It is a shoe with a closed rounded-pointed toe, open heel, hollow opening and leather sole, NOT a plate, dish, cup or other object. Approx 120 pixels long and 55 pixels wide, lying diagonally on the rug with a soft contact shadow. The complete slipper must stay within mask bounds, and occupy only that small patch. No other edits.'},
 {id:'key',x:1410,y:1050,rect:{x:1810,y:1485,w:180,h:98},instruction:'Add exactly ONE small antique brass DOOR KEY with a short magenta thread tassel, resting flat across the FRONT WOODEN EDGE of the tea table, entirely inside the transparent mask. Key anatomy is critical: one round bow with ONE hole, ONE straight narrow shaft, and TWO square teeth at the far end on ONE side. NO SCISSORS, no crossed rods, no second handle or blade. Approx 115 pixels total length, 35 pixels height, horizontal with slight diagonal. Modest brass glint, magenta tassel attached only to bow. Do not change pastries, tray, cups, table geometry, hands or people.'},
 {id:'gecko',x:1830,y:850,rect:{x:2170,y:1220,w:205,h:112},instruction:'Add exactly ONE small muted-violet GECKO clinging to the front blue tiled face/rim of the fountain, entirely inside the transparent mask. A living slender little gecko, long tapering curved tail, small head, FOUR splayed feet with toes. Approx 145 pixels from snout to tail tip, not a toy, not a bowl or boat. Side/top three-quarter view along the mosaic, tiny soft contact shadow. Body violet-purple blended naturally into the cool blue tile, recognizable without glow. Keep the fountain edges and tile grid aligned perfectly; no other changes.'},
 {id:'camel',x:1280,y:360,rect:{x:1680,y:720,w:130,h:164},instruction:'Add exactly ONE TINY SILVER CAMEL FIGURINE on the blue tile display table within the transparent mask, around the center of this crop. Side view: one hump, slender long curved neck, small camel head, four slim short legs standing in contact with the blue tile. Approx 78 pixels long and 100 pixels tall. Small souvenir scale, NOT a real large camel, not a pedestal or new table. Do not obscure or replace any person. Brushed silver with restrained glint and cool-blue reflection, not a glowing beacon. Entire camel silhouette, feet and soft contact shadow inside mask with padding; do not move the item elsewhere.'},
 {id:'clean-camel',x:1710,y:1136,rect:{x:2078,y:1738,w:252,h:258},instruction:'REMOVE ONLY the silver camel figurine from the wicker basket near the bottom center of this crop. Fill its exact former silhouette with continuous rumpled matte dark-teal cloth matching the surrounding cloth. Keep the large wicker basket at its EXACT original position, scale, shape, rim and handles. Do not move, rebuild, resize or lower the basket. Do not replace the basket with floor/rug. Reconstruct only the teal fabric behind the removed camel, all within the transparent mask. No new objects.'},
];
const common='Use case: precise-object-edit. This is a 1024x1024 NATIVE PIXEL crop from an approved illustrated children\'s hidden-object board. Image 1 is the edit target. Preserve EXACT framing, geometry, every face and hand, light, fine brush texture and all background outside the transparent mask. Do not rescale, recompose, reinterpret, blur, sharpen, brighten or recolor. No text, arrows or outline marks. Keep the dimensional storybook illustration, not photorealism and not flat cartoon. The small alpha-mask region is the ONLY editable area. ';
for(const j of jobs){
 const input=path.join(dir,j.id+'-input.png');
 await sharp(source).extract({left:j.x,top:j.y,width:1024,height:1024}).png().toFile(input);
 const b=Buffer.alloc(1024*1024*4,255);
 for(let y=j.rect.y-j.y;y<j.rect.y-j.y+j.rect.h;y++) for(let x=j.rect.x-j.x;x<j.rect.x-j.x+j.rect.w;x++) b[(y*1024+x)*4+3]=0;
 await sharp(b,{raw:{width:1024,height:1024,channels:4}}).png().toFile(path.join(dir,j.id+'-mask.png'));
 await fs.writeFile(path.join(dir,j.id+'.prompt.txt'),common+j.instruction+'\n');
}
await fs.writeFile(path.join(dir,'jobs.json'),JSON.stringify(jobs,null,2)+'\n');
if(process.argv.includes('--merge')) {
 const raw=await sharp(source).removeAlpha().raw().toBuffer();
 const result=Buffer.from(raw), W=3840,H=2160;
 const previous=await sharp(path.join(root,'output/imagegen/journey-marrakech-v6-api-edit.png')).removeAlpha().raw().toBuffer();
 const previousRects=[{x:730,y:1830,w:280,h:192},{x:2500,y:1880,w:368,h:222},{x:1450,y:1760,w:162,h:110}];
 function paste(buf,bw,bx,by,r){
  for(let y=r.y;y<r.y+r.h;y++) for(let x=r.x;x<r.x+r.w;x++){
   const a=Math.min(1,Math.min(x-r.x,y-r.y,r.x+r.w-1-x,r.y+r.h-1-y)/6),i=(y*W+x)*3,k=((y-by)*bw+x-bx)*3;
   for(let c=0;c<3;c++)result[i+c]=Math.round(raw[i+c]*(1-a)+buf[k+c]*a);
  }
 }
 for(const r of previousRects)paste(previous,W,0,0,r);
 for(const j of jobs){
  const p=path.join(dir,j.id+'-output.png'),m=await sharp(p).metadata();
  if(m.width!==1024||m.height!==1024)throw new Error('Crop size mismatch: '+j.id);
  paste(await sharp(p).removeAlpha().raw().toBuffer(),1024,j.x,j.y,j.rect);
 }
 const allRects=[...previousRects,...jobs.map(j=>j.rect)];
 let changedOutside=0,changedInside=0;
 for(let y=0;y<H;y++) for(let x=0;x<W;x++){
  const i=(y*W+x)*3;
  if(result[i]===raw[i]&&result[i+1]===raw[i+1]&&result[i+2]===raw[i+2])continue;
  if(allRects.some(r=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h))changedInside++;else changedOutside++;
 }
 if(changedOutside)throw new Error('Protected pixels changed');
 const final=path.join(root,'output/imagegen/journey-marrakech-v7-inner-targets.png');
 await sharp(result,{raw:{width:W,height:H,channels:3}}).png().toFile(final);
 for(const j of jobs)await sharp(final).extract({left:j.rect.x-45,top:j.rect.y-45,width:j.rect.w+90,height:j.rect.h+90}).png().toFile(path.join(dir,j.id+'-inspection.png'));
 await fs.writeFile(path.join(dir,'preservation.json'),JSON.stringify({final,changedOutside,changedInside,rects:allRects},null,2)+'\n');
 console.log(JSON.stringify({final,changedOutside,changedInside}));
}else console.log(JSON.stringify({dir,jobs:jobs.map(j=>j.id)}));

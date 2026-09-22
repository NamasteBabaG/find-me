// Final non-generative composition of API-rendered props over the unchanged approved board.
// Tight alpha masks avoid importing a reinterpreted table/tiles from the local render.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(), W=3840,H=2160;
const dir=path.join(root,'output/imagegen/journey-marrakech-v8-evidence');
const p7=path.join(root,'output/imagegen/journey-marrakech-v7-evidence');
await fs.mkdir(dir,{recursive:true});
const source=path.join(root,'output/imagegen/journey-marrakech-v5-wide-festival.png');
const raw=await sharp(source).removeAlpha().raw().toBuffer(),result=Buffer.from(raw);
const v6=await sharp(path.join(root,'output/imagegen/journey-marrakech-v6-api-edit.png')).removeAlpha().raw().toBuffer();
const clean=await sharp(path.join(p7,'clean-camel-output.png')).removeAlpha().raw().toBuffer();
const guard=Buffer.alloc(W*H);
function pastePatch(buf,bw,bx,by,r){
 for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){
  const a=Math.min(1,Math.min(x-r.x,y-r.y,r.x+r.w-1-x,r.y+r.h-1-y)/6),i=(y*W+x)*3,k=((y-by)*bw+x-bx)*3;
  guard[y*W+x]=1;
  for(let c=0;c<3;c++)result[i+c]=Math.round(raw[i+c]*(1-a)+buf[k+c]*a);
 }
}
for(const r of [{x:730,y:1830,w:280,h:192},{x:2500,y:1880,w:368,h:222},{x:1450,y:1760,w:162,h:110}])pastePatch(v6,W,0,0,r);
pastePatch(clean,1024,1710,1136,{x:2078,y:1738,w:252,h:258});
const inserts=[
 {id:'slipper',left:1220,top:1150,w:245,h:170,shape:'<path d="M38 91 L44 77 L62 67 L77 52 L91 56 L107 48 L122 49 L130 55 L130 66 L120 80 L104 89 L80 99 L51 106 L39 101 Z"/>'},
 {id:'key',left:1775,top:1433,w:185,h:105,shape:'<path d="M25 56 L47 49 L59 51 L65 43 L71 36 L85 34 L94 35 L125 25 L152 21 L157 39 L149 47 L137 45 L129 40 L99 48 L96 60 L84 67 L70 64 L57 67 L46 78 L32 75 L27 68 Z"/>'},
 {id:'camel',left:1680,top:739,w:110,h:128,shape:'<path d="M17 28 L29 21 L40 27 L40 39 L34 48 L41 48 L50 38 L61 30 L75 39 L84 47 L88 67 L87 98 L78 106 L70 100 L66 81 L61 84 L57 104 L47 106 L40 99 L39 79 L32 67 L24 63 L19 51 Z"/>'},
 {id:'gecko',left:2160,top:1208,w:165,h:100,shape:'<path d="M35 41 L38 29 L46 28 L51 32 L62 30 L72 34 L81 34 L84 28 L85 23 L92 21 L97 27 L93 35 L103 42 L111 48 L125 50 L140 60 L153 72 L147 75 L130 65 L114 58 L96 55 L87 51 L82 54 L86 62 L81 71 L74 67 L72 57 L61 54 L56 59 L54 68 L45 69 L40 64 L42 57 L46 50 L39 50 Z"/>'},
];
const isolationRects={key:[365,375,185,105],camel:[407,336,110,128],slipper:[315,345,245,170],gecko:[345,395,165,100]};
for(const o of inserts){
 const [left,top,width,height]=isolationRects[o.id];
 await sharp(path.join(p7,o.id+'-output.png')).extract({left,top,width,height}).png().toFile(path.join(p7,o.id+'-isolating.png'));
}
for(const o of inserts){
 const rgb=await sharp(path.join(p7,o.id+'-isolating.png')).removeAlpha().raw().toBuffer();
 const mask=await sharp(Buffer.from(`<svg width="${o.w}" height="${o.h}"><g fill="white">${o.shape}</g></svg>`)).ensureAlpha().blur(0.5).raw().toBuffer();
 for(let y=0;y<o.h;y++)for(let x=0;x<o.w;x++){
  const a=mask[(y*o.w+x)*4+3]/255;if(!a)continue;
  const dx=o.left+x,dy=o.top+y,i=(dy*W+dx)*3,k=(y*o.w+x)*3;
  guard[dy*W+dx]=1;
  for(let c=0;c<3;c++)result[i+c]=Math.round(result[i+c]*(1-a)+rgb[k+c]*a);
 }
}
let changedOutside=0,changedInside=0;
for(let i=0;i<W*H;i++)if(result[i*3]!==raw[i*3]||result[i*3+1]!==raw[i*3+1]||result[i*3+2]!==raw[i*3+2]){if(guard[i])changedInside++;else changedOutside++;}
if(changedOutside)throw new Error('Protected pixels altered');
const final=path.join(root,'output/imagegen/journey-marrakech-v8-inner-targets.png');
await sharp(result,{raw:{width:W,height:H,channels:3}}).png().toFile(final);
for(const o of inserts)await sharp(final).extract({left:o.left-35,top:o.top-35,width:o.w+70,height:o.h+70}).png().toFile(path.join(dir,o.id+'.png'));
await fs.writeFile(path.join(dir,'preservation.json'),JSON.stringify({source,final,changedOutside,changedInside,inserts},null,2)+'\n');
console.log(JSON.stringify({final,changedOutside,changedInside}));

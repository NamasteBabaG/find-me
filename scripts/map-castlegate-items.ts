/** Authoring-only discovery map: never imports into the purchasable catalog. */
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {DiscoverySchema, overlaps} from '../src/domain/adventure/content';
const dir='output/imagegen/castlegate-item-crops';
const base='output/imagegen/magic-castlegate-v12-items.png';
const expectedSha='ac096862c6b86d2f4b2fc8062084e98f3f7c01fbdee9d4341f1a950c9439955c';
const width=3840,height=2160;
const t=(he:string,en:string)=>({he,en});
const definitions=[
 {id:'copper-bell',name:t('פעמון נחושת','Copper bell'),rarity:'common',difficulty:1,box:[665,1206,60,76],hint:t('חפשו על שולחן המכתבים.','Look on the letter-writing desk.'),story:t('הפעמון מחכה להודיע שהדואר הגיע.','The bell is waiting to announce the mail.')},
 {id:'wooden-dragon',name:t('דרקון עץ','Wooden dragon'),rarity:'common',difficulty:1,box:[1386,690,96,99],hint:t('חפשו על מדף הצעצועים ליד הסוס.','Look on the toy shelf beside the horse.'),story:t('הדרקון המגולף מחכה לחבר שייקח אותו להרפתקה.','The carved dragon is waiting for a friend to take it on an adventure.')},
 {id:'striped-feather',name:t('נוצה מפוספסת','Striped feather'),rarity:'common',difficulty:1,box:[862,628,40,64],hint:t('חפשו ליד סלילי החוטים הצבעוניים.','Look beside the colorful thread spools.'),story:t('נוצה קטנה מצאה מקום בין החוטים.','A little feather found a place among the threads.')},
 {id:'silver-key',name:t('מפתח כסף','Silver key'),rarity:'rare',difficulty:2,box:[2639,860,63,43],hint:t('אולי השומר הניח משהו על שולחן העץ.','Perhaps the guard left something on the wooden desk.'),story:t('לאיזו דלת מתאים המפתח הקטן?','Which door does the little key open?')},
 {id:'folded-map',name:t('מפה מקופלת','Folded map'),rarity:'rare',difficulty:2,box:[3258,1261,95,76],hint:t('הדרך מסתתרת בין הפירות שבסל.','The route is hiding among the fruit in the basket.'),story:t('מפה קטנה מחכה למסע אחרי הקניות.','A little map is waiting for a journey after the shopping.')},
 {id:'moon-brooch',name:t('סיכת ירח','Moon brooch'),rarity:'epic',difficulty:3,box:[2245,223,39,42],hint:t('גם ביום אפשר למצוא ירח בין קפלי הבד הכחול.','Even by day, a moon can hide among the blue cloth folds.'),story:t('סיכת הירח שומרת שהבד יישאר במקומו.','The moon brooch helps keep the cloth in place.')},
] as const;
const rect=(x:number,y:number,w:number,h:number)=>({x:x/width,y:y/height,w:w/width,h:h/height});
async function main(){
 const bytes=readFileSync(base),sha=createHash('sha256').update(bytes).digest('hex');
 if(sha!==expectedSha)throw Error('Artwork changed; re-author mapping before reuse');
 const metadata=await sharp(bytes).metadata();if(metadata.width!==width||metadata.height!==height)throw Error('Wrong art dimensions');
 const reviewCards=[];
 const discoveries=await Promise.all(definitions.map(async d=>{
  const [x,y,w,h]=d.box;const side=Math.max(w,h)+24;
  const crop={left:Math.floor(x+w/2-side/2),top:Math.floor(y+h/2-side/2),width:side,height:side};
  const discovery=DiscoverySchema.parse({id:d.id,name:d.name,hint:d.hint,category:'object',rarity:d.rarity,difficulty:d.difficulty,description:{kind:'story',text:d.story},visibleRect:rect(x,y,w,h),hitRect:rect(x,y,w,h),cardCrop:rect(crop.left,crop.top,side,side)});
  await sharp(bytes).extract(crop).png().toFile(`${dir}/${d.id}-card.png`);
  return discovery;
 }));
 for(let i=0;i<discoveries.length;i++)for(let j=0;j<i;j++)if(overlaps(discoveries[i]!.hitRect,discoveries[j]!.hitRect))throw Error('Overlapping item hit rectangles');
 // Review enlargement only: these tiles are not additional generated details.
 for(let i=0;i<definitions.length;i++)reviewCards.push({input:await sharp(`${dir}/${definitions[i]!.id}-card.png`).resize(180,180).png().toBuffer(),left:i*188+4,top:4});
 await sharp({create:{width:1132,height:188,channels:3,background:'#eee7d7'}}).composite(reviewCards).png().toFile(`${dir}/six-item-review.png`);
 const draft={status:'authored-not-playtested',boardSlug:'magic-castlegate',source:base,art:{width,height,sha256:sha},discoveries,checks:{schema:true,nonOverlappingHits:true,sourceHash:true},remaining:['in-game mobile zoom/touch/HUD verification','personal hide zones and patch protection','release integration']};
 writeFileSync(`${dir}/discoveries.draft.json`,JSON.stringify(draft,null,2)+'\n');
 console.log('6/6 discovery schemas valid; rectangles in bounds; zero overlapping hits; source SHA256 pinned. Runtime/mobile not tested.');
}
main().catch(e=>{console.error(e);process.exitCode=1});

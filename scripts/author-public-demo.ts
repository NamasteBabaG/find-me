/** Deterministic source-bound authoring. No provider calls or customer data. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { LocalPatchBoardSchema, assertPlaceable } from '../src/domain/scene/local-patch-hides';
import { ReadyAdventureBoardSchema } from '../src/domain/adventure/content';
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const text = (en: string, he: string) => ({ en, he });
const rect = (x: number, y: number, w: number, h: number) => ({ x:x/3840, y:y/2160, w:w/3840, h:h/2160 });
async function main() {
  mkdirSync('public/scenes/demo-beach-v1', {recursive:true});
  mkdirSync('content/demo', {recursive:true});
  const base = await sharp('output/imagegen/demo-beach-v2.png').webp({lossless:true,effort:6}).toBuffer();
  writeFileSync('public/scenes/demo-beach-v1/base.webp', base);
  await sharp(base).resize(960,540).webp({quality:82,effort:6}).toFile('public/scenes/demo-beach-v1/thumb.webp');
  const placements = [
    {id:'beach-sandcastle',targetId:'sandcastle',left:1220,top:850,pose:'kneeling',mask:{left:80,top:300,width:275,height:360},height:350,
     en:'Replace ONLY the kneeling girl in a red-and-white striped top collecting shells next to the sandcastle with the reference girl. Keep her complete coherent kneeling body, hands touching a shell and her head turned three-quarter toward the viewer. Preserve every neighbouring person and castle. She wears a muted coral summer top and blue shorts; no hat. Match her existing size and grounded knees, not a giant foreground child.',he:'חפשו בין הילדים שאוספים צדפים ליד ארמון החול'},
    {id:'beach-library',targetId:'library',left:3040,top:300,pose:'standing',mask:{left:145,top:235,width:150,height:400},height:360,
     en:'Replace ONLY the small child in the yellow dress and straw hat, standing with the blue-shirt boy and their mother looking at a beach map, with the reference girl. Remove this child hat so her brown wavy hair is visible. Same small full-body scale and grounded sandals, muted yellow summer top and shorts. Turn her face three-quarter toward the viewer while one hand indicates the map. Preserve the blue-shirt boy, both mothers, and the child reading a book at the bottom of the crop exactly. Change no pixels near the outer frame.',he:'חפשו ליד הילדים שמסתכלים במפת החוף'},
    {id:'beach-shells',targetId:'shells',left:2060,top:1140,pose:'kneeling',mask:{left:130,top:200,width:250,height:400},height:380,
     en:'Replace ONLY the girl in a purple sleeveless top making a necklace behind the shell-covered craft table with the reference girl. Keep the seated/kneeling body correctly behind the table, both arms handling a necklace, face turned slightly toward the viewer. Muted lavender top, no hat, correct brown wavy hair. The table naturally hides the lower body; do not cut through a torso or repaint surrounding children or shells.',he:'חפשו את מי שמכינה שרשרת ליד שולחן הצדפים'},
  ] as const;
  const board = LocalPatchBoardSchema.parse({board:'beach',art:'public/scenes/demo-beach-v1/base.webp',ground:'dry sunlit beach sand',sittable:true,
    wardrobe:'Age-appropriate illustrated summer clothing; muted fabric, shorts and sandals. No hat. Preserve the reference face and long brown wavy hair, no generic bystander face.',
    hides:placements.map(p=>({id:p.id,targetId:p.targetId,left:p.left,top:p.top,pose:p.pose,mask:p.mask,hint:text(p.en,p.he),placement:{depth:'middle',standingHeightPx:p.height,support:'Feet or knees rest naturally on the existing sand; no floating.',lighting:'Warm sun from upper left, thin brown ink contour, matte broken brushwork and short cast shadow matching neighbouring figures.',occlusion:'Preserve all pre-existing foreground objects; body anatomy remains coherent behind any table.',comparators:'Match the size and hand-drawn line weight of the child being replaced and the neighbouring children.'}}))});
  assertPlaceable(board,{width:3840,height:2160});
  const items = [
    ['blue-fish','Blue wooden fish','דג עץ כחול','Look among the tiny boats.','חפשו בין הסירות הקטנות',180,518,66,38,'common',1],
    ['anchor-bucket','Anchor bucket','דלי עם עוגן','Something waits beside the sandcastle.','משהו מחכה ליד ארמון החול',1116,1110,77,74,'common',1],
    ['star-mould','Star mould','תבנית כוכב','Which shape is hiding among the sand toys?','איזו צורה מסתתרת בין צעצועי החול?',2225,997,82,70,'common',1],
    ['paper-boat','Purple paper boat','סירת נייר סגולה','Look beside the picnic basket.','הציצו לצד סל הפיקניק',847,1862,111,68,'rare',2],
    ['compass','Brass compass','מצפן פליז','Follow the coils of rope.','חפשו בין פיתולי החבל',2765,671,74,61,'rare',2],
    ['seahorse','Turquoise seahorse','סוסון ים בטורקיז','A little sea creature among the necklaces.','יצור ים קטן בין השרשראות',1902,1818,92,91,'epic',3],
  ] as const;
  const plan = ReadyAdventureBoardSchema.parse({boardSlug:'beach',worldSlug:'adventure-trail',name:text('A day at the beach','יום בחוף הים'),plannedHides:3,collectionUi:'guided-v1',status:'ready',sceneVersion:9,
    direction:{orientation:'landscape',aspect:'16:9',spread:'activity-across-width-and-height',perspective:'shallow',scaleTreatment:'similar-size-people',illustration:'storybook-hand-drawn',identityPrecedence:'reference-face-hair-age',locationCues:[text('Busy beach','חוף מלא פעילות'),text('Seaside huts','בקתות חוף')],microStories:[text('Building sandcastles','בונים ארמונות חול'),text('Making shell necklaces','מכינים שרשראות צדפים'),text('Borrowing beach books','שואלים ספרים לחוף'),text('Making wooden boats','בונים סירות עץ')]},
    art:{base:'/scenes/demo-beach-v1/base.webp',sha256:hash(base),width:3840,height:2160},personalZones:board.hides.map(h=>rect(h.left,h.top,512,768)),
    discoveries:items.map(([id,en,he,hintEn,hintHe,x,y,w,h,rarity,difficulty])=>({id,name:text(en,he),hint:text(hintEn,hintHe),category:'object',rarity,difficulty,description:{kind:'story',text:text('A little treasure from our day at the beach.','אוצר קטן מהיום שלנו בחוף הים.')},visibleRect:rect(x,y,w,h),hitRect:rect(x+3,y+3,w-6,h-6),cardCrop:rect(x-9,y-9,w+18,h+18)})),
    postcard:{id:'beach-memory',title:text('My day by the sea','היום שלי ליד הים'),targetId:'sandcastle',crop:rect(1190,1080,650,510)}});
  writeFileSync('content/demo/beach-v1-plan.json',JSON.stringify({patchBoard:board,plan},null,2)+'\n');
  for(const h of board.hides) await sharp(base).extract({left:h.left,top:h.top,width:512,height:768}).png().toFile(`output/imagegen/${h.id}-before.png`);
  const crops = await Promise.all(items.map(async ([, , , , ,x,y,w,h])=>({input:await sharp(base).extract({left:x-18,top:y-18,width:w+36,height:h+36}).resize(250,250,{fit:'contain',background:'#eeeeee'}).png().toBuffer()})));
  await sharp({create:{width:1500,height:250,channels:3,background:'#eeeeee'}}).composite(crops.map((c,i)=>({...c,left:i*250,top:0}))).png().toFile('output/imagegen/demo-items-final-review.png');
  const identityDir='storage/public-demo-beach-20260915-v2';
  writeFileSync(`${identityDir}/identity-review.json`,JSON.stringify({accepted:true,identitySha256:hash(readFileSync(`${identityDir}/identity.png`)),inputsSha256:hash(readFileSync(`${identityDir}/identity-inputs.json`)),review:'Visually reviewed same public example girl: long brown wavy hair, rounded cheek shape, matching eyes and smile, no hat; matte ink-and-paint technique.'},null,2));
  console.log({boardSha256:hash(base),hides:3,items:6,paidCalls:0});
}
main().catch(e=>{console.error(e);process.exitCode=1;});

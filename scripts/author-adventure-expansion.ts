/** Hand-reviewed coordinates in the 2048x1152 review; never guesses objects. */
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {LocalPatchBoardSchema,assertPlaceable,cropOf} from '../src/domain/scene/local-patch-hides';
import {ReadyAdventureBoardSchema} from '../src/domain/adventure/content';
import {ADVENTURE_THREE_BOARDS} from '../content/adventures/three-boards';
type Box=[number,number,number,number];
type Item=[string,string,string,Box,string,string,(1|2|3)?];
type Hide=[number,number,number,number,number,number,string,string,string,number];
type Spec={name:string;en:string;wardrobe:string;items:Item[];hides:Hide[]};
const specs:Record<string,Spec>={
 sydney:{name:'סידני',en:'Sydney',wardrobe:'Muted sea-blue shirt, ochre shorts, comfortable brown shoes; no hat hiding curls.',items:[
  ['blue-goggles','משקפת שחייה','Swim goggles',[323,531,88,48],'חפשו ליד סלסילות הפיקניק','Look beside the picnic baskets'],
  ['yellow-bucket','דלי צהוב','Yellow bucket',[1390,632,86,81],'חפשו בין כלי הגינון','Look among the gardening tools'],
  ['toy-lifering','גלגל הצלה קטן','Little life ring',[234,986,73,49],'חפשו בין סירות הצעצוע','Look among the toy boats'],
  ['green-boomerang','בומרנג ירוק','Green boomerang',[607,322,76,88],'חפשו בתוך שקית המזכרות','Look inside the souvenir bag'],
  ['purple-plane','מטוס נייר סגול','Purple paper plane',[1515,390,88,60],'חפשו בין עלי הערוגה','Look among the planter leaves'],
  ['pearl-shell','צדפה עם פנינה','Pearl shell',[1570,1006,105,58],'חפשו בין הצדפים והרשת','Look among shells and netting',2],
 ],hides:[
  [1880,160,90,190,235,410,'standing','חפשו בין הילדים שמסתכלים על הבועות','Dry level harbor promenade with the children watching soap bubbles, inside the safety rail. Match nearby child scale and face light.',360],
  [1580,1330,75,160,255,385,'peeking','חפשו ליד שולחן היצירה וסירת העץ','Standing on dry paving behind the little craft table beside the woman repairing a wooden toy boat. Lower torso naturally hidden by the table, full face visible.',390],
  [3050,10,80,200,235,490,'standing','חפשו ליד חלון הכרטיסים למעבורת','Dry safe harbor pavement in the line at the ferry ticket kiosk. Bar waits beside the window, face turned in a readable three-quarter view; preserve neighboring customers.',400],
 ]},
 antarctica:{name:'אנטארקטיקה',en:'Antarctica',wardrobe:'Warm ochre insulated jacket, muted teal snow trousers, dark snow boots and gloves; hood down behind neck so the face and curly hair remain clear.',items:[
  ['star-mug','ספל עם כוכב','Star mug',[50,238,54,60],'חפשו בין התרמוסים והספלים','Look among thermoses and mugs'],
  ['red-mittens','כפפות אדומות','Red mittens',[1398,537,127,69],'חפשו בין הבדים על שולחן הציוד','Look among fabrics on the equipment table'],
  ['yellow-goggles','משקפי שלג צהובים','Yellow snow goggles',[153,990,114,75],'חפשו ליד כלי המדידה','Look beside the measuring tools'],
  ['purple-compass','מצפן סגול','Purple compass',[264,591,56,47],'חפשו בין המפות הפרושות','Look among the unfolded maps'],
  ['orange-penguin','פינגווין צעצוע','Toy penguin',[1927,102,39,42],'חפשו בין הארגזים בתחנה','Look among the station crates'],
  ['snowflake-pendant','תליון פתית שלג','Snowflake pendant',[1315,999,83,103],'חפשו בין הסריגים במזוודת הציוד','Look among knits in the equipment case',2],
 ],hides:[
  [830,40,110,240,240,390,'standing','חפשו ליד הילדים עם השתייה החמה','Wooden station boardwalk beside the child holding a warm mug. Stable boots on the boardwalk, hood down, preserve nearby figures and door.',370],
  [1630,700,80,120,255,395,'kneeling','חפשו ליד הילדים שבודקים גלילי קרח','Packed snow beside ice sample cylinders. Kneel with correctly folded legs and gloved hands beside an ice sample. Match nearby child size, no miniature figure.',420],
  [550,1270,80,130,255,365,'peeking','חפשו ליד שולחן כלי המחקר למטה','Packed snow behind the equipment workbench, lower body partly behind the table, face and curls fully visible beside the nearby adult.',400],
 ]},
 tokyo:{name:'טוקיו',en:'Tokyo',wardrobe:'Muted ochre shirt with a simple blue overshirt, navy shorts, brown trainers; uncovered curly hair.',items:[
  ['yellow-robot','רובוט צהוב','Yellow robot',[314,201,61,80],'חפשו בחנות הצעצועים','Look inside the toy shop'],
  ['flower-fan','מניפה עם פרח','Flower fan',[1678,258,80,67],'חפשו ליד דוכן האוכל','Look beside the noodle stall'],
  ['fish-windsock','דג בד כחול','Blue fabric fish',[72,928,197,77],'חפשו בתוך סל נמוך','Look inside a low basket'],
  ['origami-frog','צפרדע נייר','Paper frog',[1392,903,58,41],'חפשו בין קיפולי הנייר והידיים','Look among folded paper and busy hands'],
  ['lucky-cat','חתול מזל קטן','Little lucky cat',[1698,337,38,44],'חפשו בין הכלים שעל הדלפק','Look among dishes on the counter'],
  ['crane-charm','תליון עגור','Crane charm',[1557,987,132,95],'חפשו בין הניירות והחוט האדום','Look among paper and a red cord',2],
 ],hides:[
  [1300,240,135,195,215,335,'standing','חפשו ליד השער והילדים מאחורי התופים','Stone courtyard beside the child waving near the shrine gate. Replace only this small child, preserving neighbors and gate.',330],
  [1710,850,120,150,235,420,'standing','חפשו ליד ערוגת הפרחים במרכז','Level paving beside the flower planter and drummers. Match the small standing child in this group.',360],
  [590,1240,100,300,250,410,'sitting-cross-legged','חפשו בין המקשיבים לסיפור ליד הספר','A floor cushion beside the children listening to the grandfather with an open book. Sit naturally with folded legs; keep the book and neighbors unchanged.',400],
 ]},
 greatwall:{name:'החומה הגדולה',en:'Great Wall',wardrobe:'Muted teal jacket over ochre shirt, dark trousers and sturdy brown shoes; no hat obscuring curls.',items:[
  ['cloud-drum','תוף עם ענן','Cloud drum',[535,327,80,104],'חפשו בין כלי הנגינה','Look among the musical instruments'],
  ['blue-bottle','בקבוק כחול','Blue bottle',[1538,551,43,103],'חפשו ליד סל האוכל','Look beside the food basket'],
  ['brass-compass','מצפן זהוב','Brass compass',[230,972,63,65],'חפשו בין הידיים והמפות','Look among hands and maps'],
  ['purple-fan','מניפה סגולה','Purple fan',[153,657,148,103],'חפשו ליד מגש התה','Look beside the tea tray'],
  ['jade-turtle','צב ירוק','Green turtle',[1893,368,136,70],'חפשו ליד העציץ שעל החומה','Look beside the planter on the wall'],
  ['dragon-charm','דרקון אדום קטן','Little red dragon',[1704,1043,135,99],'חפשו בין המפות שבתיבת המסע','Look among maps in the travel chest',2],
 ],hides:[
  [2370,120,140,250,235,410,'standing','חפשו ליד הילדים והעפיפונים למעלה','Broad protected stone walkway behind the near wall, beside the child watching kites. Feet on stone and whole face turned three-quarter toward the activity.',340],
  [640,835,100,60,255,470,'peeking','חפשו ליד השולחן שבו מגישים תה','Protected walkway behind the tea counter. Bar peeks beside the counter with his lower body naturally hidden; face and curls fully visible.',380],
  [2100,1340,140,215,250,420,'kneeling','חפשו ליד הילדים המציירים על האבן','A low seat and stone paving at the sketching activity; kneel beside the drawing board with realistic folded legs. Face in readable three-quarter view, not back of head.',420],
 ]},
 paris:{name:'פריז',en:'Paris',wardrobe:'Muted teal shirt, tan shorts, brown comfortable shoes; no hat over the curls.',items:[
  ['heart-beret','ברט עם לב','Heart beret',[292,368,82,36],'חפשו על שולחן בית הקפה','Look on a cafe table'],
  ['star-cup','ספל עם כוכב','Star cup',[1918,340,58,46],'חפשו בין הכוסות ליד המאפייה','Look among cups beside the bakery'],
  ['yellow-bus','אוטובוס צעצוע','Toy bus',[258,982,103,76],'חפשו בין סלי הירקות','Look between the vegetable baskets'],
  ['ribbon-key','מפתח עם סרט','Ribbon key',[1410,566,63,60],'חפשו בין גלויות ובד כחול','Look among postcards and blue cloth'],
  ['paper-boat','סירת נייר','Paper boat',[1008,859,73,41],'חפשו על שפת המזרקה','Look along the fountain edge'],
  ['eiffel-souvenir','מגדל אייפל קטן','Little Eiffel Tower',[1600,1010,161,126],'חפשו מזכרת שנחה בין הגלויות','Look for a souvenir resting among postcards',2],
 ],hides:[
  [1700,150,155,250,210,360,'standing','חפשו ליד הילדים והמוזיקאים','Level stone plaza next to the upper group of children and musicians. Match nearby blue-shirted child scale; same three-quarter stance.',340],
  [200,1030,115,50,230,410,'standing','חפשו בין סלי הירקות ליד השוק','Cobbled paving beside the vegetable baskets. Replace the small child within the mask only, retaining all baskets and surrounding adults.',350],
  [2800,280,105,95,235,465,'standing','חפשו ליד הדלפק של המאפייה','Stone floor in front of the bakery counter. A five-year-old beside the counter with visible face in three-quarter view, not an adult baker.',370],
 ]},
 marrakech:{name:'מרקש',en:'Marrakech',wardrobe:'Muted mustard tunic, blue shorts and worn brown sandals; hair and curls visible.',items:[
  ['eye-amulet','קמע כחול','Blue amulet',[111,129,43,61],'חפשו בין השרשראות התלויות','Look among the hanging cords'],
  ['striped-slipper','נעל בית מפוספסת','Striped slipper',[274,551,69,90],'חפשו ליד הילדים והבדים','Look beside the children and fabrics'],
  ['crescent-cup','ספל עם ירח','Crescent cup',[1183,942,63,57],'חפשו על מגש התה העגול','Look on the round tea tray'],
  ['tassel-key','מפתח עם גדיל','Tassel key',[887,245,97,89],'חפשו בין קפלי השטיח','Look among the folds of the rug'],
  ['violet-gecko','שממית סגולה','Violet gecko',[1384,532,75,53],'חפשו מאחורי הכדים','Look behind the pottery'],
  ['silver-camel','גמל כסף קטן','Little silver camel',[1714,826,160,105],'חפשו מתחת לבד שבסל הכלים','Look beneath the fabric in the pottery basket',2],
 ],hides:[
  [2880,65,170,245,265,300,'crouching','חפשו ליד הילדים שמשחקים בגולות','Dry courtyard ground next to the children playing marbles. Crouch naturally with knees bent and both feet firmly on paving.',370],
  [980,720,140,60,265,410,'sitting-cross-legged','חפשו בצד מעגל הילדים על הכריות','The patterned cushion occupied by the green-shirted child on the left of the storytelling circle. Replace only that child with Bar sitting naturally; preserve all neighboring women and children.',370],
  [1770,650,70,40,260,365,'sitting-cross-legged','חפשו בין המקשיבים למספר הסיפורים','A patterned floor cushion in the story circle, sitting cross-legged with anatomically correct folded legs. Match the adjacent seated children and ground plane.',390],
 ]},
};
const rect=([x,y,w,h]:Box)=>({x:x/2048,y:y/1152,w:w/2048,h:h/1152});
async function main(){
 const slug=process.argv[2];if(!slug)throw Error('Choose a board');const s=specs[slug];if(!s)throw Error('An explicitly reviewed spec is required');
 const file=`content/adventures/expansion/${slug}.json`;if(existsSync(file)&&(process.argv[3]!=='--refresh-unrendered'||existsSync(`storage/adventure-bar-expansion-20260914/${slug}-inputs.json`)))throw Error('Frozen authoring exists');
 const src=`output/imagegen/adventure-expansion-20260914-v1/${slug}-4k-v2.png`,bytes=readFileSync(src),meta=await sharp(bytes).metadata();if(meta.width!==3840||meta.height!==2160)throw Error('Not native 4K');
 const folder=`public/scenes/adventure-${slug}-v1`;mkdirSync(folder,{recursive:true});
 await sharp(bytes).webp({lossless:true}).toFile(`${folder}/base.webp`);
 await sharp(bytes).resize(768,432).webp({quality:84}).toFile(`${folder}/thumb.webp`);
 const packed=readFileSync(`${folder}/base.webp`);
 const patchBoard=LocalPatchBoardSchema.parse({board:`adventure-${slug}`,art:`${folder}/base.webp`,ground:'Safe pedestrian ground within the illustrated activity, never unsupported air or traffic',sittable:true,wardrobe:s.wardrobe,hides:s.hides.map(([left,top,ml,mt,mw,mh,pose,he,support,standingHeightPx],i)=>({id:`adventure-${slug}-${i+1}`,targetId:`hide-${i+1}`,left,top,pose,mask:{left:ml,top:mt,width:mw,height:mh},hint:{he,en:support},placement:{depth:'middle',standingHeightPx,support,lighting:'Match the immediate neighboring illustrated faces: the same side-lit warm highlights, cooler shadow planes, drawn brown contour weight and painted fabric. Preserve the canonical Bar face, never photo collage.',occlusion:'Allow partial natural overlap from a nearby object only below the face. The whole face, eyes and curls must remain recognizable. No merged hands or limbs.',comparators:`Age five with natural child proportions. Match the head scale of the adjacent child, normally about 85-100 crop pixels including curls. A standing equivalent is about ${standingHeightPx}px, never a miniature figure. Integrate three-quarter view and expression into this little story without losing identity.`}}))});
 assertPlaceable(patchBoard,{width:3840,height:2160});
 const template=ADVENTURE_THREE_BOARDS.boards[0]!;
 if(template.status!=='ready')throw Error('Template must be ready');
 const plan=ReadyAdventureBoardSchema.parse({...template,boardSlug:patchBoard.board,name:{he:s.name,en:s.en},sceneVersion:10,art:{base:`/scenes/adventure-${slug}-v1/base.webp`,width:3840,height:2160,sha256:createHash('sha256').update(packed).digest('hex')},direction:{...template.direction,locationCues:[{he:s.name,en:s.en},{he:'אנשים ופעילויות מקומיות',en:'People and local activities'}]},personalZones:patchBoard.hides.map(h=>{const c=cropOf(h);return{x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160};}),discoveries:s.items.map(([id,he,en,b,hhe,hen,difficulty],i)=>{const [x,y,w,h]=b;return{id,name:{he,en},hint:{he:hhe,en:hen},category:id==='violet-gecko'?'animal':'object',rarity:i<3?'common':i<5?'rare':'epic',difficulty:difficulty??(i<3?1:i<5?2:3),description:{kind:'story',text:{he:`${he} חיכה לנו בין הסיפורים של ${s.name}.`,en:`The ${en.toLowerCase()} waited among the little stories of ${s.en}.`}},visibleRect:rect(b),hitRect:rect(b),cardCrop:rect([Math.max(0,x-6),Math.max(0,y-6),Math.min(2048,x+w+6)-Math.max(0,x-6),Math.min(1152,y+h+6)-Math.max(0,y-6)])};}),postcard:{id:`${slug}-postcard`,title:{he:`ההרפתקה שלי — ${s.name}`,en:`My adventure — ${s.en}`},targetId:'hide-1',crop:{x:0,y:0,w:1,h:1}}});
 mkdirSync('content/adventures/expansion',{recursive:true});writeFileSync(file,JSON.stringify({patchBoard,plan},null,2));
 for(const h of patchBoard.hides)await sharp(bytes).extract(cropOf(h)).png().toFile(`output/imagegen/adventure-expansion-20260914-v1/${h.id}-context.png`);
 console.log(JSON.stringify({slug,hides:3,items:6,sha256:plan.art.sha256}));
}
main().catch(e=>{console.error(e);process.exitCode=1});

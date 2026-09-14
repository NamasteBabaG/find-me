/** Coordinates measured on the approved v3 artwork at 2048x1152. No paid calls. */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import sharp from 'sharp';
import {LocalPatchBoardSchema,assertPlaceable,cropOf} from '../src/domain/scene/local-patch-hides';
import {ReadyAdventureBoardSchema} from '../src/domain/adventure/content';
type Box=[number,number,number,number];
type Hide={crop:[number,number];box:Box;pose:'standing'|'peeking'|'kneeling'|'crouching'|'sitting-cross-legged';height:number;hint:string;support:string};
const specs:Record<string,{items:Box[];hides:Hide[]}>= {
 paris:{items:[[482,407,45,27],[1609,365,36,32],[481,779,62,43],[1305,527,52,47],[1011,710,41,30],[1437,790,116,91]],hides:[
  {crop:[1025,220],box:[1126,398,78,150],pose:'standing',height:300,hint:'חפשו בין הילדים שרוקדים ליד המוזיקאים',support:'Replace only the striped-shirt boy dancing beside the girl in the red dress. Preserve her hands and body. Bar stands on the same cobblestones with natural short preschool legs, looking three-quarter toward the music, both eyes readable.'},
  {crop:[0,730],box:[18,808,122,99],pose:'peeking',height:350,hint:'חפשו ליד הילדים וסלי הירקות בצד שמאל',support:'Replace only the visible upper half of the blue-vest child at the outer left, reaching toward flowers. The foreground man naturally hides the lower body: preserve that man, his hat and all his pixels. Preserve the adjacent girl and her basket. Clear Bar curls and three-quarter face.'},
  {crop:[1775,742],box:[1786,936,125,214],pose:'standing',height:365,hint:'חפשו ליד הילד שקורא מפה בפינה הימנית למטה',support:'Replace only the red-beret child in a mustard top and blue overalls reading a map beside two adults at the lower-right. Remove his hat to reveal Bar curls; preserve the map and both adults, same stance and scale.'},
 ]},
 marrakech:{items:[[446,171,31,43],[555,435,48,64],[1210,706,42,41],[993,245,82,69],[1691,608,45,42],[1620,653,95,78]],hides:[
  {crop:[1450,126],box:[1560,199,75,98],pose:'crouching',height:280,hint:'חפשו ליד הילדים המשחקים בחלק העליון',support:'Replace only the teal-shirt child at the left side of the upper-right wooden board game. Crouch or sit low with both knees naturally bent, facing the game in a readable three-quarter view. Preserve the board and other children.'},
  {crop:[688,220],box:[797,356,81,111],pose:'sitting-cross-legged',height:295,hint:'חפשו במעגל המקשיבים למספר הסיפורים',support:'Replace only the small green-shirt boy on the left of the story circle, facing right toward the storyteller. Sit naturally on the same cushion with short folded legs and a clear three-quarter face, not an extreme profile. Preserve the red-shirt child in front.'},
  {crop:[1305,742],box:[1412,937,116,144],pose:'kneeling',height:320,hint:'חפשו בין הילדים עם משחק הצורות למטה',support:'Replace only the yellow-shirt child at the middle-right of the foreground wooden shapes activity. Kneel on the courtyard floor, hands naturally reaching toward a wooden piece. Preserve the child in blue on his left and the green-shirt child on his right.'},
 ]},
 tokyo:{items:[[489,207,34,53],[1545,244,56,48],[378,748,102,52],[1310,735,39,29],[1539,306,29,39],[1431,817,100,53]],hides:[
  {crop:[690,75],box:[823,233,63,94],pose:'standing',height:245,hint:'חפשו ליד הילד שמנופף סמוך לשער',support:'Replace only the small waving child just to the left of the shrine gate steps. Feet on the courtyard paving. Bar waves with one hand, face three-quarter toward the viewer and musicians; preserve adults and gate.'},
  {crop:[75,525],box:[182,745,76,178],pose:'crouching',height:295,hint:'חפשו ליד הילדים והעציצים בצד שמאל',support:'Replace only the child in the dusty-pink shirt tending the low round plant pot on the left, beside a kneeling boy in brown. Keep the pot and plants. Crouch with anatomically bent knees, same child scale and both eyes readable.'},
  {crop:[1700,740],box:[1805,842,126,159],pose:'crouching',height:330,hint:'חפשו ליד מתקן האופניים בצד ימין למטה',support:'Replace only the gray-brown-shirt boy seated low to the right of the bicycle wheel, above the older blue-shirted mechanic. Keep the original bent-knee low seated pose and wheel in his hands; preserve both mechanics and bicycle. Clear three-quarter face.'},
 ]},
 greatwall:{items:[[655,321,58,78],[1405,496,35,69],[441,777,40,44],[393,563,95,63],[1651,359,104,59],[1514,823,111,86]],hides:[
  {crop:[100,80],box:[153,310,85,119],pose:'peeking',height:255,hint:'חפשו מאחורי שולחן התה בצד שמאל למעלה',support:'Replace only the small blue-jacket child standing behind the upper-left tea table, beside the wooden box. Preserve the foreground adult arm and table; Bar lower legs are naturally hidden behind the table. Clear three-quarter face and curls.'},
  {crop:[45,742],box:[161,970,100,146],pose:'kneeling',height:315,hint:'חפשו בין הילדים והציורים בפינה השמאלית למטה',support:'Replace only the teal-jacket child at the left side of the foreground group examining loose paper drawings. Kneel on stone beside the paper, visible face turned three-quarter inward. Preserve the neighboring children and their hands.'},
  {crop:[1120,742],box:[1260,948,87,128],pose:'sitting-cross-legged',height:300,hint:'חפשו ליד הילדים ומשחק הצורות למטה',support:'Replace only the purple-shirt child on the right of the small foreground tangram group. Sit with naturally folded short legs, reaching for one wooden shape. Face three-quarter left, no extreme profile; preserve the green-shirt child and game.'},
 ]},
 sydney:{items:[[548,533,60,34],[1310,608,52,60],[492,851,50,36],[755,387,44,66],[1414,450,62,43],[1426,861,68,50]],hides:[
  {crop:[887,80],box:[1080,277,68,151],pose:'standing',height:280,hint:'חפשו בין הילדים שמסתכלים על הבועות',support:'Replace only the boy in a blue cap to the left of the girl in yellow in the bubble-watching group. Same dry promenade ground and same near-equal child scale, readable three-quarter face, reaching for a bubble without hiding his face.'},
  {crop:[210,742],box:[357,850,91,190],pose:'crouching',height:315,hint:'חפשו ליד הסבא שקורא בספר בצד שמאל',support:'Replace only the brown-shirt child sitting beside the white-haired grandfather with the large open book, at the left foreground. Preserve grandfather, book, stool and neighboring table. Keep original low seated pose, short legs and three-quarter face toward the book.'},
  {crop:[915,742],box:[946,947,145,161],pose:'kneeling',height:320,hint:'חפשו בין הילדים שמציירים בגיר על הרצפה',support:'Replace only the mustard-shirt boy on the right of the foreground chalk harbor-map group. Kneel naturally and hold one chalk piece, same floor and scale as his friends. Clear three-quarter face; preserve the map and other children.'},
 ]},
 antarctica:{items:[[386,314,31,40],[1231,503,87,43],[478,787,73,47],[514,536,43,37],[1593,230,30,35],[1193,798,71,50]],hides:[
  {crop:[460,61],box:[671,257,59,154],pose:'standing',height:290,hint:'חפשו ליד הילדים עם הספלים על מרפסת התחנה',support:'Replace only the yellow-jacket child holding a warm cup on the wooden boardwalk left of the ice-sample drill. Same stable boardwalk and smaller child scale; hat off and hood down so curls and full face stay readable. Preserve the cup and neighboring adult.'},
  {crop:[830,170],box:[933,428,103,137],pose:'kneeling',height:320,hint:'חפשו ליד הילדים שבודקים גלילי קרח',support:'Replace only the small teal-coated child kneeling to the left of the upright ice sample cylinders. Knees firmly on packed snow, gloved hands beside the sample. Same size as the neighboring seated child; do not make Bar miniature. Hat off and hood down, clear full face in three-quarter view.'},
  {crop:[1350,430],box:[1437,626,91,201],pose:'standing',height:340,hint:'חפשו ליד הילדים עם מגש הדגימות בצד ימין',support:'Replace only the standing purple-coated child holding a small sample tray beside the kneeling blue-coated child on the right. Same snow ground and preschool size. Hood and hat off to reveal Bar curls, clear three-quarter face. Preserve the tray, neighbor hands and the photographer above.'},
 ]},
};
const rect=([x,y,w,h]:Box)=>({x:x/2048,y:y/1152,w:w/2048,h:h/1152});
async function main(){
 const selected=process.argv[2],slugs=selected?[selected]:Object.keys(specs);
 const folder='content/adventures/density-v3',reviewDir='output/imagegen/adventure-density-hides-v3';mkdirSync(folder,{recursive:true});mkdirSync(reviewDir,{recursive:true});
 for(const slug of slugs){
  const s=specs[slug];if(!s)throw Error('Unknown scene');const destination=`${folder}/${slug}.json`;if(existsSync(`storage/adventure-bar-density-20260914/${slug}-inputs.json`))throw Error('Paid inputs frozen');
  const old=JSON.parse(readFileSync(`content/adventures/expansion/${slug}.json`,'utf8'));
  const revision=existsSync(`public/scenes/adventure-${slug}-density-v3-items-v1/base.webp`)?'density-v3-items-v1':'density-v3';
  const art=`public/scenes/adventure-${slug}-${revision}/base.webp`,bytes=readFileSync(art);
  const patchBoard=LocalPatchBoardSchema.parse({...old.patchBoard,art,hides:s.hides.map((h,i)=>{
   const left=Math.round(h.crop[0]*1.875),top=Math.round(h.crop[1]*1.875),[x,y,w,height]=h.box;
   return{id:`adventure-${slug}-density-v3-${i+1}`,targetId:`hide-${i+1}`,left,top,pose:h.pose,mask:{left:Math.round(x*1.875)-left,top:Math.round(y*1.875)-top,width:Math.round(w*1.875),height:Math.round(height*1.875)},hint:{he:h.hint,en:h.support},placement:{depth:'middle',standingHeightPx:h.height,support:h.support,lighting:'Match the immediate neighboring painted faces, brown hand-drawn contours, matte color and shaped light/shadow planes. Adapt illumination, never replace the recognizable canonical Bar face or curls.',occlusion:'Keep all eyes, cheeks and characteristic curls readable. Natural object overlap only below the face. Remove the replaced bystander completely inside the edit window without orphan limbs. Preserve all neighbors.',comparators:`Age five, natural preschool proportions. Match the original child at this exact spot rather than an adult or tiny distant toddler. Equivalent standing height around ${h.height} native pixels; visible head including curls approximately 60-85 native pixels, never a miniature, giant head or portrait cutout.`}};
  })});
  assertPlaceable(patchBoard,{width:3840,height:2160});
  const plan=ReadyAdventureBoardSchema.parse({...old.plan,sceneVersion:11,art:{...old.plan.art,base:`/scenes/adventure-${slug}-${revision}/base.webp`,sha256:createHash('sha256').update(bytes).digest('hex')},personalZones:patchBoard.hides.map(h=>{const c=cropOf(h);return{x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160};}),discoveries:old.plan.discoveries.map((d:object,i:number)=>{const [x,y,w,h]=s.items[i]!;return{...d,visibleRect:rect(s.items[i]!),hitRect:rect(s.items[i]!),cardCrop:rect([x-4,y-4,w+8,h+8])};})});
  writeFileSync(destination,JSON.stringify({patchBoard,plan},null,2)+'\n');
  for(const hide of patchBoard.hides)await sharp(bytes).extract(cropOf(hide)).png().toFile(`${reviewDir}/${hide.id}-context.png`);
  console.log(`${slug}: three new hides and six remapped items`);
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

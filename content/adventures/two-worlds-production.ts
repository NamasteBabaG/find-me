/** Staged expansion only. Never implicitly activates the sellable catalogue.
 * Measurements below are from 1920x1080 inspection copies of 3840x2160 masters.
 * Each return patch is a native 512x768 crop, not a resized child cutout.
 */
import { LocalPatchBoardSchema, assertPlaceable, type LocalPatchPose } from '../../src/domain/scene/local-patch-hides';
import { JOURNEY_REFRESH_IDENTITY_LOCK } from './journey-refresh-pilot';

type Spot = { box: [number,number,number,number]; pose: LocalPatchPose; source: string; support: string; hint: string; crop?: [number,number] };
type Board = { slug:string; world:'journey'|'kingdom'; route:string; name:string; master:string; light:string; wardrobe:string; spots:Spot[] };
const spot = (box:Spot['box'],pose:LocalPatchPose,source:string,support:string,hint:string):Spot => ({box,pose,source,support,hint});
export const TWO_WORLD_RELEASE_ID = 'two-worlds-bar-20260919-v1';
export const TWO_WORLD_STORAGE = 'storage/two-worlds-bar-20260919';
export const TWO_WORLD_CAP_MICRO_USD = 5_000_000;
export const TWO_WORLD_AUTHORING: Board[] = [
  {slug:'journey-marrakech-refresh-v8',world:'journey',route:'marrakech',name:'מרקש',master:'journey-marrakech-v8-inner-targets',light:'Warm bright courtyard sun, red-wall reflected fill, soft fabric shadows; matte skin and cotton, small highlights only on metal.',wardrobe:'Light Moroccan tunic or practical source-colour cotton shirt and trousers; preserve local dress without borrowing local faces.',spots:[
    spot([330,561,86,191],'kneeling','the grey patterned shirt child seated immediately beside the elderly cobbler','Keep the seated bent knees and hands beside the cobbler. The adult, leather shoe, tools and chair remain unchanged.','חפשו ליד הסנדלר שמתקן נעל'),
    spot([967,385,76,183],'standing','the yellow shirt child drinking beside the red-shirt child above the tea table','Keep feet on courtyard paving, hands holding the same little cup. Preserve the red-shirt child and all fountain details.','מי שותה ליד המזרקה?'),
    spot([1320,509,96,100],'kneeling','the yellow shirt child kneeling on the RIGHT rim of the fountain','Keep the compact kneeling pose supported on the outer stone rim. Preserve the fountain, water, woven planter and adjacent people.','חפשו על שפת המזרקה מימין'),
  ]},
  {slug:'journey-paris-refresh-v7',world:'journey',route:'paris',name:'פריז',master:'journey-paris-v7-balanced-french-plaza',light:'Bright soft Paris daylight with blossom-filtered sun and cool pavement shadows; natural skin, dimensional hand-painted brushwork.',wardrobe:'Contemporary casual child cotton shirt, jeans or shorts in the source colours; no costume or compulsory beret.',spots:[
    spot([324,449,67,128],'crouching','the striped shirt boy crouching by the petanque balls','Keep both knees close to the paving and hands next to the balls. Preserve every ball and neighbouring child.','חפשו בין הילדים שמשחקים בכדורים'),
    spot([1086,337,99,178],'standing','the blue shirt boy dancing to the LEFT of the girl in yellow','Keep the light dancing stance and arms, both feet naturally supported. Preserve the yellow-dress girl and accordion player.','מי רוקד לצלילי האקורדיון?'),
    spot([1597,404,98,130],'peeking','the striped shirt child immediately RIGHT of the bakery bicycle cart','Keep the body standing BEHIND the cart, lower legs occluded, hands reaching toward the bread bag; preserve the baker hand, bicycle cart and baguettes.','חפשו ליד אופני הלחם'),
  ]},
  {slug:'journey-tokyo-refresh-v6',world:'journey',route:'tokyo',name:'טוקיו',master:'journey-tokyo-v6-coherent-scale',light:'Readable night scene, cyan and pink neon bounce with warm shop light. Keep natural brown hair and recognisable skin colour beneath coloured illumination; no black-hair assimilation.',wardrobe:'Modern Tokyo casual jackets, hoodie or cotton top matching selected source clothing; no historical robes.',spots:[
    spot([453,630,160,153],'peeking','the mustard hoodie child on the FAR side of the origami table','Keep seated behind the table; paper and table edge occlude the lower body. Preserve hands naturally folding the paper and all nearby children.','מי מקפל נייר ליד הסבתא?'),
    spot([762,440,128,190],'crouching','the purple hoodie boy holding the toy rocket beside the capsule machines','Keep the same squat, shoe support and rocket held in front. Preserve the toy rocket and capsule machines exactly.','חפשו ליד מכונות ההפתעות'),
    spot([557,248,87,154],'peeking','the blue shirt child at the fish-shaped pastry counter','Keep the seated side-on body while gently turning the face three-quarter so both eyes are readable. Counter stays in front of the lower body. CRITICAL: the smiling adult woman in the FOREGROUND partly occludes this child; preserve her entire face, hair and body exactly, she is NOT a replacement target.','מי מקבל מאפה בצורת דג?'),
  ]},
  {slug:'journey-china-refresh-v8',world:'journey',route:'greatwall',name:'החומה הסינית',master:'journey-china-v8-food-clothing-wide',light:'Bright Chinese courtyard daylight, warm paving bounce and red lantern colour kept local; no orange cast over all skin.',wardrobe:'Child-sized Chinese stand-collar cotton jacket with simple frog closures in the selected source colour; practical trousers.',spots:[
    spot([559,302,124,222],'standing','the teal jacket boy playing diabolo beside the noodle stall','Preserve the diabolo, sticks, strings and balanced stance. His hands hold the same sticks; no added fingers or dangling source limbs.','מי משחק ליד דוכן האטריות?'),
    spot([772,507,136,163],'peeking','the pale pink shirt child shaping dough with the elderly woman','Keep seated behind the dough table, hands interacting with the small dough pieces. Preserve the buns, elderly woman and puppet theatre.','חפשו בשולחן הכנת הכיסונים'),
    spot([1408,300,121,151],'kneeling','the blue patterned shirt boy on the LEFT side of the calligraphy cloth','Keep knees on the courtyard and hands beside the cloth. Preserve all ink marks, brushes and surrounding faces.','מי מתאמן בכתיבה על הבד?'),
  ]},
  {slug:'journey-antarctica-refresh-v7',world:'journey',route:'antarctica',name:'אנטארקטיקה',master:'journey-antarctica-v7-shallow-research-station',light:'Bright blue polar snow fill, soft cloudy overhead light, subtle warm red-station bounce. Fog only behind people. Skin and dark brown curls remain readable.',wardrobe:'Insulated polar coat, gloves, snow trousers and boots in source colours. Hood down enough to see canonical hair; do not replace hair with a neighbour hat or black hair.',spots:[
    spot([195,378,105,153],'kneeling','the orange coat child holding a cup beside the hot-drink urn','Keep kneeling on snow holding the same cup. Preserve the urn, cup, mittens, other people and snow edge.','מי מתחמם ליד מתקן השתייה?'),
    spot([1541,419,101,148],'kneeling','the orange coat child at the RIGHT of the smiling snow beluga','Keep supported knees behind the beluga sculpture and hands touching the sculpture. Snow sculpture remains in front where it overlaps.','חפשו ליד פסל הלווייתן הקטן'),
    spot([1270,596,130,139],'kneeling','the mustard coat child on the RIGHT side of the open map','Keep kneeling behind the map and pointing at it. Preserve the map, compass, cyan-coated child and tools.','מי קורא את מפת המשלחת?'),
  ]},
  {slug:'journey-sydney-refresh-v6',world:'journey',route:'sydney',name:'סידני',master:'journey-sydney-v6-bright-surf-beach',light:'Bright coastal daylight, warm sand bounce and blue ocean fill. Matte skin/cotton, gloss only on wet water and goggles.',wardrobe:'Casual Australian beach cotton shirts and shorts in source colours, sensible bare feet where appropriate. Keep canonical curls unobscured.',spots:[
    spot([448,522,97,248],'standing','the blue shirt boy reaching toward bubbles beside the striped-dress girl','Keep the playful reaching arm and feet planted on sand. Preserve each bubble and all adjacent people.','מי מנסה לתפוס בועות בחוף?'),
    spot([652,462,94,133],'kneeling','the blue shirt child building the sand opera house beside the adult','Keep the seated/kneeling posture and hands on sand. Preserve the adult hand, tiny flags and sandcastle walls in front.','חפשו ליד בית האופרה שבחול'),
    spot([1168,822,92,200],'standing','the orange shirt boy hopping beside the coloured footprints','Keep the small hopping stance with one supporting foot on the sand; preserve footprint art and neighbouring girls.','מי קופץ ליד העקבות הצבעוניות?'),
  ]},
  {slug:'journey-giza-refresh-v4',world:'journey',route:'giza',name:'גיזה',master:'journey-giza-v4-sydney-dimensional-paint',light:'Clear warm desert sun, cool shade and dusty limestone bounce. Preserve broken dimensional paint marks, matte cloth and stone, no plastic polishing.',wardrobe:'Light Egyptian cotton shirt/tunic and trousers in original colours; brown curls visible, no borrowed beard or adult facial shape.',spots:[
    spot([330,180,80,178],'standing','the blue shirt child on the LOWER scaffold at the left pyramid wall','Keep both feet on the same scaffold support, forearms on the rail. Preserve all wooden rails in front of the body and remove source hat only to reveal canonical curls.','מי עומד על הפיגום הנמוך?'),
    spot([846,238,73,110],'peeking','the blue shirt child at the LEFT end of the archaeologists tent table','Keep seated behind the tent table with forearms supported on the table. Gently turn the face three-quarter toward the viewer; preserve the standing woman, pottery and archaeologist in front.','חפשו באוהל של החוקרים'),
    spot([1005,793,105,139],'peeking','the cyan shirt child holding paper at the tea table RIGHT of the elder','Keep seated behind the tea table, holding the same paper. Teapot and table remain in front. Preserve the neighbouring yellow-clothed child.','מי מקשיב לסיפור ליד שולחן התה?'),
  ]},
  {slug:'magic-dragoncave-refresh-v3',world:'kingdom',route:'dragoncave',name:'מערת הדרקון',master:'magic-dragoncave-v3-bright-color',light:'Joyful bright daylight entering the cave from the upper left and openings, warm rock bounce and gentle cooler recess shadows. No universal shiny finish.',wardrobe:'Practical colourful child dragon-nursery cotton tunics, shirts and trousers; source colour retained, no heavy royal costumes.',spots:[
    spot([709,393,164,170],'kneeling','the purple shirt child brushing the green dragon below its belly','Keep knees supported on cave floor and hand holding the grooming brush. Preserve dragon scales, paws and brush.','מי עוזר להבריש את הדרקון?'),
    spot([646,750,226,183],'kneeling','the blue shirt child constructing the coloured block arch','Keep hands on the same building blocks, knees behind the toys. Preserve the arch and wheeled dragon toys fully.','חפשו ליד קשת קוביות המשחק'),
    spot([1392,575,124,220],'standing','the orange apron boy at the RIGHT side of the tiny dragon scale','Keep feet on cave floor and hands near the little dragon. Preserve the weighing tray and girl on its left.','מי שוקל את גור הדרקון?'),
  ]},
  {slug:'magic-icepalace-refresh-v2',world:'kingdom',route:'icepalace',name:'ארמון הקרח',master:'magic-icepalace-v2-winter-wonders',light:'Luminous blue and lilac ice fill, warm soft lantern accents. Ice has restrained translucent highlights while knitted clothes and skin stay matte and dimensional.',wardrobe:'Warm child knitwear, winter trousers and ice skates/boots matching the original supported activity; cool source palette with canonical brown hair.',spots:[
    spot([1007,365,102,173],'standing','the blue sweater boy skating hand-in-hand between the two girls','Preserve both hand connections and skates touching the ice. Keep balanced stance, do not invent feet under skate blades.','מי מחליק בין שתי החברות?'),
    spot([1101,747,135,248],'standing','the blue sweater child building the LEFT side of the crystal throne','Keep hands on crystal blocks and boots on the ice, with throne blocks occluding lower forearms where appropriate. Preserve crown and cushion.','חפשו ליד כס המלכות מקרח'),
    spot([672,406,87,128],'peeking','the grey coat child on the RIGHT side of the ice-sculpting table','Keep torso behind the table and hands on tools. The ice animal, table and tools must stay unchanged in front.','מי עוזר לפסל בחיות הקרח?'),
  ]},
  {slug:'magic-underwater-refresh-v2',world:'kingdom',route:'underwater',name:'הממלכה התת־ימית',master:'magic-underwater-v2-blue-reef-wonders',light:'Bright readable blue underwater light with soft sun shafts and coral-colour fill; preserve warm recognisable skin beneath blue environment. Glass helmet highlights never cover eyes.',wardrobe:'Colourful child dive outfit and transparent bubble helmet from the selected source. Keep the helmet transparent and canonical brown curls, never merge face with sea neighbours.',spots:[
    spot([969,615,168,207],'kneeling','the orange-sleeved child sketching the fish on the central coral shelf','Keep both knees on the shelf and the drawing board in front of torso. Preserve drawing, pencil, fish and clear helmet shell.','מי מצייר את הדג במחברת?'),
    spot([209,417,139,143],'kneeling','the yellow-sleeved child playing the hand drum beside the orange octopus','Keep the seated child on the same rocky support; preserve drum, hands contacting drum rim, transparent helmet and octopus arms.','חפשו ליד התמנון שמנגן'),
    spot([1677,551,139,188],'kneeling','the teal dive-suit child at the RIGHT of the gift-wrapping mermaid','Keep kneeling on the coral ledge, hands on the same golden ribbon. Preserve mermaid, shell, octopus arms and bubble helmet.','מי עוזר לארוז מתנה בים?'),
  ]},
  {slug:'magic-cloudcity-refresh-v1',world:'kingdom',route:'cloudcity',name:'עיר העננים',master:'magic-cloudcity-v1-wind-post-wonders',light:'Bright high-altitude daylight, soft cloud fill and warm wood bounce. Sky does not bleach the canonical hair or skin.',wardrobe:'Child wind-post clothing: cotton shirt, small waistcoat and scarf in source colours; no hat covering the reference hair.',spots:[
    spot([417,321,114,126],'peeking','the cream shirt curly child at the LEFT end of the kite-making table','Keep seated behind table with hands working on paper. Preserve the bird, kite strings and table edge in front.','מי מכין עפיפון ליד הציפור?'),
    spot([1092,523,83,210],'standing','the pink shirt child on the RIGHT side of the post counter, LEFT of orange child','Keep feet on cloud-city platform and hands passing paper across the counter. Preserve counter, letters, postman and orange-clothed child.','מי שולח מכתב בעיר העננים?'),
    spot([448,716,99,252],'standing','the teal-clothed child giving a letter to the giant post bird','Keep feet on the stone platform and hands offering the same letter. Preserve the bird beak, satchel and the taller child beside him.','מי מוסר מכתב לציפור הדוור?'),
  ]},
  {slug:'magic-sweetworkshop-refresh-v3',world:'kingdom',route:'sweetworkshop',name:'סדנת הממתקים',master:'magic-sweetworkshop-v3-chocolate-rivers-cream-mountains',light:'Bright indoor bakery light with warm lamps and cool window fill; cream peaks remain airy, syrup alone glossy, faces and cotton aprons matte.',wardrobe:'Simple child baking apron over source-colour cotton clothes; canonical curls visible without tall chef hat.',spots:[
    spot([1188,368,114,142],'peeking','the blue shirt child working on the chocolate locomotive','Keep standing behind counter, hands beside train. Preserve locomotive, cream cup and all sweets exactly in front.','מי בונה רכבת משוקולד?'),
    spot([848,614,145,191],'peeking','the purple apron black-haired child making rabbit cookies','Keep behind the baking tray with hands shaping the same dough bunny. Preserve tray, cookies and bunny shape; replace hair with canonical brown curls.','חפשו ליד עוגיות הארנבים'),
    spot([459,589,104,151],'peeking','the blonde lavender-apron child decorating the LEFT side of the cupcake tray','Keep body behind cupcake counter and hand with the same decorating spoon. Preserve every cupcake and all other faces.','מי מקשט קאפקייקס צבעוניים?'),
  ]},
  {slug:'magic-nightcarnival-refresh-v1',world:'kingdom',route:'nightcarnival',name:'קרנבל הלילה',master:'magic-nightcarnival-v1-lantern-parade',light:'Readable blue twilight with warm lantern pools and reflected carousel light. Faces dimensional not flat; brown curls remain brown beneath warm highlights.',wardrobe:'Playful comfortable child carnival cotton clothes and light waistcoat in source colours, no face paint, no mask or black-hair substitution.',spots:[
    spot([494,366,103,173],'peeking','the purple dress child having butterfly face paint applied','Replace source clothing with an age-five shirt/waistcoat in the same purple colour. Keep the seated body and face unobstructed WITHOUT butterfly face paint. Preserve artist hand beside cheek, not crossing eyes.','מי יושב ליד אמנית ציורי הפנים?'),
    spot([1127,363,110,210],'standing','the orange shirt boy playing the drum in the little orchestra','Keep drum supported at the waist and both hands in natural drumming positions. Preserve drum, violinist and teal horn on the table.','מי מנגן בתוף בתזמורת?'),
    spot([253,594,137,193],'peeking','the yellow shirt child with top hat at the mask-making stall','Keep seated behind table, hands working on the same red mask. Remove the hat to reveal canonical curls, preserve all masks, fabric and tools.','חפשו בדוכן הכנת המסכות'),
  ]},
];

export function productionPatchBoard(d:Board) {
  const board = LocalPatchBoardSchema.parse({board:d.slug, art:`public/scenes/${d.slug}/base.webp`,
    ground:'The exact existing support surface at the selected child, never a newly invented pedestal or floor',sittable:true,
    wardrobe:d.wardrobe+' '+JOURNEY_REFRESH_IDENTITY_LOCK,
    hides:d.spots.map((s,i)=>{
      const [x,y,w,h]=s.box;
      const left=s.crop?.[0]??Math.max(0,Math.min(1664,Math.round(x+w/2-128)));
      const top=s.crop?.[1]??Math.max(0,Math.min(696,Math.round(y+h/2-192)));
      return {id:`${d.slug}-${i+1}`,targetId:`hide-${i+1}`,left:left*2,top:top*2,pose:s.pose,
        mask:{left:(x-left-6)*2,top:(y-top-6)*2,width:(w+12)*2,height:(h+12)*2},
        hint:{he:s.hint,en:`Look for the child near ${s.source.replace(/^the /,'')}.`},
        placement:{depth:'middle',standingHeightPx:h*2,support:`Replace ONLY ${s.source}. ${s.support} Face gently three-quarter with both eyes readable; do not turn the whole body away from its activity.`,
          lighting:d.light+' '+JOURNEY_REFRESH_IDENTITY_LOCK,
          occlusion:'Preserve every surrounding person, face, prop, support edge, tool and background pixel. Completely replace the selected source child without leaving old hair, fingers, shoes or clothing ghosts. '+s.support,
          comparators:'Exactly age five with the source child head and hand scale at this physical depth, not miniature or enlarged foreground. Keep rich dimensional painted faces and crisp natural material texture. '+JOURNEY_REFRESH_IDENTITY_LOCK}};
    })});
  assertPlaceable(board,{width:3840,height:2160});
  return board;
}
export const TWO_WORLD_PATCH_BOARDS=TWO_WORLD_AUTHORING.map(productionPatchBoard);

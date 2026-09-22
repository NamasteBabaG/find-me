/** Observed objects in approved art, not coordinates imagined by a render prompt.
 * 1920x1080 inspection-pixel boxes; compiled to native normalized rectangles.
 * Separate from immutable paid painter inputs. Ready authoring != gameplay QA.
 */
import {AdventureCatalogSchema} from '../../src/domain/adventure/content';
import {cropOf} from '../../src/domain/scene/local-patch-hides';
import {TWO_WORLD_AUTHORING,TWO_WORLD_PATCH_BOARDS,TWO_WORLD_RELEASE_ID} from './two-worlds-production';
import art from './two-worlds-art.json';
type Item={id:string;he:string;en:string;hint:string;hintEn:string;box:[number,number,number,number];pad?:number;animal?:boolean};
const d=(id:string,he:string,en:string,box:Item['box'],hint:string,hintEn:string,pad=4):Item=>({id,he,en,box,hint,hintEn,pad});
export const TWO_WORLD_DISCOVERIES:Record<string,Item[]>={
 'marrakech':[
  d('blue-amulet','קמע כחול','Blue amulet',[736,255,27,40],'בין הבדים התלויים','Among the hanging fabrics.'),
  d('striped-slipper','נעל בית מפוספסת','Striped slipper',[629,599,48,31],'ליד הילדים שמקשיבים לסיפור','Beside the children listening to a story.'),
  d('crescent-cup','ספל עם ירח','Crescent cup',[980,670,39,49],'בשולחן התה העגול','At the round tea table.',1),
  d('tassel-key','מפתח עם גדיל','Tasselled key',[900,727,67,30],'ליד מגש המאפים','Beside the pastry tray.'),
  d('giraffe-puppet','בובת ג׳ירפה','Giraffe puppet',[521,448,87,102],'מי מופיע בסיפור שמתחת לשמשייה?','Who appears in the story beneath the parasol?'),
  d('tall-blue-vase','כד כחול גבוה','Tall blue vase',[1607,826,53,112],'ליד הנול וסלסילת כלי העץ','Beside the loom and basket of wooden utensils.'),
 ],
 'paris':[
  d('purple-boat','סירת נייר סגולה','Purple paper boat',[992,637,65,50],'ליד בריכת סירות המשחק','Beside the toy-boat pool.'),
  d('girl-portrait','ציור דיוקן','Portrait drawing',[850,347,79,122],'על כן הציור של האמן','On the artist’s easel.'),
  d('accordion','אקורדיון','Accordion',[1269,305,81,110],'מי מנגן ליד הילדים הרוקדים?','Who is playing beside the dancing children?',2),
  d('flower-pot','עציץ פרחים מצויר','Painted flower pot',[548,449,75,95],'ליד משחק כדורי המתכת','Beside the metal-ball game.'),
  d('yellow-flower','פרח צהוב','Yellow flower',[874,727,34,40],'ביד של ילדה בדוכן הפרחים','In a child’s hand at the flower stall.'),
  d('red-puppet','בובת תיאטרון אדומה','Red theatre puppet',[1165,153,52,74],'בתיאטרון הבובות הקטן','Inside the little puppet theatre.'),
 ],
 'tokyo':[
  d('fan-badge','מניפה אדומה','Red fan',[1140,519,56,48],'על תיק הבד הגדול','On the large fabric tote.'),
  d('lucky-cat','חתול מזל','Lucky cat',[1352,524,49,59],'בין הספרים המאוירים','Among the illustrated books.'),
  d('red-racing-car','מכונית מירוץ אדומה','Red racing car',[923,802,31,26],'במסלול המכוניות הקטן','On the little racing track.'),
  d('clear-umbrella','מטרייה שקופה','Transparent umbrella',[1638,689,104,196],'ליד הנשים והכלב','Beside the women and the dog.'),
  d('blue-backpack','תיק גב כחול','Blue backpack',[1313,848,63,104],'תלוי על עגלת הספרים','Hanging on the book cart.'),
  d('neon-microphone','מיקרופון ניאון','Neon microphone',[899,120,46,59],'מתחת לשלט הקריוקי','Below the karaoke sign.'),
 ],
 'greatwall':[
  d('wave-bottle','בקבוק כחול עם גל','Blue wave bottle',[1150,471,43,89],'בפינת שולחן הפנסים','At the corner of the lantern table.'),
  d('red-lantern','פנס אדום עגול','Round red lantern',[973,386,62,113],'בין הילדים שמקשטים','Between the children decorating.',2),
  d('bun-steamer','סלסילת לחמניות','Bun steamer',[525,712,77,58],'בדוכן הכיסונים','At the dumpling stall.'),
  d('noodle-bowl','קערת אטריות','Noodle bowl',[244,506,74,59],'ליד מכין האטריות','Beside the noodle maker.'),
  d('green-vegetables','ירקות ירוקים','Green vegetables',[1630,677,68,51],'על שולחן הארוחה העגול','On the round dining table.'),
  d('blue-white-teapot','קומקום כחול ולבן','Blue-and-white teapot',[1740,588,58,63],'מוזגים תה בארוחה המשפחתית','Tea is being poured at the family meal.'),
 ],
 'antarctica':[
  d('yellow-goggles','משקפי שלג צהובים','Yellow snow goggles',[1066,537,67,37],'מתחת לדגימת הקרח הגדולה','Beneath the large ice sample.'),
  d('orange-ring','טבעת כתומה','Orange equipment ring',[727,578,40,46],'בקצה סירת הציוד','At the edge of the equipment boat.'),
  d('red-mittens','כפפות אדומות','Red mittens',[597,522,58,72],'בסירת הציוד הקטנה','In the little equipment boat.'),
  d('microscope','מיקרוסקופ','Microscope',[946,650,104,135],'על שולחן החוקרים','On the researchers’ table.'),
  d('orange-penguin','פינגווין כתום','Orange penguin figurine',[864,722,31,40],'ליד צנצנות הדגימות','Beside the specimen jars.'),
  d('snowflake-mitten','כפפה עם פתית שלג','Snowflake mitten',[1123,840,62,62],'בתוך המזוודה הכחולה','Inside the blue case.'),
 ],
 'sydney':[
  d('yellow-bucket','דלי צהוב','Yellow bucket',[919,620,64,72],'ליד בית האופרה שבחול','Beside the sand opera house.'),
  d('pearl-shell','צדפה עם פנינה','Pearl shell',[1404,730,62,51],'בסלסילת אוצרות הים','In the basket of sea treasures.'),
  d('toy-lifering','גלגל הצלה קטן','Toy life ring',[704,831,54,39],'על המגש ליד סירות הצעצוע','On the tray beside the toy boats.'),
  d('purple-plane','מטוס נייר סגול','Purple paper plane',[538,840,66,62],'בשולחן ציור הגלשנים','At the surfboard-painting table.',1),
  d('cricket-ball','כדור קריקט אדום','Red cricket ball',[1566,739,27,24],'ליד הילד שמחזיק מחבט','Beside the child holding a bat.'),
  d('blue-cooler','צידנית כחולה','Blue cooler',[1301,508,88,72],'ליד מגבות החוף והפיקניק','Beside the beach towels and picnic.'),
 ],
 'giza':[
  d('purple-hourglass','שעון חול סגול','Purple hourglass',[399,878,49,89],'ליד שולחן כלי החרס','Beside the pottery table.'),
  d('copper-jug','כד נחושת קטן','Small copper jug',[598,575,35,34],'על קוביית האבן ליד הגמלים','On a stone block beside the camels.'),
  d('silver-pot','קנקן כסף','Silver pot',[650,634,43,45],'מציץ מתוך סלסילה','Peeking out of a woven basket.'),
  {...d('little-puppy','כלבלב','Little puppy',[1200,674,91,73],'מי נח לצד הגמל?','Who is resting beside the camel?'),animal:true},
  d('blue-orange-vase','כד כחול וכתום','Blue-and-orange vase',[1621,741,40,55],'ליד החרש שיושב על ארגז','Beside the artisan sitting on a crate.'),
  d('carved-stone','לוח אבן מצויר','Carved stone panel',[524,355,86,61],'בין שני בעלי המלאכה','Between the two artisans.'),
 ],
 'dragoncave':[
  d('striped-egg','ביצה כחולה מפוספסת','Blue striped egg',[455,196,56,59],'בסל הביצים הגדול','In the big egg basket.'),
  d('red-brush','מברשת אדומה','Red brush',[530,517,90,48],'בסל כלי הטיפוח','In the grooming basket.'),
  d('star-cookie','עוגיית כוכב','Star cookie',[1017,543,34,28],'על שולחן העוגיות','On the cookie table.'),
  d('paw-charm','תליון כף רגל','Paw-print charm',[991,899,32,45],'תלוי על התיק','Hanging from the bag.'),
  d('purple-ladle','מצקת סגולה','Purple ladle',[1235,310,33,36],'מתחת למגבות התלויות','Beneath the hanging towels.'),
  d('measuring-tape','סרט מדידה צהוב','Yellow measuring tape',[832,198,157,44],'בודקים כמה הדרקון גדל','Measuring how much the dragon has grown.'),
 ],
 'icepalace':[
  d('snowflake-cookie','עוגיית פתית שלג','Snowflake cookie',[1641,511,83,46],'על דלפק השתייה החמה','On the hot-drink counter.'),
  d('carrot-nose','אף גזר','Carrot nose',[218,421,61,20],'האף של איש השלג','The snowman’s nose.'),
  d('crystal-penguin','פינגווין קריסטל','Crystal penguin',[860,663,60,67],'בתא התצוגה הסגול','Inside the purple display alcove.'),
  d('blue-mittens','כפפות כחולות','Blue mittens',[404,290,49,35],'במדף של בגדי החורף','On the winter-clothes shelf.'),
  d('silver-flute','חליל כסוף','Silver flute',[875,168,77,34],'בתזמורת שמעל רחבת ההחלקה','In the orchestra above the skating rink.'),
  d('silver-mug','ספל כסוף','Silver mug',[1698,456,53,62],'בדלפק שליד העוגיות','At the counter beside the cookies.'),
 ],
 'underwater':[
  d('red-submarine','צוללת אדומה קטנה','Little red submarine',[865,408,91,82],'בין שני הצוללנים','Between the two divers.'),
  d('striped-lifering','גלגל הצלה מפוספס','Striped life ring',[1200,305,99,72],'ליד הצוללן שמנופף','Beside the waving diver.'),
  {...d('mirror-seahorse','סוסון ים עם מראה','Seahorse with a mirror',[1221,453,74,141],'בין האלמוגים הזהובים','Among the golden coral.'),animal:true},
  d('green-magnifier','זכוכית מגדלת ירוקה','Green magnifying glass',[1386,775,99,92],'בודקים אלמוגים מקרוב','Looking closely at the coral.'),
  d('sea-letter','מכתב מתחת למים','Underwater letter',[633,375,36,34],'אצל הדוור שרוכב על הצב','With the postman riding the turtle.'),
  d('mermaid-book','ספר בת הים','Mermaid’s book',[790,629,91,103],'במעגל שעת הסיפור','In the story-time circle.'),
 ],
 'cloudcity':[
  d('toy-parachute','מצנח קטן','Little parachute',[1374,285,79,124],'תלוי בתוך בית הבלונים','Hanging inside the balloon house.'),
  d('plant-pinwheel','שבשבת צבעונית','Colourful pinwheel',[1249,194,72,112],'צומחת מתוך עציץ','Growing from a flower pot.'),
  d('wind-machine','מכונת רוח כחולה','Blue wind machine',[1443,785,187,130],'על שולחן המכונאי','On the mechanic’s table.'),
  d('blue-kite','עפיפון כחול','Blue kite',[638,436,68,71],'בסדנת העפיפונים','At the kite-making workshop.'),
  d('golden-wing','כנף זהובה','Golden wing',[833,686,114,61],'על גג הקרונית המעופפת','On the flying tram’s roof.'),
  d('pink-parcel','חבילה ורודה','Pink parcel',[1483,549,73,39],'על השולחן של מתקני הבלון','On the balloon-repair table.'),
 ],
 'sweetworkshop':[
  d('flower-cutter','חותכן פרח','Flower cookie cutter',[1062,418,49,37],'ליד הילדים שמותחים ממתק','Beside the children stretching candy.',2),
  d('gold-wrapped-candy','סוכרייה בעטיפה זהובה','Gold-wrapped sweet',[1190,750,57,36],'בתוך קופסת המתנה הפתוחה','Inside the open gift box.'),
  d('round-lollipop','סוכרייה ורודה עגולה','Round pink lollipop',[659,471,56,32],'על שולחן קישוט הסוכריות','On the candy-decorating table.'),
  d('teal-whisk','מטרפה ירקרקה','Teal-handled whisk',[750,270,39,62],'מעל קערת הערבוב','Above the mixing bowl.'),
  d('gingerbread-chef','איש עוגייה עם כובע שף','Gingerbread chef',[812,260,139,250],'סוחב ערמת קערות','Carrying a stack of bowls.',2),
  d('mixing-robot','רובוט ערבוב','Mixing robot',[556,221,160,234],'במרכז עמדת האפייה','In the middle of the baking station.'),
 ],
 'nightcarnival':[
  d('striped-juggling-club','אלה מפוספסת','Striped juggling club',[902,517,96,42],'על שולחן הלהטוטנים','On the jugglers’ table.'),
  d('toy-rocket','טיל צעצוע','Toy rocket',[1023,719,46,73],'בין בקבוקי משחק הטבעות','Among the ring-toss bottles.'),
  d('star-coin','מטבע כוכב','Star coin',[1241,733,40,30],'על הבד הסגול של הקוסמת','On the magician’s purple cloth.'),
  d('balloon-dog','כלב מבלון','Balloon dog',[1579,433,178,151],'מעל עמדת הבלונים','Above the balloon stand.'),
  d('train-teddy','דובון ברכבת','Train teddy bear',[1491,272,58,96],'מחכה ליד קטר הרכבת','Waiting beside the train engine.'),
  d('gold-hoop','טבעת זהובה','Golden hoop',[992,667,70,32],'ביד של הילד במשחק הטבעות','In a child’s hands at the ring-toss game.',2),
 ],
};
const text=(he:string,en:string)=>({he,en});
const rect=([x,y,w,h]:number[])=>({x:x!/1920,y:y!/1080,w:w!/1920,h:h!/1080});
export const TWO_WORLD_CATALOG=AdventureCatalogSchema.parse({version:1,releaseId:TWO_WORLD_RELEASE_ID,boards:TWO_WORLD_AUTHORING.map((b,i)=>{
 const a=art.find(a=>a.slug===b.slug)!;const items=TWO_WORLD_DISCOVERIES[b.route];
 if(items?.length!==6)throw Error(`Six measured discoveries required: ${b.slug}`);
 return {status:'ready',boardSlug:b.slug,worldSlug:b.world,name:text(b.name,b.route),plannedHides:3,collectionUi:'guided-v1',sceneVersion:10,
 direction:{orientation:'landscape',aspect:'16:9',spread:'activity-across-width-and-height',perspective:'shallow',scaleTreatment:'similar-size-people',illustration:'storybook-hand-drawn',identityPrecedence:'reference-face-hair-age',locationCues:[text(b.name,b.route),text('איור המקום שאושר','Approved location illustration')],microStories:b.spots.map(s=>text(s.hint,s.source))},
 art:{base:a.base,sha256:a.sha256,width:3840,height:2160},personalZones:TWO_WORLD_PATCH_BOARDS[i]!.hides.map(h=>{const c=cropOf(h);return {x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160};}),
 discoveries:items.map((v,j)=>{const [x,y,w,h]=v.box,p=v.pad??4;return {id:v.id,name:text(v.he,v.en),hint:text(v.hint,v.hintEn),category:v.animal?'animal':'object',rarity:j<3?'common':j<5?'rare':'epic',difficulty:j<3?1:2,
 description:{kind:'story',text:text(`עוד תגלית מההרפתקה שלנו — ${v.he}!`,`Another discovery from our adventure: ${v.en}!`)},visibleRect:rect(v.box),hitRect:rect([x+w*.18,y+h*.18,w*.64,h*.64]),cardCrop:rect([x-p,y-p,w+p*2,h+p*2])};}),
 postcard:{id:`${b.route}-refresh-postcard`,title:text(`ההרפתקה שלי — ${b.name}`,`My ${b.route} adventure`),targetId:'hide-1',crop:{x:0,y:0,w:1,h:1}}};
})});

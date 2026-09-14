import art from "./three-art.json";
import { AdventureCatalogSchema, type AdventureRect } from "../../src/domain/adventure/content";
import { LocalPatchBoardSchema, assertPlaceable, cropOf, type LocalPatchHide } from "../../src/domain/scene/local-patch-hides";

const t = (he: string, en: string) => ({ he, en });
/** Rectangles authored against the exact 2048x1152 review of the 4K masters.
 * Normalization is independent of delivery size; hashes pin the actual pixels. */
const rect = (x: number, y: number, w: number, h: number): AdventureRect => ({ x: x / 2048, y: y / 1152, w: w / 2048, h: h / 1152 });
function item(id: string, name: ReturnType<typeof t>, hint: ReturnType<typeof t>, box: [number, number, number, number], rarity: "common" | "rare" | "epic", difficulty: 1 | 2 | 3, story: ReturnType<typeof t>, category: "animal" | "object" = "object") {
  const [x,y,w,h] = box;
  return { id, name, hint, category, rarity, difficulty, visibleRect: rect(x,y,w,h), hitRect: rect(x,y,w,h),
    cardCrop: rect(Math.max(0,x-8),Math.max(0,y-8),Math.min(2048,x+w+8)-Math.max(0,x-8),Math.min(1152,y+h+8)-Math.max(0,y-8)),
    description: { kind: "story" as const, text: story } };
}
const common = "common", rare = "rare", epic = "epic";
const data = {
  giza: { name: t("גיזה", "Giza"), ground: "sunlit sandy stone paths between the market and archaeological work areas", wardrobe: "Light ochre cotton shirt, muted teal shorts, comfortable brown walking shoes; no hat covering the curls.",
    discoveries: [
      item("blue-feather",t("נוצה כחולה","Blue feather"),t("חפשו בין האבנים ליד החתול","Look among the stones near the cat"),[115,239,65,52],common,1,t("נוצה נחה לרגע ליד החתול הסקרן.","A feather rests beside the curious cat.")),
      item("magnifying-glass",t("זכוכית מגדלת","Magnifying glass"),t("החוקרים משאירים כלים ליד המפות","The explorers leave tools beside their maps"),[983,309,78,35],common,1,t("החוקרים מוכנים לבדוק עוד סימן קטן.","The explorers are ready to inspect another little mark.")),
      item("purple-hourglass",t("שעון חול סגול","Purple hourglass"),t("חפשו ליד כלי החרס והארגזים","Look beside the pottery and crates"),[394,871,55,91],common,1,t("שעון החול מחכה להפסקת התה הבאה.","The hourglass waits for the next tea break.")),
      item("golden-key",t("מפתח זהוב","Golden key"),t("אולי משהו תלוי בין הגדילים שעל הגמל","Something may be hanging among the camel's tassels"),[854,466,34,84],rare,2,t("לאיזה ארגז מתאים המפתח הקטן?","Which little crate might this key open?")),
      item("green-chameleon",t("זיקית ירוקה","Green chameleon"),t("חפשו אורחת קטנה מעל האבן המצוירת","Look for a small visitor above the carved stone"),[1929,433,106,43],rare,2,t("הזיקית מצאה תצפית על כל השוק.","The chameleon has found a lookout over the market."),"animal"),
      item("turquoise-scarab",t("חרפושית טורקיז","Turquoise scarab"),t("חפשו אוצר קטן בין כלי העבודה","Look for a little treasure among the tools"),[1777,984,44,63],epic,3,t("אוצר טורקיז חיכה בין הארגזים.","A turquoise treasure waited among the crates.")),
    ],
    hides: [[500,0,155,340,160,325,"peeking"],[1050,990,180,210,180,300,"peeking"],[2800,650,145,180,180,255,"peeking"]] },
  amazon: { name: t("אמזונס","Amazon"), ground: "wooden research docks and firm root-covered riverbank, never unsupported open water", wardrobe: "Muted mustard explorer shirt, olive shorts, sturdy walking shoes; no hat hiding the curls.",
    discoveries: [
      item("red-binoculars",t("משקפת אדומה","Red binoculars"),t("חפשו על שולחן החוקרים","Look on the researchers' table"),[315,286,65,40],common,1,t("מישהו הניח את המשקפת לפני שכתב במחברת.","Someone set down the binoculars to write in a notebook.")),
      item("yellow-bottle",t("בקבוק צהוב","Yellow bottle"),t("חפשו בין הסלים שעל המזח","Look among the baskets on the dock"),[210,857,36,76],common,1,t("בקבוק המים מוכן למסע הבא.","The water bottle is ready for the next journey.")),
      item("orange-frog",t("צפרדע כתומה","Orange frog"),t("חפשו עלה רחב בין הצמחים","Look for a broad leaf among the plants"),[1828,535,64,47],common,2,t("הצפרדע בחרה עלה שישמש לה מרפסת.","The frog chose a leaf for a balcony."),"animal"),
      item("blue-butterfly",t("פרפר כחול","Blue butterfly"),t("הביטו בין העלים הגבוהים","Look among the high leaves"),[1926,151,42,44],rare,2,t("הפרפר נח בין העלים לפני הטיסה הבאה.","The butterfly rests among the leaves before its next flight."),"animal"),
      item("spiral-shell",t("קונכייה ספירלית","Spiral shell"),t("חפשו בין השורשים העבים","Look among the thick roots"),[1150,982,71,93],rare,2,t("השורשים שומרים על קונכייה מסולסלת.","The roots shelter a spiralling shell.")),
      item("carved-bird",t("ציפור מגולפת","Carved bird"),t("חפשו בתוך תיבת המזכרות","Look inside the keepsake box"),[1718,907,83,55],epic,3,t("ציפור קטנה מגולפת מחכה בסבלנות בתיבה.","A little carved bird waits patiently in the box.")),
    ],
    hides: [[880,0,180,255,165,290,"peeking"],[1470,1090,185,55,220,300,"crouching"],[2800,390,180,360,180,280,"peeking"]] },
  newyork: { name: t("ניו יורק","New York"), ground: "pedestrian park paths and shop-side sidewalks, safely away from the taxi roadway", wardrobe: "Muted teal autumn jacket over an ochre shirt, dark trousers and comfortable trainers; uncovered curly hair.",
    discoveries: [
      item("red-star-cap",t("כובע עם כוכב","Star cap"),t("חפשו ליד מדרגות הכניסה","Look beside the front steps"),[221,151,55,34],common,1,t("מישהו השאיר כובע בזמן שישב לנוח.","Someone left a cap while taking a rest.")),
      item("blue-skate",t("גלגילית כחולה","Blue roller skate"),t("חפשו ליד הספסל והעלים","Look beside the bench and leaves"),[306,1001,96,100],common,1,t("הגלגילית ממתינה לסיבוב נוסף בפארק.","The skate waits for another trip through the park.")),
      item("tennis-ball",t("כדור טניס","Tennis ball"),t("חפשו ליד החברים עם הזנבות","Look beside the friends with wagging tails"),[1053,553,25,26],common,1,t("הכלבים מחכים שמישהו יזרוק את הכדור.","The dogs wait for someone to throw the ball.")),
      item("pocket-watch",t("שעון כיס","Pocket watch"),t("אולי המוזיקאי שמר משהו בנרתיק","Perhaps the musician left something in the case"),[1022,343,29,33],rare,2,t("שעון קטן מקשיב למנגינה מתוך הנרתיק.","A little watch listens to the music from inside the case.")),
      item("purple-crane",t("עגור נייר סגול","Purple paper crane"),t("חפשו על שפת האבן ליד ציורי הגיר","Look on the stone edge near the chalk drawings"),[668,1084,60,56],rare,2,t("עגור הנייר יצא לטיול בין עלי השלכת.","The paper crane went exploring among the autumn leaves.")),
      item("liberty-figurine",t("פסל החירות הקטן","Little Statue of Liberty"),t("חפשו מזכרת בין גלויות וחפצים ישנים","Look for a souvenir among postcards and old objects"),[1685,1002,92,54],epic,3,t("המזכרת נחה באלכסון מתחת לגלויה.","The souvenir rests diagonally beneath a postcard.")),
    ],
    hides: [[560,0,180,370,170,290,"standing"],[1300,1240,280,220,205,490,"standing"],[2800,350,110,140,165,410,"standing"]] },
} as const;

export const THREE_PATCH_BOARDS = Object.entries(data).map(([key, d]) => {
  const board = LocalPatchBoardSchema.parse({ board: `adventure-${key}`, art: `public${art[key as keyof typeof art].base}`, ground: d.ground, sittable: key !== "newyork", wardrobe: d.wardrobe,
    hides: d.hides.map(([left,top,ml,mt,mw,mh,pose], i) => ({ id: `adventure-${key}-${i+1}`, targetId: `hide-${i+1}`, left, top, pose,
      mask: { left: ml, top: mt, width: mw, height: mh }, hint: t("חפשו בין האנשים והחפצים באזור הזה", "Look among the people and objects in this area"),
      placement: { depth: "middle", standingHeightPx: 300, support: d.ground, lighting: "Match the adjacent illustrated people and the board's existing directional light.", occlusion: "The body may be partly behind nearby objects, but the whole face and recognizable curls stay clearly visible.", comparators: "Match the scale of nearby children, with the proportions of a five-year-old. Do not enlarge toward the foreground." },
    })) });
  assertPlaceable(board, { width:3840, height:2160 });
  return board;
});

export const ADVENTURE_THREE_BOARDS = AdventureCatalogSchema.parse({ version:1, releaseId:"three-boards-20260914-v1", boards: Object.entries(data).map(([key,d],i) => {
  const packed = art[key as keyof typeof art];
  return { status:"ready", boardSlug:`adventure-${key}`, worldSlug:"adventure-trail", name:d.name, plannedHides:3, collectionUi:"guided-v1", sceneVersion:9,
    direction: { orientation:"landscape", aspect:"16:9", spread:"activity-across-width-and-height", perspective:"shallow", scaleTreatment:"similar-size-people", illustration:"storybook-hand-drawn", identityPrecedence:"reference-face-hair-age", locationCues:[d.name,t("סממני המקום באיור","Illustrated location landmarks")], microStories:[t("אנשים עובדים ומשחקים","People working and playing"),t("חיות וחפצים בין הפעילויות","Animals and objects among the activities")] },
    art: { base:packed.base, width:packed.width, height:packed.height, sha256:packed.sha256 },
    personalZones: THREE_PATCH_BOARDS[i]!.hides.map((h: LocalPatchHide) => { const c=cropOf(h); return { x:c.left/3840,y:c.top/2160,w:c.width/3840,h:c.height/2160 }; }),
    discoveries:d.discoveries, postcard:{ id:`${key}-postcard`, title:t(`ההרפתקה שלי — ${d.name.he}`,`My adventure — ${d.name.en}`), targetId:"hide-1", crop:{x:0,y:0,w:1,h:1} },
  };
}) });

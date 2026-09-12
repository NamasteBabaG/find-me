import { WORLD_LOCAL_PATCH_HIDES, LOCAL_PATCH_BOARD, LOCAL_PATCH_CROP, LocalPatchBoardSchema, assertPlaceable, type LocalPatchBoard, type LocalPatchHide, type LocalPatchPose } from "./local-patch-hides";

/** Authored against the actual 3072×2048 release art, inspected 12 Sep 2026.
 * Centres and support lines use the 1920×1280 inspection view; conversion is
 * exact. Mask widths/heights are BOARD-NATIVE pixels (shown at 62.5% in that view).
 * These are recipes, not claims of provider/visual approval. Never mutate v6.
 * Each smaller body has its OWN mask and support: moving a foreground box up
 * the board is not perspective. Crops retain their native 2:3 ratio. */
type Spot = readonly [x: number, groundY: number, width: number, height: number, depth: "near" | "middle" | "deep", pose: LocalPatchPose, en: string, he: string, support: string, lighting: string, occlusion: string];
const sun = "Warm diffuse daylight, matte painted highlights, match the local ground and nearby faces; no studio rim light.";
const shade = "Inside shade: reduced exposure and saturation, soft warm reflected fill only; no direct sun on skin or hair.";
const snow = "Cool blue snow fill with subdued warm daylight highlights, same painted exposure as nearby coats and faces.";
const night = "Dim blue-purple night fill with warm nearby lantern reflections; no daylight, white studio light or glossy photographic face.";
const foliage = "Soft green canopy shade with restrained dappled highlights, matching adjacent illustrated faces rather than bright portrait lighting.";
const open = "Keep the body integrated between neighbours without a new rectangular crop boundary or duplicate person.";

const plans: Record<string, { wardrobe: string; spots: readonly Spot[] }> = {
  sydney: { wardrobe: "An age-appropriate muted coral short-sleeved cotton top and teal knee-length beach shorts, barefoot. Same outfit in all five beach appearances; no portrait shirt or adult clothing.", spots: [
    [160,450,95,150,"deep","standing","Look among the smaller beach visitors on the left.","חפשו בין המבקרים הקטנים בחוף שמשמאל.","Both feet on the sloping beach sand at the same depth as the small nearby children.",sun,open],
    [550,585,100,170,"deep","peeking","Look beside the legs of the lifeguard's tall chair.","חפשו לצד הרגליים של כיסא המציל הגבוה.","Feet on sand behind one lower chair leg, NOT standing on the chair.",sun,"The existing chair leg hides one side of the body; face remains visible beside it."],
    [990,1015,125,225,"near","standing","Look on the sandy path between the big sandcastle and the rocks.","חפשו בשביל החולי שבין טירת החול הגדולה לסלעים.","Both feet on the exposed sand just right of the castle and left of the rock pools; keep the nearby blue hat below the edit unchanged.",sun,open],
    [1280,800,125,190,"middle","kneeling","Look beside the children playing on the broad rocks.","חפשו ליד הילדים שמשחקים על הסלעים הרחבים.","Knees and shins supported by the broad dry rock ledge, not by the water.",sun,"A low rock edge hides the knees naturally, while head and shoulders remain readable."],
    [1818,630,105,140,"middle","peeking","Look behind the rock shelf beside the surfboard on the right.","חפשו מאחורי מדף הסלע שליד הגלשן מימין.","Body supported on the right rock shelf behind its front rim, not on the surfboard or the water.",sun,"The existing rock rim covers the lower body; preserve the surfer and board to the left of the opening."],
  ]},
  antarctica: { wardrobe: "A child-sized muted rust insulated parka, navy snow trousers, warm mittens and brown snow boots, with a low knitted cap that does not cover the face. Same practical winter outfit throughout this board.", spots: [
    [105,375,85,125,"deep","peeking","Look beside the metal weather tower, to the left of the red station.","חפשו ליד מגדל מזג האוויר המתכתי, משמאל לתחנה האדומה.","Snow immediately left of the station platform, behind the snowman and beside the weather tower's base.",snow,"The existing metal tower legs and platform edge partly hide the body; preserve the snowman below the opening."],
    [610,492,85,110,"deep","standing","Look on the wooden steps below the station door.","חפשו על מדרגות העץ שמתחת לדלת התחנה.","Both boots rest on one of the existing low wooden stair treads; do not float against the station door or add a new step.",snow,open],
    [958,678,110,140,"middle","crouching","Look on the snow between the wooden cargo sledges.","חפשו על השלג שבין מזחלות המטען מעץ.","Boot soles on the exposed packed snow between the two central cargo sledges, not on the dog or boxes.",snow,open],
    [1430,735,90,150,"middle","peeking","Look behind a box beside the line of penguins.","חפשו מאחורי ארגז ליד שורת הפינגווינים.","Snow behind the cargo box to the right of the penguin procession, not on a penguin's body.",snow,"The wooden cargo box hides the lower body; retain the penguins to the left and the nearby explorer to the right."],
    [1785,970,130,230,"near","standing","Look on the snowy slope above the child with the orange mittens.","חפשו במדרון המושלג מעל הילד עם הכפפות הכתומות.","Boots on the exposed near snow slope, below the upper rider's boots and above the child with orange mittens; not on the penguin-shaped sledge.",snow,open],
  ]},
  giza: { wardrobe: "A child's loose muted terracotta cotton tunic-style shirt, sand-coloured light trousers and simple sandals, practical for heat. No adult robe proportions, makeup or copied photo clothing.", spots: [
    [170,470,90,140,"deep","standing","Look between the smaller camel visitors on the left.","חפשו בין המבקרים הקטנים ליד הגמלים שמשמאל.","Dry sand beside the smaller mid-distance camel visitors.",sun,open],
    [450,865,100,135,"middle","peeking","Look behind the pots underneath the hanging fabrics.","חפשו מאחורי הכדים שמתחת לבדים התלויים.","Shaded stall floor beneath the fabric awning; the body is behind the front pots, never on the sloping cloth roof.",shade,"Keep the fabric awning overhead and the foreground pots in front of the lower body; leave the face in the shaded opening."],
    [892,1065,160,360,"near","standing","Look beside the decorated camel in the foreground.","חפשו ליד הגמל המקושט שבקדמת התמונה.","Both feet on the sand where the yellow-clothed young visitor stands to the left of the decorated foreground camel. The window includes that visitor's whole hat-to-feet silhouette, not just a torso.",sun,"Use the existing whole-person replacement option here: replace that one yellow-clothed visitor completely. Keep the adjacent camel, the bearded visitor to the left, and their belongings unchanged."],
    [1300,420,85,135,"deep","standing","Look along the sandy route leading toward the pyramids.","חפשו לאורך הדרך החולית שמובילה לפירמידות.","Sand among the smaller visitors on the route towards the pyramids.",sun,open],
    [1730,750,110,180,"middle","peeking","Look over the edge of the carved stone blocks.","חפשו מעבר לקצה של גושי האבן החקוקים.","Sand behind the middle-height carved stone, with feet naturally hidden.",sun,"The existing stone covers torso and legs; the visible head must match nearby children's head size."],
  ]},
  tokyo: { wardrobe: "A child-sized muted indigo lightweight jacket over a dusty ochre top, charcoal trousers and simple trainers, suitable for a damp evening. No bright white portrait shirt; keep this outfit consistent in all five appearances.", spots: [
    [180,825,115,150,"near","peeking","Look beside the lantern-lit stall on the left.","חפשו לצד הדוכן המואר בפנסים שמשמאל.","Pavement behind the left stall counter, below the hanging lanterns rather than inside one of them.",night,"The existing counter hides the lower torso. Keep the lanterns above the head and preserve the counter in front."],
    [580,655,85,155,"middle","walking","Look among the walkers near the blue vending machine.","חפשו בין ההולכים ליד מכונת השתייה הכחולה.","Feet on a wet crossing stripe in the gap between the walkers to the right of the vending machine.",night,open],
    [925,505,75,110,"deep","standing","Look deeper into the crossing, near the smaller pedestrians.","חפשו בעומק מעבר החצייה, ליד הולכי הרגל הקטנים.","Wet street among the smaller pedestrians; keep the child proportional to people at this depth.",night,open],
    [1300,700,110,175,"middle","walking","Look among the evening walkers on the right side of the crossing.","חפשו בין הולכי הערב בצד הימני של מעבר החצייה.","Feet on a crossing stripe among the middle-distance walkers.",night,open],
    [1710,565,85,125,"deep","peeking","Look behind the blue umbrella by the right-hand lantern stall.","חפשו מאחורי המטרייה הכחולה שליד דוכן הפנסים מימין.","Pavement alongside the right-hand shopfront, behind the existing umbrella and stall front.",night,"The existing blue umbrella edge hides the lower body; preserve the umbrella instead of turning it into a floor."],
  ]},
  amazon: { wardrobe: "A muted moss-green child's short-sleeved field shirt, tan shorts and practical soft walking shoes, modest simple outdoor clothes like nearby explorers. No large adult safari jacket or repeated city outfit.", spots: [
    [280,810,135,140,"near","peeking","Look between the thick roots of the tree on the left.","חפשו בין השורשים העבים של העץ שמשמאל.","Dry root-supported bank inside the visible opening between the thick left-hand roots, never standing on the root's outer face or on water.",foliage,"The surrounding roots conceal the lower body; use the head-and-shoulder opening without erasing the roots."],
    [690,425,70,100,"deep","peeking","Look under the small hut's roof beyond the left riverbank.","חפשו מתחת לגג הבקתה הקטנה שמעבר לגדה השמאלית.","The existing hut platform supports the body behind its rail; not the macaw's branch in front of the hut.",foliage,"The hut railing and foliage hide the lower body, with the face underneath the thatched roof."],
    [875,245,70,100,"deep","standing","Look in the gap between explorers on the rope bridge.","חפשו ברווח שבין החוקרים שעל גשר החבלים.","Both feet on the existing wooden bridge deck in the empty span between its original visitors.",foliage,"Preserve both rope rails naturally in front of the torso, not through the head."],
    [1305,815,80,130,"middle","peeking","Look inside the canoe near the pink river dolphin.","חפשו בתוך הקאנו שליד דולפין הנהר הוורוד.","Body supported inside the right end of the middle canoe, with feet below its existing gunwale, not on river water or the paddler's shoulder.",foliage,"The canoe's wooden side hides legs and lower torso; preserve its rim and the existing paddler."],
    [1740,670,105,175,"middle","peeking","Look behind the plants near the fruit baskets and hut.","חפשו מאחורי הצמחים שליד סלי הפירות והבקתה.","Dry right-hand bank behind the plants beside the fruit baskets, with feet concealed by the foliage.",foliage,"The existing broad leaves and basket edge conceal the body; let the face peek beside the leaves, not stand on them."],
  ]},
  greatwall: { wardrobe: "A child-sized muted teal cotton jacket, ochre shirt, brown loose trousers and plain canvas shoes, like the everyday visitors around the wall. Not adult ceremonial clothing; no copied photo outfit.", spots: [
    [95,535,70,115,"deep","standing","Look on the steps beside the left watchtower.","חפשו על המדרגות שליד מגדל השמירה השמאלי.","Both feet on an exposed stone stair tread left of the light-vested visitor, not on the vertical watchtower wall.",sun,open],
    [520,485,90,145,"deep","peeking","Look between the visitors beside the watchtower's walkway.","חפשו בין המבקרים שלצד שביל מגדל השמירה.","Stone walkway behind the small adjacent visitors, not on top of a battlement.",sun,"The existing nearer visitors conceal the lower body; use a head-and-shoulder gap between them without adding a new wall."],
    [900,880,120,215,"middle","walking","Look among the walkers beneath the colourful dragon.","חפשו בין ההולכים מתחת לדרקון הצבעוני.","Feet on the stone path beneath the dragon procession.",sun,open],
    [1270,1030,135,270,"near","standing","Look near the visitors and baskets in the front of the wall.","חפשו ליד המבקרים והסלים בחלק הקרוב של החומה.","Feet on the broad near stone walkway, not on a hanging lantern.",sun,open],
    [1710,740,100,180,"middle","peeking","Look behind the stone edge on the right-hand bend.","חפשו מאחורי קצה האבן בעיקול הימני.","Walkway behind the right-hand parapet at the bend.",sun,"The existing stone parapet covers the lower body; no giant head above it."],
  ]},
  marrakech: { wardrobe: "A child's muted sage cotton shirt, soft sand-coloured trousers and simple sandals, lightweight everyday market clothing with a small ochre accent. Same outfit across this board, different from the beach and winter outfits.", spots: [
    [180,575,105,165,"middle","peeking","Look behind the carpets inside the lantern shop.","חפשו מאחורי השטיחים בתוך חנות הפנסים.","Shaded shop floor behind the carpet stacks, not on top of a lamp.",shade,"The existing carpet pile covers torso and legs; leave the face beside its upper edge."],
    [540,470,90,145,"deep","peeking","Look behind the fruit bowls at the edge of the lantern shop.","חפשו מאחורי קערות הפירות שבקצה חנות הפנסים.","Shaded shop floor behind the small fruit counter, proportional to the smaller shoppers in the shop interior.",shade,"The existing fruit bowls and counter hide the lower body; the striped canopy farther right is not this hiding place."],
    [900,900,110,155,"near","crouching","Look along the path beside the fruit cart.","חפשו לאורך השביל שליד עגלת הפירות.","Feet on the exposed sandy path to the right of the foreground fruit cart, above the hat of the cart driver; do not replace the driver's face.",sun,open],
    [1330,490,90,145,"deep","walking","Look among the small shoppers beyond the spice baskets.","חפשו בין הקונים הקטנים שמעבר לסלי התבלינים.","Market path beyond the spice baskets at the depth of the small shoppers.",shade,open],
    [1800,675,80,135,"middle","peeking","Look over the low wall beside the cat, to the right of the blue door.","חפשו מעבר לחומה הנמוכה שליד החתול, מימין לדלת הכחולה.","Courtyard floor behind the existing low wall to the right of the closed blue door; the feet stay hidden behind that wall, not on the wall cap.",shade,"The existing low wall hides the lower body. Keep the blue door closed and unchanged, and preserve the cat just to the right of the opening."],
  ]},
  newyork: { wardrobe: "A child-sized muted blue-green autumn sweatshirt, rust corduroy trousers and plain sneakers, practical everyday park clothing. No adult coat proportions or white portrait-shirt lock.", spots: [
    [180,850,115,215,"middle","standing","Look near the snack cart on the left pavement.","חפשו ליד עגלת החטיפים על המדרכה משמאל.","Feet on the left pavement beside the snack cart, not in a taxi.",sun,open],
    [690,740,90,165,"deep","walking","Look among the smaller walkers beside the shop awnings.","חפשו בין ההולכים הקטנים שליד סככות החנויות.","Both feet on the left pavement beneath the receding shop awnings, at the actual pavement line below the nearby pedestrians; not on the facade, fire escape, or a passer-by's waist.",shade,open],
    [950,1030,135,280,"near","standing","Look near the children between the musician and pretzel cart.","חפשו ליד הילדים שבין הנגן לעגלת הבייגלה.","Near pavement between the musician and pretzel cart.",sun,open],
    [1330,730,105,175,"middle","walking","Look on the pavement near the park entrance.","חפשו על המדרכה ליד הכניסה לפארק.","Pavement at the middle-distance park entrance, not the road lane.",sun,open],
    [1675,710,85,115,"deep","peeking","Look behind the plants beside the fountain path.","חפשו מאחורי הצמחים שלצד שביל המזרקה.","Park path behind the low shrub edge near the fountain, at the level of the distant park visitors; not in the tree canopy above them.",shade,"Existing low leaves and the nearer visitors conceal the lower body; keep the face below the tree branches."],
  ]},
  paris: { wardrobe: "A child's muted dusty-blue short-sleeved knit top, warm ochre shorts and simple canvas shoes, relaxed spring city clothing. Same five-appearance outfit, not adult fashion or a portrait shirt.", spots: [
    [180,790,105,170,"middle","peeking","Look behind a table at the café on the left.","חפשו מאחורי שולחן בבית הקפה שמשמאל.","Café pavement behind the existing table; feet naturally hidden by furniture.",shade,"The existing table covers the lower torso without slicing the head or shoulders."],
    [550,695,90,140,"deep","standing","Look beside the small green kiosk in the square.","חפשו לצד הדוכן הירוק הקטן שבכיכר.","Cobbled square beside the small kiosk, matching the smaller people nearby.",sun,open],
    [930,650,75,115,"deep","walking","Look deeper into the square on the route to the tower.","חפשו בעומק הכיכר בדרך שמובילה למגדל.","Cobbled route towards the tower among the distant visitors.",sun,open],
    [1292,950,105,220,"near","standing","Look near the balloons and the children in the square.","חפשו ליד הבלונים והילדים שבכיכר.","Both feet on the exposed near cobblestones between the balloon girl and the blue-shirted visitor, above the seated child's head; do not erase those neighbours.",sun,open],
    [1545,990,80,130,"middle","peeking","Look behind the flowers outside the bakery.","חפשו מאחורי הפרחים שמחוץ למאפייה.","Pavement behind the flower baskets to the LEFT of the bakery window, not inside the glass pastry display.",shade,"Existing flowers and baskets hide the lower body; use the flower-covered gap to the right of the shoppers, keeping those shoppers and the shop window unchanged."],
  ]},
};

function authoredHide(board: string, index: number, spot: Spot): LocalPatchHide {
  const [x, y, width, height, depth, pose, en, he, support, lighting, occlusion] = spot;
  const cx = Math.round(x * 1.6), ground = Math.round(y * 1.6);
  const left = Math.min(LOCAL_PATCH_BOARD.width - LOCAL_PATCH_CROP.width, Math.max(0, cx - 256));
  const top = Math.min(LOCAL_PATCH_BOARD.height - LOCAL_PATCH_CROP.height, Math.max(0, ground - 560));
  return { id: `${board}-v7-${index + 1}`, targetId: `hide-${index + 1}`, left, top, pose,
    mask: { left: cx - left - Math.floor(width / 2), top: ground - top - height, width, height },
    hint: { en, he }, placement: { depth, standingHeightPx: pose === "peeking" ? Math.round(height * 1.45) : pose === "crouching" || pose === "kneeling" ? Math.round(height * 1.4) : height,
      support, lighting, occlusion, comparators: "Use the heads and bodies of the original people immediately beside this exact mask, adjusted for the supplied child age; do not use people in the foreground as a ruler for a deep spot." } };
}

export const FIVE_HIDE_BOARDS: readonly LocalPatchBoard[] = Object.freeze(WORLD_LOCAL_PATCH_HIDES.map(legacy => {
  const plan = plans[legacy.board];
  if (!plan) throw new Error(`Missing v7 plan for ${legacy.board}`);
  const board = LocalPatchBoardSchema.parse({ ...legacy, version: 7, wardrobe: plan.wardrobe, hides: plan.spots.map((spot, i) => authoredHide(legacy.board, i, spot)) });
  assertPlaceable(board);
  return board;
}));

/** Staged refreshed Journey authoring. Not imported by the sellable catalogue.
 * The approved child-free Amazon is pinned separately from personal render approval.
 */
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";
import { LocalPatchBoardSchema, assertPlaceable, cropOf } from "../../src/domain/scene/local-patch-hides";

export const JOURNEY_REFRESH_IDENTITY_LOCK = "FACE AND HAIR come ONLY from the canonical child portrait, never from the replaced child or surrounding people. Preserve the portrait's eye shape and spacing, nose, mouth, cheeks, jaw, hairline, natural hair colour and curl pattern. Borrow ONLY pose, age-appropriate clothing, local light, support and painted mark-making from the scene. Never average the reference face with a bystander's face; do not turn brown hair black to match neighbours. Local light may shade the hair without changing its base colour.";
const t = (he: string, en: string) => ({ he, en });
const rect = ([x, y, w, h]: readonly number[]) => ({ x: x! / 3840, y: y! / 2160, w: w! / 3840, h: h! / 2160 });
export const JOURNEY_REFRESH_AMAZON_MASTER_SHA256 = "94449debc3adf89774ece806b68f815053c53e5b485f0cb2b569e8497356c86a";
export const JOURNEY_REFRESH_AMAZON_ART_SHA256 = "bd7c8c87d9b8e29fed9282606a4523d45db357b328117f7cb27b8428ad0682f3";

const spots = [
  { id: "boardwalk", crop: [1500, 100], mask: [12, 258, 205, 378], pose: "peeking", height: 365,
    hint: t("מי נשען על המעקה מתחת לעצלן?", "Who is leaning on the railing beneath the sloth?"),
    support: "Replace ONLY the teal-shirt child leaning forward on the wooden boardwalk rail. Keep the existing preschool-sized stance and forearms supported on the top rail. Turn the face gently three-quarter toward the viewer, both eyes readable. Feet remain on this boardwalk, not floating below it.",
    occlusion: "Preserve the entire wooden top rail and upright post in FRONT of the lower torso and legs. Preserve the sloth, the two map readers and the canoe paddler. No extra hands, source hair, shoes or orphaned limbs. The source child's identity must disappear entirely." },
  { id: "leaf-boat", crop: [600, 1180], mask: [100, 120, 310, 380], pose: "kneeling", height: 390,
    hint: t("חפשו ליד סירת העלים הקטנה", "Look beside the little leaf boat."),
    support: "Replace ONLY the mustard-shirt child helping a blue-shirt adult with the leaf boat at the lower left. Retain the low supported kneeling/seated posture behind the wooden water tray. Hands interact naturally with the little boat. Keep a readable three-quarter face, not a full profile, at the original head size.",
    occlusion: "The adult's blue sleeve, forearm and hand remain IN FRONT where they cross the child. Keep the water tray, leaf boat, strings and roots intact. The tray conceals the child's lower body; no invented feet over its front rim. Preserve the adult's face and fingers unchanged." },
  { id: "wildlife-book", crop: [2740, 1090], mask: [65, 133, 265, 376], pose: "sitting-cross-legged", height: 395,
    hint: t("מי קורא בספר ליד האיגואנה?", "Who is reading a book beside the iguana?"),
    support: "Replace ONLY the blue-shirt boy on the LEFT of the purple-shirt girl reading the wildlife book. Keep the compact seated body with knees bent close to the chest, not a standing figure. One hand points at the same book. Head turns three-quarter toward the book and viewer with both eyes visible. Same natural child scale as the girl.",
    occlusion: "Preserve the girl, the adult, all book pages, the supporting root and foreground leaves. Keep the book in FRONT of the lower hand and legs wherever it overlaps. Do not copy the girl's or adult's face, black hair or smile. No extra arms through the book." },
] as const;

export const JOURNEY_REFRESH_PATCH_BOARDS = [LocalPatchBoardSchema.parse({
  board: "adventure-amazon-refresh-v6", art: "public/scenes/adventure-amazon-refresh-v6/base.webp",
  ground: "The existing supported boardwalk or dry forest-root ledge at the authored child position", sittable: true,
  wardrobe: "Age-five lightweight forest-explorer clothes: use the selected source child's shirt colour and practical shorts/trousers, matte cotton and sensible shoes. No hat over the canonical hair. Local clothing is allowed to change; the face, brown hair colour and hair texture are not.",
  hides: spots.map((s, i) => ({ id: `journey-amazon-refresh-v6-${i + 1}`, targetId: `hide-${i + 1}`,
    left: s.crop[0], top: s.crop[1], pose: s.pose,
    mask: { left: s.mask[0], top: s.mask[1], width: s.mask[2], height: s.mask[3] }, hint: s.hint,
    placement: { depth: "middle", standingHeightPx: s.height, support: s.support, occlusion: s.occlusion,
      lighting: "Dappled canopy sunlight with gentle green woodland and turquoise water fill. Preserve the original face's local exposure without painting its identity. Matte skin and cloth; crisp dimensional brushwork, no smooth photo face or plastic shine. " + JOURNEY_REFRESH_IDENTITY_LOCK,
      comparators: "Parent-confirmed age five. Same physical depth and head/hand scale as the selected child, not an adult and not a miniature toddler. " + JOURNEY_REFRESH_IDENTITY_LOCK },
  })),
})];
assertPlaceable(JOURNEY_REFRESH_PATCH_BOARDS[0]!, { width: 3840, height: 2160 });

const items = [
  { id: "red-binoculars", name: t("משקפת אדומה", "Red binoculars"), hint: t("חפשו על מפת המסלול", "Look on the trail map."), category: "object", rarity: "common", difficulty: 1, box: [1555, 1162, 118, 74], hit: [1558, 1180, 80, 45], card: [1543, 1150, 142, 98] },
  { id: "yellow-bottle", name: t("בקבוק צהוב", "Yellow bottle"), hint: t("חפשו ליד הסל שעל הגדם", "Look beside the basket on the stump."), category: "object", rarity: "common", difficulty: 1, box: [2025, 1134, 58, 147], hit: [2031, 1167, 44, 95], card: [2013, 1122, 82, 171] },
  { id: "orange-frog", name: t("צפרדע כתומה", "Orange frog"), hint: t("חפשו ליד הילדים שחוקרים עלים", "Look near the children studying leaves."), category: "animal", rarity: "common", difficulty: 1, box: [1210, 1155, 83, 67], hit: [1224, 1171, 56, 30], card: [1198, 1143, 107, 91] },
  { id: "blue-butterfly", name: t("פרפר כחול", "Blue butterfly"), hint: t("חפשו על שפת הגדם, מתחת לסל", "Look along the stump edge beneath the basket."), category: "animal", rarity: "rare", difficulty: 2, box: [2125, 1268, 91, 74], hit: [2144, 1290, 48, 38], card: [2113, 1256, 115, 98] },
  { id: "spiral-shell", name: t("קונכייה ספירלית", "Spiral shell"), hint: t("חפשו בתוך הפיתולים של השורשים", "Look among the twists in the roots."), category: "object", rarity: "rare", difficulty: 2, box: [1224, 1390, 71, 59], hit: [1238, 1400, 42, 33], card: [1212, 1378, 95, 83] },
  { id: "wooden-bird", name: t("ציפור עץ מגולפת", "Carved wooden bird"), hint: t("חפשו ליד התרמיל הקטן שעל הגשר", "Look beside the little seed pod on the boardwalk."), category: "object", rarity: "epic", difficulty: 2, box: [1344, 626, 132, 112], hit: [1370, 650, 60, 54], card: [1336, 618, 148, 128] },
] as const;

/** ready = measured shared art and geometry, never personal/render/HUD approval. */
export const JOURNEY_REFRESH_CATALOG = AdventureCatalogSchema.parse({ version: 1, releaseId: "journey-refresh-amazon-20260919-v1", boards: [{
  status: "ready", boardSlug: JOURNEY_REFRESH_PATCH_BOARDS[0]!.board, worldSlug: "journey-refresh-pilot", name: t("אמזונס", "Amazon"),
  plannedHides: 3, collectionUi: "guided-v1", sceneVersion: 10,
  direction: { orientation: "landscape", aspect: "16:9", spread: "activity-across-width-and-height", perspective: "shallow", scaleTreatment: "similar-size-people", illustration: "storybook-hand-drawn", identityPrecedence: "reference-face-hair-age",
    locationCues: [t("יער גשם מלא חיים", "A living rainforest"), t("נחל, שורשים וחופת עצים", "A stream, roots and forest canopy")],
    microStories: [t("מכינים סירת עלים", "Making a leaf boat"), t("קוראים על חיות היער", "Reading about forest wildlife"), t("צופים בחיות מהגשר", "Watching wildlife from the boardwalk")] },
  art: { base: "/scenes/adventure-amazon-refresh-v6/base.webp", sha256: JOURNEY_REFRESH_AMAZON_ART_SHA256, width: 3840, height: 2160 },
  personalZones: JOURNEY_REFRESH_PATCH_BOARDS[0]!.hides.map(h => { const c = cropOf(h); return rect([c.left, c.top, c.width, c.height]); }),
  discoveries: items.map(d => ({ id: d.id, name: d.name, hint: d.hint, category: d.category, rarity: d.rarity, difficulty: d.difficulty,
    description: { kind: "story", text: t("עוד תגלית קטנה במסע שלנו ביער!", "Another little discovery on our rainforest adventure!") }, visibleRect: rect(d.box), hitRect: rect(d.hit), cardCrop: rect(d.card) })),
  postcard: { id: "amazon-refresh-postcard", title: t("ההרפתקה שלי באמזונס", "My Amazon adventure"), targetId: "hide-1", crop: { x: 0, y: 0, w: 1, h: 1 } },
}] });

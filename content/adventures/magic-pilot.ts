/** Three approved child-free masters. Authoring only: NOT a sellable world or a delivered game. */
import castle from "../../public/scenes/magic-castlegate-v18/discoveries.draft.json";
import library from "../../public/scenes/magic-giantlibrary-v5/discoveries.draft.json";
import forest from "../../public/scenes/magic-fairyforest-v6/discoveries.draft.json";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";
import { LocalPatchBoardSchema, assertPlaceable, cropOf, type LocalPatchPose } from "../../src/domain/scene/local-patch-hides";

const t = (he: string, en: string) => ({ he, en });
type Spot = { crop: [number, number]; mask: [number, number, number, number]; pose: LocalPatchPose; height: number; hint: ReturnType<typeof t>; support: string; occlusion: string };
const plans: { draft: typeof castle; name: ReturnType<typeof t>; wardrobe: string; light: string; spots: Spot[] }[] = [
  { draft: castle, name: t("שער הטירה", "Castle courtyard"),
    wardrobe: "Matte moss-green cotton tunic, tan trousers and soft brown boots, playful castle clothes. Uncovered brown curls, no crown or hat obscuring identity.",
    light: "Soft warm courtyard daylight; natural face volume and matte cloth, not metallic specular shine on skin or hair.",
    spots: [
      { crop: [680, 300], mask: [94, 35, 247, 330], pose: "walking", height: 320,
        hint: t("חפשו ליד הילדים שרוקדים לצלילי המוזיקה", "Look near the children dancing to the music."),
        support: "Replace only the green-clad dancing child on the courtyard paving; preserve the original ground line and surrounding dancers.", occlusion: "Both feet meet the paving. Preserve the dancer beside the child; do not join their hands or bodies." },
      { crop: [2360, 340], mask: [76, 145, 235, 375], pose: "standing", height: 350,
        hint: t("מי עומד ליד הדלת הגדולה של הטירה?", "Who is standing beside the castle's big door?"),
        support: "Replace the small green-clad child beside the turquoise castle doors, feet on the red carpet, scaled to the adjacent guard.", occlusion: "Preserve the guard, door and carpet. Face turned slightly toward the viewer, no helmet covering curls." },
      { crop: [1800, 1300], mask: [140, 215, 249, 538], pose: "peeking", height: 510,
        hint: t("חפשו ליד האביר שעוזר עם המגן", "Look beside the knight helping with the shield."),
        support: "Replace the small child leaning beside the seated knight, keeping the original supported stance on the low wooden platform at the same depth.", occlusion: "Keep the shield and knight's hands IN FRONT where they already occlude the child. Preserve the knight's face and helmet unchanged. No feet through the wooden step or shield." },
    ] },
  { draft: library, name: t("ספריית הענק", "The giant library"),
    wardrobe: "Matte teal cotton shirt, comfortable tan trousers, soft indoor shoes. Modern comfortable reading clothes, no medieval tunic; uncovered brown curls.",
    light: "Diffused warm indoor lamps and soft window fill, readable shaded face volume, no outdoor sunlight or glossy skin.",
    spots: [
      { crop: [1450, 470], mask: [183, 292, 162, 161], pose: "sitting-cross-legged", height: 280,
        hint: t("חפשו בתוך פינת הקריאה הכחולה שבמדף", "Look inside the blue reading nook in the shelves."),
        support: "Replace only the young reader seated inside the turquoise alcove; body rests on the existing cushion and book rests naturally in the lap.", occlusion: "Preserve the alcove frame and open book. Face and curls visible above the book, not facing fully away." },
      { crop: [1820, 900], mask: [218, 165, 230, 315], pose: "sitting-cross-legged", height: 390,
        hint: t("מי מקשיב לסיפור על הכרית?", "Who is listening to the story on a cushion?"),
        support: "Replace the seated child on the left side of the story circle. Keep hips on the cushion and age-five proportions among nearby listeners.", occlusion: "Keep the neighboring readers and their cushions intact; hands and legs belong to this child only." },
      { crop: [3270, 935], mask: [110, 188, 335, 220], pose: "peeking", height: 380,
        hint: t("מי מציץ מאחורי ערמת הספרים הגדולה?", "Who is peeking behind the tall stack of books?"),
        support: "Replace only the small dark-haired reader with glasses behind the tall book stack on the right. Keep the seated body concealed by the books, with Bar's face and brown curls visible above them. Remove the source glasses: Bar does not wear glasses.", occlusion: "Books and the desk stay IN FRONT of the torso. Preserve every book edge and the green chair. Do not add legs over the book stack or copy the face of the adult above." },
    ] },
  { draft: forest, name: t("יער הפיות", "Fairy forest"),
    wardrobe: "Soft moss-green cotton shirt, muted ochre shorts, comfortable brown shoes; uncovered brown curls. Human child, no fairy wings or elf ears.",
    light: "Soft green woodland bounce and warm dappled daylight matching adjacent faces; natural brown hair, matte fabrics, no plastic gloss.",
    spots: [
      { crop: [610, 210], mask: [101, 100, 290, 390], pose: "sitting-cross-legged", height: 390,
        hint: t("חפשו ליד העץ עם הפנים המחייכות", "Look beside the tree with the friendly face."),
        support: "Replace the green-clad child sitting on the tree-root ledge by the friendly tree and flying blue fairy. Keep the same ledge-supported seated body.", occlusion: "Preserve the tree face, fairy and root ledge. Preserve the black-haired child IN FRONT at the bottom right. The replaced child's face turns three-quarter toward the viewer, not hidden in the tree." },
      { crop: [3030, 285], mask: [24, 111, 220, 330], pose: "kneeling", height: 400,
        hint: t("מי מטפל בצמחים ליד הבית שבפרח?", "Who is tending plants beside the flower house?"),
        support: "Replace only the green-clad young gardener in the straw hat beside the flower house. Knees supported on the garden bed edge, at the same depth as the neighboring fairy.", occlusion: "Remove the selected child's hat so brown curls are recognizable. Keep plants and garden rail in front of the lower body, and preserve the neighboring fairy and wings." },
      { crop: [2240, 1390], mask: [45, 300, 245, 300], pose: "peeking", height: 400,
        hint: t("חפשו בין החברים שקולעים סלים", "Look among the friends weaving baskets."),
        support: "Replace the little teal-shirted child between the basket makers, seated on the forest floor at the same scale as the neighbors.", occlusion: "The wicker basket stays IN FRONT of the torso and legs; recognizable face, curls and hands visible above it. No extra limbs through wicker." },
    ] },
];

export const MAGIC_PILOT_PATCH_BOARDS = plans.map(plan => {
  const board = LocalPatchBoardSchema.parse({ board: plan.draft.boardSlug, art: `public${plan.draft.source}`, sittable: true,
    ground: "Use the authored supported position, preserving all surrounding people and props.", wardrobe: plan.wardrobe,
    hides: plan.spots.map((spot, index) => ({ id: `${plan.draft.boardSlug}-${index + 1}`, targetId: `hide-${index + 1}`,
      left: spot.crop[0], top: spot.crop[1], pose: spot.pose,
      mask: { left: spot.mask[0], top: spot.mask[1], width: spot.mask[2], height: spot.mask[3] }, hint: spot.hint,
      placement: { depth: "middle", standingHeightPx: spot.height, support: spot.support, occlusion: spot.occlusion,
        lighting: plan.light, comparators: "Match nearby age-five children, not adults. Preserve the reference child's face, brown hair and age; never borrow neighboring faces. Replace the selected source child, never add a duplicate." },
    })) });
  assertPlaceable(board, { width: 3840, height: 2160 });
  return board;
});

/** 'ready' here describes source art + discovery geometry only, NOT personal render approval. */
export const MAGIC_PILOT_CATALOG = AdventureCatalogSchema.parse({ version: 1, releaseId: "magic-three-20260918-v1", boards: plans.map((plan, i) => ({
  status: "ready", boardSlug: plan.draft.boardSlug, worldSlug: "magic-pilot", name: plan.name, plannedHides: 3, collectionUi: "guided-v1", sceneVersion: 10,
  direction: { orientation: "landscape", aspect: "16:9", spread: "activity-across-width-and-height", perspective: "shallow", scaleTreatment: "similar-size-people", illustration: "storybook-hand-drawn", identityPrecedence: "reference-face-hair-age",
    locationCues: [plan.name, t("סביבה שמחה ומלאת פרטים", "A joyful setting full of details")], microStories: [t("חברים משחקים ולומדים יחד", "Friends play and learn together"), t("הפתעות קטנות בין הפעילויות", "Small surprises among the activities")] },
  art: { base: plan.draft.source, ...plan.draft.art },
  personalZones: MAGIC_PILOT_PATCH_BOARDS[i]!.hides.map(h => { const r = cropOf(h); return { x: r.left / 3840, y: r.top / 2160, w: r.width / 3840, h: r.height / 2160 }; }),
  discoveries: plan.draft.discoveries,
  postcard: { id: `${plan.draft.boardSlug}-postcard`, title: plan.name, targetId: "hide-1", crop: { x: 0, y: 0, w: 1, h: 1 } },
})) });

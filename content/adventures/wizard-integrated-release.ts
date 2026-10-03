import { REFRESHED_COLLECTION_BOARDS, REFRESHED_WIZARD_CATALOG } from "./wizard-refresh-release";
import { TWO_WORLD_RELEASE_BOARDS, TWO_WORLD_RELEASE_CATALOG, TWO_WORLD_RELEASE_ROUTES } from "./two-worlds-release";
import { INTEGRATED_COLLECTION_VERSION } from "../../src/domain/scene/local-patch-versions";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";
import { LocalPatchBoardSchema, assertPlaceable, cropOf } from "../../src/domain/scene/local-patch-hides";

// Preserve the existing journey contracts exactly. Historical v11 receipts keep
// their rules, and existing v12 journey jobs retain their ids, masters and crops.
const journeyBoards = REFRESHED_COLLECTION_BOARDS.map(board => LocalPatchBoardSchema.parse({
  ...board, hides: board.hides.map((hide, i) => ({ ...hide, id: `${board.board}-v12-${i + 1}`,
    placement: hide.placement ? { ...hide.placement,
      lighting: hide.placement.lighting.split(" FACE AND HAIR come ONLY")[0],
      comparators: hide.placement.comparators.split(" FACE AND HAIR come ONLY")[0]!.replace("Keep rich dimensional painted faces and crisp natural material texture.", "Match the original ink contours and economical matte painted shapes."),
    } : undefined,
  })),
}));

// The kingdom masters and measurements already exist in the approved release.
// Adapt the authoring brief for the actual supplied child; never change source
// contracts or infer the child's age, hair or eyewear from a source character.
const neutralKingdom = (s: string): string => s
  .replace("Remove the source glasses: Bar does not wear glasses.", "Use only eyewear present in the canonical child reference; do not borrow the source child's glasses.")
  .replace("brown curls remain brown beneath warm highlights", "canonical hair retains its reference colour beneath warm highlights")
  .replace("do not turn brown hair black to match neighbours", "do not recolour canonical hair to match neighbours")
  .replace("no mask or black-hair substitution", "no mask or substitution of the reference hair")
  .replace(/an age[- ]five shirt\/waistcoat/gi, "a shirt/waistcoat sized for the parent-stated age")
  .replace(/\bBar\b/g, "the supplied child")
  .replace(/(?:parent-confirmed )?age[- ]five/gi, "parent-stated age")
  .replace(/five-year-old|preschool-sized|preschool/gi, "age-appropriate")
  .replace(/(?:dark )?brown (?:curls|hair)/gi, "canonical hair")
  .replace(/canonical curls|curl pattern|curls/gi, "canonical hair pattern")
  .replace(/curly hair/gi, "canonical hair")
  .replace(/canonical canonical hair/g, "canonical hair")
  .replace(/canonical hair are/g, "canonical hair is");
const paintedComparator = "Match the original ink contours and economical matte painted shapes.";
const kingdomRoutes = TWO_WORLD_RELEASE_ROUTES.filter(route => route.world === "kingdom");
const kingdomBoards = kingdomRoutes.map(route => {
  const source = TWO_WORLD_RELEASE_BOARDS.find(board => board.board === route.slug);
  if (!source) throw Error(`Missing integrated placement ${route.route}`);
  const board = LocalPatchBoardSchema.parse({
    ...source, board: route.route, ground: neutralKingdom(source.ground),
    wardrobe: source.wardrobe ? neutralKingdom(source.wardrobe) : undefined,
    hides: source.hides.map((hide, i) => {
      if (!hide.placement) throw Error(`Missing integrated placement ${route.route}/${hide.targetId}`);
      const placement = hide.placement;
      const comparators = neutralKingdom(placement.comparators.split(" FACE AND HAIR come ONLY")[0]!)
        .replace("Exactly parent-stated age with the source child head and hand scale", "Use the parent-stated age and natural head and hand proportions")
        .replace("Match nearby parent-stated age children, not adults.", "Use the parent-stated age; compare nearby people only for depth and scale.")
        .replace("Keep rich dimensional painted faces and crisp natural material texture.", paintedComparator);
      return { ...hide, id: `${route.route}-v12-${i + 1}`,
        placement: { ...placement,
          support: neutralKingdom(placement.support), occlusion: neutralKingdom(placement.occlusion),
          lighting: neutralKingdom(placement.lighting.split(" FACE AND HAIR come ONLY")[0]!),
          comparators: comparators.includes(paintedComparator) ? comparators : `${comparators} ${paintedComparator}`,
        },
      };
    }),
  });
  assertPlaceable(board, { width: 3840, height: 2160 });
  return board;
});
export const INTEGRATED_COLLECTION_BOARDS = [...journeyBoards, ...kingdomBoards];

export const INTEGRATED_WIZARD_CATALOG = AdventureCatalogSchema.parse({ ...REFRESHED_WIZARD_CATALOG,
  releaseId: "wizard-integrated-journey-v12",
  boards: [
    ...REFRESHED_WIZARD_CATALOG.boards.map(board => ({ ...board, sceneVersion: INTEGRATED_COLLECTION_VERSION })),
    ...kingdomRoutes.map(route => {
      const plan = TWO_WORLD_RELEASE_CATALOG.boards.find(board => board.boardSlug === route.slug);
      if (plan?.status !== "ready") throw Error(`Missing integrated board ${route.route}`);
      const board = kingdomBoards.find(board => board.board === route.route)!;
      return { ...plan, boardSlug: route.route, sceneVersion: INTEGRATED_COLLECTION_VERSION,
        personalZones: board.hides.map(hide => {
          const crop = cropOf(hide);
          return { x: crop.left / plan.art.width, y: crop.top / plan.art.height,
            w: crop.width / plan.art.width, h: crop.height / plan.art.height };
        }),
      };
    }),
  ],
});

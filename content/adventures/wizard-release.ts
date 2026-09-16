import { DENSITY_PATCH_BOARDS, ADVENTURE_DENSITY_BOARDS } from "./density-boards";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";
import { LocalPatchBoardSchema, assertPlaceable, cropOf } from "../../src/domain/scene/local-patch-hides";

/** New purchases only. Historical versions keep their artwork, count and receipts. */
export const COLLECTION_SCENE_VERSION = 10;
export const COLLECTION_BOARD_SIZE = Object.freeze({ width: 3840, height: 2160 });
const slugOf = (slug: string) => slug.replace(/^adventure-/, "");
const generic = (text: string) => text.replace(/\bBar\b/g, "the supplied child")
  .replace(/(?:a |the )five-year-old/g, "the parent-stated child age")
  .replace(/Age five/g, "Parent-stated age").replace(/preschool/g, "age-appropriate child")
  .replace(/curly hair|curls/g, "hair");

export const COLLECTION_PATCH_BOARDS = DENSITY_PATCH_BOARDS.map(source => {
  const board = LocalPatchBoardSchema.parse({ ...source, board: slugOf(source.board), wardrobe: generic(source.wardrobe!),
    hides: source.hides.map((authored, i) => {
      // The old Paris map-reader is cropped by the image boundary itself.
      // Use the complete hopscotch child instead; every card remains outside this window.
      const original = source.board === "adventure-paris" && i === 2 ? { ...authored,
        left: 1300, top: 1390, mask: { left: 275, top: 310, width: 205, height: 350 },
        hint: { he: "חפשו ליד הילדים שמשחקים קלאס על המדרכה", en: "Look beside the children playing hopscotch" },
        placement: { ...authored.placement!, support: "Replace the complete child in the red dress playing hopscotch on the near cobblestones, just right of the kneeling striped-shirt child. Preserve both feet on the same pavement and all neighbouring people. Adapt to the supplied child's face, hair and age, wearing the board's practical outfit.",
          standingHeightPx: 350 },
      } : authored;
      // Move the WINDOW only, never the authored person: clear the 12px seam band.
      // The adapted collection plan below validates the new return rectangles.
      const mask = original.mask!;
      const dx = mask.left + mask.width > 500 ? 32 : 0;
      const dy = mask.top + mask.height > 756 ? 32 : 0;
      const hide = { ...original, left: original.left + dx, top: original.top + dy,
        mask: { ...mask, left: mask.left - dx, top: mask.top - dy } };
      return { ...hide, id: `${slugOf(source.board)}-v10-${i + 1}`,
      hint: { ...hide.hint!, en: generic(hide.hint!.en) },
      placement: hide.placement ? { ...hide.placement,
        support: generic(hide.placement.support), lighting: generic(hide.placement.lighting),
        occlusion: generic(hide.placement.occlusion), comparators: generic(hide.placement.comparators),
      } : undefined,
    }; }),
  });
  assertPlaceable(board, COLLECTION_BOARD_SIZE);
  return board;
});

export const WIZARD_ADVENTURE_CATALOG = AdventureCatalogSchema.parse({
  version: 1, releaseId: "wizard-nine-boards-v10",
  boards: ADVENTURE_DENSITY_BOARDS.boards.map(board => {
    if (board.status !== "ready") throw new Error("The wizard cannot sell planned artwork");
    return { ...board, boardSlug: slugOf(board.boardSlug), worldSlug: "journey",
      sceneVersion: COLLECTION_SCENE_VERSION, plannedHides: 3,
      personalZones: COLLECTION_PATCH_BOARDS.find(b => b.board === slugOf(board.boardSlug))!.hides.map(h => {
        const c = cropOf(h); return { x: c.left / 3840, y: c.top / 2160, w: c.width / 3840, h: c.height / 2160 };
      }),
    };
  }),
});

import { REFRESHED_COLLECTION_BOARDS, REFRESHED_WIZARD_CATALOG } from "./wizard-refresh-release";
import { INTEGRATED_COLLECTION_VERSION } from "../../src/domain/scene/local-patch-versions";
import { AdventureCatalogSchema } from "../../src/domain/adventure/content";
import { LocalPatchBoardSchema } from "../../src/domain/scene/local-patch-hides";

// Same approved masters and 27 locations; a new purchase policy for painted
// integration and intact neighbours. Historical v11 receipts keep their rules.
export const INTEGRATED_COLLECTION_BOARDS = REFRESHED_COLLECTION_BOARDS.map(board => LocalPatchBoardSchema.parse({
  ...board, hides: board.hides.map((hide, i) => ({ ...hide, id: `${board.board}-v12-${i + 1}`,
    placement: hide.placement ? { ...hide.placement,
      lighting: hide.placement.lighting.split(" FACE AND HAIR come ONLY")[0],
      comparators: hide.placement.comparators.split(" FACE AND HAIR come ONLY")[0]!.replace("Keep rich dimensional painted faces and crisp natural material texture.", "Match the original ink contours and economical matte painted shapes."),
    } : undefined,
  })),
}));
export const INTEGRATED_WIZARD_CATALOG = AdventureCatalogSchema.parse({ ...REFRESHED_WIZARD_CATALOG,
  releaseId: "wizard-integrated-journey-v12",
  boards: REFRESHED_WIZARD_CATALOG.boards.map(board => ({ ...board, sceneVersion: INTEGRATED_COLLECTION_VERSION })),
});

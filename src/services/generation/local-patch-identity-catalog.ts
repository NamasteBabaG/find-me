import { INTEGRATED_COLLECTION_BOARDS, INTEGRATED_WIZARD_CATALOG } from "../../../content/adventures/wizard-integrated-release";
import { INTEGRATED_COLLECTION_VERSION } from "../../domain/scene/local-patch-versions";
import { cropOf } from "../../domain/scene/local-patch-hides";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { sha256Bytes } from "./fixed-sprite";

/** Deployment-owned style provenance. Never take the expected hash from an
 * identity receipt: that would let its own untrusted contents approve it. */
export async function identityStyleCatalogSha256(boardSlug: string, sceneVersion: number, root = process.cwd()): Promise<string> {
  if (!localPatchBoardForVersion(boardSlug, sceneVersion)) {
    throw Error("IDENTITY_STYLE_CATALOG: unknown pinned board/version");
  }
  const selected = INTEGRATED_WIZARD_CATALOG.boards.find(plan => plan.boardSlug === boardSlug);
  if (sceneVersion !== INTEGRATED_COLLECTION_VERSION || selected?.worldSlug !== "kingdom"
    || selected.status !== "ready" || selected.sceneVersion !== sceneVersion) {
    // Preserve every known journey and historical-version receipt exactly.
    return (await readBoardConditionedCatalog(root)).sha256;
  }
  const recipe = INTEGRATED_WIZARD_CATALOG.boards.filter(plan => plan.worldSlug === "kingdom").map(plan => {
    const board = INTEGRATED_COLLECTION_BOARDS.find(board => board.board === plan.boardSlug);
    if (plan.status !== "ready" || plan.sceneVersion !== INTEGRATED_COLLECTION_VERSION
      || !board?.hides[0] || board.art !== `public${plan.art.base}`) {
      throw Error("IDENTITY_STYLE_CATALOG: kingdom source contract unavailable");
    }
    return { board: board.board, artSha256: plan.art.sha256, crop: cropOf(board.hides[0]) };
  });
  if (recipe.length !== 9) throw Error("IDENTITY_STYLE_CATALOG: nine kingdom sources required");
  return sha256Bytes(Buffer.from(JSON.stringify(recipe)));
}

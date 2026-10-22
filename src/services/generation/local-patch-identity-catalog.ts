import { INTEGRATED_COLLECTION_BOARDS, INTEGRATED_WIZARD_CATALOG } from "../../../content/adventures/wizard-integrated-release";
import { DETECTIVES_SCENE_VERSION, INTEGRATED_COLLECTION_VERSION } from "../../domain/scene/local-patch-versions";
import { DETECTIVE_SOURCE_BOARDS, DETECTIVE_SOURCE_RELEASE } from "../../../content/detectives/source-release";
import { DETECTIVE_IDENTITY_STYLE_SOURCES, DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from "../../../content/detectives/identity-style-release";
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
  if (sceneVersion === DETECTIVES_SCENE_VERSION) {
    if (!detectiveIdentityStyleSources().some(row => row.boardId === boardSlug)) throw Error("IDENTITY_STYLE_CATALOG: unknown Detective source");
    return DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256;
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


/** Independently reconstruct the installed recipe before a new Detective atlas.
 * Source metadata alone cannot redirect this to another family or private file. */
export function detectiveIdentityStyleSources() {
  const sources = DETECTIVE_IDENTITY_STYLE_SOURCES;
  if (sources.length !== 9 || new Set(sources.map(row => row.boardId)).size !== 9) throw Error("IDENTITY_STYLE_CATALOG: nine Detective sources required");
  for (const [index, source] of sources.entries()) {
    const board = DETECTIVE_SOURCE_BOARDS[index], crop = source.crop;
    if (!board || source.boardId !== board.board || source.art !== board.path || source.sha256 !== board.sha256
      || source.width !== board.width || source.height !== board.height
      || ![crop.left, crop.top, crop.width, crop.height].every(Number.isSafeInteger)
      || crop.left < 0 || crop.top < 0 || crop.width <= 0 || crop.height <= 0
      || crop.left + crop.width > source.width || crop.top + crop.height > source.height)
      throw Error("IDENTITY_STYLE_CATALOG: Detective original-person source changed");
  }
  const hash = sha256Bytes(Buffer.from(JSON.stringify({ version: "journey-detectives-identity-style/v1",
    sceneVersion: DETECTIVES_SCENE_VERSION, worldSlug: "journey", sourceRelease: DETECTIVE_SOURCE_RELEASE, sources })));
  if (hash !== DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256) throw Error("IDENTITY_STYLE_CATALOG: Detective recipe digest changed");
  return sources;
}

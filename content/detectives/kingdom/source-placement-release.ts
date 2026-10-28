import { createHash } from "node:crypto";
import source from "./source-v1.json";
import { KINGDOM_DETECTIVE_SOURCE_BOARDS, KINGDOM_DETECTIVE_SOURCE_RELEASE } from "./source-release";
import { KINGDOM_DETECTIVE_PATCH_BOARDS, KINGDOM_DETECTIVE_ADVENTURE_CATALOG, KINGDOM_DETECTIVE_SOURCE_NEIGHBORS } from "./runtime-release";
import { KINGDOM_DETECTIVE_IDENTITY_STYLE_SOURCES, KINGDOM_DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from "./identity-style-release";
import { materializeDetectiveSourcePlacementRelease, sourcePlacementSha256,
  type DetectiveSourcePlacementBaseBoard } from "../../../src/domain/scene/source-placement-release";

/** This is the prospective scene13 family. The staged source-v1 snapshot and
 * every historical v12 pin remain exact; readiness still needs full runtime QA. */
export const KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID = "kingdom-detectives-source-neighbors-20261028" as const;
export const KINGDOM_DETECTIVE_SOURCE_PLACEMENT_BASE: readonly DetectiveSourcePlacementBaseBoard[] = Object.freeze(
  KINGDOM_DETECTIVE_SOURCE_BOARDS.map(row => {
    const board = KINGDOM_DETECTIVE_PATCH_BOARDS.find(candidate => candidate.board === row.board);
    if (!board || board.art !== row.path) throw Error("DETECTIVES_PLACEMENT: missing matching scene13 source");
    return Object.freeze({ board, sceneVersion: 13 as const, source: Object.freeze({ art: row.path,
      sha256: row.sha256, width: row.width, height: row.height }) });
  }));
export const KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE = materializeDetectiveSourcePlacementRelease({
  familyId: "kingdom-detectives/v1", releaseId: KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID, base: KINGDOM_DETECTIVE_SOURCE_PLACEMENT_BASE,
  neighborhoods: KINGDOM_DETECTIVE_SOURCE_NEIGHBORS,
});

// Frozen from the measured complete inventory, not recomputed expected values.
// A future edit requires a distinct release and explicit qualification.
export const KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 = "64cb9280d7e22313998744720b88177b9a30bec503d3363c5ccc507aad120916" as const;
export const KINGDOM_DETECTIVE_RUNTIME_CATALOG_SHA256 = "f8a31305ef2261b43a437dbcdd5c3bceeef0649a0cd809f86c6acf45c6c93877" as const;
export const KINGDOM_DETECTIVE_SOURCE_INPUT_SHA256 = "95911f8cd5738c4aa9fb3300e9007c33ca6dbeb02aa42fb5c0d33bb120751d98" as const;
export const KINGDOM_DETECTIVE_IDENTITY_STYLE_SHA256 = "baac3cb8dc95ef191d3ab318886ee95b5d9793e4b2a17328d149bd259745b554" as const;
const SOURCE_CANONICAL_SHA256 = "95911f8cd5738c4aa9fb3300e9007c33ca6dbeb02aa42fb5c0d33bb120751d98";

export function assertDetectiveSourcePlacementReleaseHash(): void {
  const actualStyle = createHash("sha256").update(JSON.stringify({ version: "kingdom-detectives-identity-style/v1",
    sceneVersion: 13, worldSlug: "kingdom", sourceRelease: KINGDOM_DETECTIVE_SOURCE_RELEASE,
    sources: KINGDOM_DETECTIVE_IDENTITY_STYLE_SOURCES })).digest("hex");
  if (sourcePlacementSha256(KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE) !== KINGDOM_DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256
    || sourcePlacementSha256(KINGDOM_DETECTIVE_ADVENTURE_CATALOG) !== KINGDOM_DETECTIVE_RUNTIME_CATALOG_SHA256
    || sourcePlacementSha256(source) !== SOURCE_CANONICAL_SHA256
    || KINGDOM_DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 !== KINGDOM_DETECTIVE_IDENTITY_STYLE_SHA256
    || actualStyle !== KINGDOM_DETECTIVE_IDENTITY_STYLE_SHA256)
    throw Error("DETECTIVES_PLACEMENT: complete family differs from its frozen source, style or inventory");
}

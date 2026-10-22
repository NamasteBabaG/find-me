import { createHash } from "node:crypto";
import source from "./source-v1.json";
import { DETECTIVE_SOURCE_BOARDS, DETECTIVE_SOURCE_RELEASE } from "./source-release";
import { DETECTIVE_PATCH_BOARDS, DETECTIVE_ADVENTURE_CATALOG, DETECTIVE_SOURCE_NEIGHBORS } from "./runtime-release";
import { DETECTIVE_IDENTITY_STYLE_SOURCES, DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from "./identity-style-release";
import { materializeDetectiveSourcePlacementRelease, sourcePlacementSha256,
  type DetectiveSourcePlacementBaseBoard } from "../../src/domain/scene/source-placement-release";

/** This is the prospective scene13 family. The staged source-v1 snapshot and
 * every historical v12 pin remain exact; readiness still needs full runtime QA. */
export const DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID = "journey-detectives-source-neighbors-20261022" as const;
export const DETECTIVE_SOURCE_PLACEMENT_BASE: readonly DetectiveSourcePlacementBaseBoard[] = Object.freeze(
  DETECTIVE_SOURCE_BOARDS.map(row => {
    const board = DETECTIVE_PATCH_BOARDS.find(candidate => candidate.board === row.board);
    if (!board || board.art !== row.path) throw Error("DETECTIVES_PLACEMENT: missing matching scene13 source");
    return Object.freeze({ board, sceneVersion: 13 as const, source: Object.freeze({ art: row.path,
      sha256: row.sha256, width: row.width, height: row.height }) });
  }));
export const DETECTIVE_SOURCE_PLACEMENT_RELEASE = materializeDetectiveSourcePlacementRelease({
  releaseId: DETECTIVE_SOURCE_PLACEMENT_RELEASE_ID, base: DETECTIVE_SOURCE_PLACEMENT_BASE,
  neighborhoods: DETECTIVE_SOURCE_NEIGHBORS,
});

// Frozen from the measured complete inventory, not recomputed expected values.
// A future edit requires a distinct release and explicit qualification.
export const DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256 = "f3bc050a8b258050da9a91982cf3de6709e80069eae40582123fafb63c2d8027" as const;
export const DETECTIVE_RUNTIME_CATALOG_SHA256 = "121bc9b135a805152172288cc56cc2773654e7a3e9207e7fc4a954108077d877" as const;
export const DETECTIVE_SOURCE_INPUT_SHA256 = "1f93f66b543d71d4b97196ec202c499d7a81f0bed233e188887e1b12b4771d02" as const;
export const DETECTIVE_IDENTITY_STYLE_SHA256 = "e1162f40efc6a40a0656963153a0e3b11edfd3adb6636cec85d047cca62596d3" as const;
const SOURCE_CANONICAL_SHA256 = "ff538a19496de6701cb206835a5029449cbcc8d8ddfdb248cd6157a34a67c50d";

export function assertDetectiveSourcePlacementReleaseHash(): void {
  const actualStyle = createHash("sha256").update(JSON.stringify({ version: "journey-detectives-identity-style/v1",
    sceneVersion: 13, worldSlug: "journey", sourceRelease: DETECTIVE_SOURCE_RELEASE,
    sources: DETECTIVE_IDENTITY_STYLE_SOURCES })).digest("hex");
  if (sourcePlacementSha256(DETECTIVE_SOURCE_PLACEMENT_RELEASE) !== DETECTIVE_SOURCE_PLACEMENT_RELEASE_SHA256
    || sourcePlacementSha256(DETECTIVE_ADVENTURE_CATALOG) !== DETECTIVE_RUNTIME_CATALOG_SHA256
    || sourcePlacementSha256(source) !== SOURCE_CANONICAL_SHA256
    || DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 !== DETECTIVE_IDENTITY_STYLE_SHA256
    || actualStyle !== DETECTIVE_IDENTITY_STYLE_SHA256)
    throw Error("DETECTIVES_PLACEMENT: complete family differs from its frozen source, style or inventory");
}

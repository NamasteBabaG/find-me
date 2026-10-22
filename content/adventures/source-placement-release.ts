import { INTEGRATED_COLLECTION_BOARDS, INTEGRATED_WIZARD_CATALOG } from "./wizard-integrated-release";
import { materializeSourcePlacementRelease, sourcePlacementSha256, type SourcePlacementBaseBoard } from "../../src/domain/scene/source-placement-release";

/** Prospective only. No base scene, old placement or paid receipt is changed.
 * Every v12 Journey/Kingdom hide is materialized; only the listed local source
 * neighborhood has annotations. This is neither board-wide crowd coverage nor
 * artistic acceptance of a future render. */
export const SOURCE_PLACEMENT_RELEASE_ID = "integrated-v12-source-neighbors-20261022";
export const SOURCE_PLACEMENT_BASE: readonly SourcePlacementBaseBoard[] = INTEGRATED_COLLECTION_BOARDS.map(board => {
  const plan = INTEGRATED_WIZARD_CATALOG.boards.find(p => p.boardSlug === board.board);
  if (!plan || plan.status !== "ready" || plan.sceneVersion !== 12 || board.art !== `public${plan.art.base}`)
    throw Error("SOURCE_PLACEMENT: complete original v12 source release is required");
  return { board, sceneVersion: 12, source: { art: board.art, sha256: plan.art.sha256,
    width: plan.art.width, height: plan.art.height } };
});

export const SOURCE_PLACEMENT_RELEASE = materializeSourcePlacementRelease({
  releaseId: SOURCE_PLACEMENT_RELEASE_ID, base: SOURCE_PLACEMENT_BASE,
  overrides: [{
    boardId: "greatwall", hideId: "greatwall-v12-2",
    // Same source, pose/support, crop (1424,794,512,768) and target ID. The
    // narrower child envelope permits a return boundary between intact heads.
    child: { left: 108, top: 208, width: 256, height: 350 },
    returnRect: { left: 66, top: 136, width: 312, height: 632 },
    // Board-native, conservative head/hair/neck boxes measured on original
    // 3840x2160 journey-china-refresh-v8/base.webp, not on a child's render.
    // Context coverage: the four local neighbors plus the source child that
    // may be replaced wholly. The return's 12px feather crosses no listed head.
    neighbors: [
      { sourceId: "greatwall-dumpling-elder", head: { left: 1270, top: 930, width: 200, height: 222 } },
      { sourceId: "greatwall-framed-child", head: { left: 1565, top: 770, width: 130, height: 154 } },
      { sourceId: "greatwall-source-dumpling-child", head: { left: 1590, top: 1020, width: 195, height: 220 } },
      { sourceId: "greatwall-shadow-puppet-child", head: { left: 1806, top: 1068, width: 166, height: 223 } },
      { sourceId: "greatwall-shadow-puppet-adult", head: { left: 1550, top: 1338, width: 190, height: 207 } },
    ],
  }],
});

/** Frozen release digest, independent of a future catalog edit. A new manifest
 * needs a distinct explicit release and registry entry; never silently update a
 * previously pinned game's expected data. */
export const SOURCE_PLACEMENT_RELEASE_SHA256 = "0ddbf5dd9042c3e7689b72db64ebeac49366a5fd2c7a2c4055b499af546f4dde";
export function assertSourcePlacementReleaseHash(): void {
  if (sourcePlacementSha256(SOURCE_PLACEMENT_RELEASE) !== SOURCE_PLACEMENT_RELEASE_SHA256)
    throw Error("SOURCE_PLACEMENT: tracked release differs from its frozen complete-inventory hash");
}

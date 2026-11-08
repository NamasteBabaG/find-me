/** Additive source authoring. The historical board, placement and shrink-only
 * recovery contracts are unchanged. These are fixed public-source permissions,
 * not customer identifiers, retained-image hashes or model-reported measurements. */
export const KINGDOM_FIGURE_RETURN_RELEASE = 'kingdom-figure-return/v1' as const;
export const KINGDOM_FIGURE_RETURNS = Object.freeze([
  { boardId: 'cloudcity', hideId: 'cloudcity-detectives-hide-1', sceneVersion: 13, pose: 'standing', standingHeight: 370,
    source: { art: 'public/scenes/kingdom-cloudcity-detectives-v1/base.webp',
      sha256: '68457bc37a4c2a673ea6a089826e90e93cc6bc572d21973362d988155beff136', width: 3344, height: 1882 },
    sourcePngSha256: '7cb4bafb67143961a7f09632cc498e838ee5d0b8ade7c7e097b0cbbcb027ccb4',
    parentPlacementSha256: '57c7c88f7ea8fccd964105445c5bc00a8e1fe40f90663ce9213ac0619b94ecb6',
    crop: { left: 124, top: 854, width: 512, height: 768 }, child: { left: 90, top: 228, width: 238, height: 310 },
    parentReturned: { left: 66, top: 204, width: 286, height: 358 },
    baselineReturned: { left: 66, top: 210, width: 286, height: 346 },
    extensions: [
      { kind: 'head', rect: { left: 138, top: 168, width: 172, height: 54 } },
      { kind: 'foot', rect: { left: 130, top: 544, width: 194, height: 56 } },
    ],
    // Complete source head/hair bounds, not merely the core preserved by pixels.
    // Source bounds may continue outside this evidence crop; those pixels are
    // outside every addition and remain the original board.
    sourcePeople: [
      { sourceId: 'upper-left-person', head: { left: 108, top: 80, width: 144, height: 132 },
        protectedCore: { left: 112, top: 86, width: 136, height: 94 }, feather: 4,
        targetOcclusion: { left: 138, top: 180, width: 114, height: 32 },
        role: 'Face and crown stay intact behind the target. Only the lower loose hair may be coherently occluded by the target.' },
      { sourceId: 'right-person', head: { left: 372, top: 322, width: 180, height: 230 },
        protectedCore: { left: 372, top: 322, width: 180, height: 230 }, feather: 12,
        role: 'The neighboring head and hair stay exactly the original scene, including their continuation beyond the crop.' },
      { sourceId: 'foreground-person', head: { left: 70, top: 588, width: 285, height: 200 },
        protectedCore: { left: 70, top: 588, width: 285, height: 200 }, feather: 4,
        role: 'The foreground head and braid stay exactly the original scene in front of the target.' },
    ],
    replacedSourceHead: { left: 126, top: 216, width: 182, height: 142 },
    replacedSourceLowerBody: { left: 170, top: 510, width: 132, height: 74 },
    measurementBounds: { left: 78, top: 168, width: 262, height: 420 },
  },
] as const);

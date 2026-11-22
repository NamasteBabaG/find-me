/** Public, measured source placement. The other 26 placements keep their own source contracts. */
export const KINGDOM_FALLBACK_PLACEMENT = {
  version: 'kingdom-fallback-placement/v1',
  boardId: 'sweetworkshop',
  hideId: 'sweetworkshop-detectives-hide-3',
  targetId: 'hide-3',
  sourceSha256: 'fd3e5da18f9cabe47104b3905ba2701e93faa050790fe1993f7e4ee5f6a08c7a',
  originalCrop: { left: 1234, top: 0, width: 512, height: 768 },
  originalReturn: { left: 0, top: 80, width: 480, height: 416 },
  // The child sorting candy at the upper counter. The solid counter and the
  // tray cover the lower body, and nearby heads clear the feathered return.
  fallback: {
    left: 2144, top: 72, pose: 'peeking',
    mask: { left: 196, top: 128, width: 117, height: 151 },
    returnRect: { left: 184, top: 116, width: 144, height: 183 },
    hint: { en: 'Look by the candy tray beside the gifts on the upper counter.', he: 'חפשו ליד מגש הממתקים, לצד המתנות על הדלפק העליון.' },
    wardrobe: 'Slate-blue baker apron over a cream cotton shirt. Keep the reference hair visible.',
    placement: {
      depth: 'deep', standingHeightPx: 310,
      support: 'Sort the candy on the small dark tray at the upper counter. Keep the visible arms and their contact with the tray and the worktop. The solid counter naturally covers the lower body.',
      lighting: 'Warm workshop window light. Match the nearby matte faces and painted fabric.',
      occlusion: 'Keep the real tray and counter in front of the child, with a continuous visible torso. Preserve the gift wrapper on the left and the baker below. No invented visible legs or feet.',
      comparators: 'Match the size and perspective of the original child with the dark cap sorting candy, and preserve the reference face, hair and age.',
    },
  },
  neighbors: [
    { sourceId: 'candy-sorter', head: { left: 2359, top: 208, width: 94, height: 89 } },
    { sourceId: 'gift-wrapper', head: { left: 2240, top: 112, width: 87, height: 102 } },
    { sourceId: 'baker-right', head: { left: 2539, top: 148, width: 99, height: 112 } },
    { sourceId: 'baker-below', head: { left: 2346, top: 395, width: 121, height: 112 } },
  ],
} as const;

export const KINGDOM_FALLBACK_PLACEMENT_SHA256 = '19b8fcb4eb096649c39106e31c895509b56a3aa97468fe3bb02ed1e680be6fa3';
export const KINGDOM_FALLBACK_RECOVERY_ACTION = 'generation:' + KINGDOM_FALLBACK_PLACEMENT.version;

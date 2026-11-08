/** Additive public-source head/hair permission. No generated face, customer
 * coordinate or historical mask is an authority for this source footprint. */
export const SOURCE_HEAD_RECOVERY_AUTHORITIES = Object.freeze([
  {
    id: 'kingdom-sweet-left-decorator-head/v1', boardId: 'sweetworkshop', hideId: 'sweetworkshop-v12-3',
    sceneVersion: 12, pose: 'peeking', ageYears: 7,
    source: { art: 'public/scenes/magic-sweetworkshop-refresh-v3/base.webp',
      sha256: 'af85c124ca9dfab2ee2ca86d86a86a9b18cbc746468aba4f30084a6606b1710d', width: 3840, height: 2160 },
    sourcePngSha256: 'b1b82501b4976249fcdbbd6caa83f220b89e7f6509bafc64be8a4414826a4351',
    basePlacementSha256: '763ea0b7b42b4782523a0666199b09b8452c12590fcf633a23f0420323072284',
    crop: { left: 766, top: 946, width: 512, height: 768 },
    child: { left: 140, top: 220, width: 232, height: 326 },
    returned: { left: 20, top: 100, width: 472, height: 566 },
    // The front blonde girl's WHOLE bun, ponytail, face, hairline and neck.
    // The blue-apron boy behind/right is a different person, not a spare target.
    editableHead: [[150,250],[183,216],[260,208],[303,234],[315,270],[350,300],[359,355],
      [343,405],[325,438],[297,447],[270,447],[240,438],[219,428],[194,401],[175,375],[155,344]],
    sourceHeadCore: [[206,231],[270,234],[285,252],[309,267],[328,290],[340,318],[338,353],
      [327,382],[309,402],[279,412],[252,404],[230,397],[213,377],[190,372],[177,352],
      [171,328],[178,300],[191,279],[195,250]],
    protectedHeads: [
      [[326,111],[430,111],[456,153],[452,210],[431,259],[409,287],[369,292],[340,275],
        [324,249],[308,214],[302,183],[308,142]],
      [[0,26],[112,26],[140,88],[128,160],[110,201],[57,220],[0,204]],
    ],
    // The decorating hands, spoon, cream, counter and apron below the neck
    // remain source pixels. No paid RAW supplies these body/prop pixels.
    protectedBelow: 448,
    protectedRects: [
      { left: 139, top: 448, width: 104, height: 97 },
      { left: 275, top: 448, width: 237, height: 320 },
    ],
  },
] as const);

import { sourcePlacementSha256 } from '../../src/domain/scene/source-placement-release';
import { sourceBodyManifestSchema } from '../../src/domain/scene/source-body-repair';
/** Additive correction of two measured public source footprints. No old family data changes. */
export const SOURCE_BODY_REPAIR_MANIFEST = sourceBodyManifestSchema.parse({
  "version": "source-body-geometry/v1",
  "parentManifestSha256": "f3bc050a8b258050da9a91982cf3de6709e80069eae40582123fafb63c2d8027",
  "entries": [
    {
      "boardId": "paris",
      "hideId": "paris-detectives-hide-1",
      "sourceSha256": "85e29b9efead0e06eea5b9cc40d9a7d2af84f114cb1bdf01338c9cbf381f01a4",
      "crop": {
        "left": 500,
        "top": 650,
        "width": 512,
        "height": 768
      },
      "child": {
        "left": 135,
        "top": 195,
        "width": 175,
        "height": 355
      },
      "returnRect": {
        "left": 123,
        "top": 183,
        "width": 226,
        "height": 379
      },
      "editableRects": [
        {
          "left": 135,
          "top": 195,
          "width": 175,
          "height": 355
        },
        {
          "left": 300,
          "top": 300,
          "width": 37,
          "height": 170
        }
      ],
      "editablePolygons": [],
      "protectedRects": [
        {
          "left": 310,
          "top": 145,
          "width": 98,
          "height": 100
        },
        {
          "left": 338,
          "top": 425,
          "width": 174,
          "height": 343
        }
      ],
      "sourceBodyChecks": [
        {
          "left": 310,
          "top": 345,
          "width": 25,
          "height": 105
        }
      ],
      "targetSourceId": "source-petanque-child",
      "propDirections": "Keep the small petanque balls, map readers, the upper dancer feet and the COMPLETE flower carrier, including their bag, exactly at their original coordinates.",
      "parentReturnRect": {
        "left": 123,
        "top": 183,
        "width": 199,
        "height": 379
      }
    },
    {
      "boardId": "giza",
      "hideId": "giza-detectives-hide-2",
      "sourceSha256": "d02ad65ef1024d531e1bc07727cc881db2720c0682b372991f048b9de2a940b9",
      "crop": {
        "left": 2210,
        "top": 650,
        "width": 512,
        "height": 768
      },
      "child": {
        "left": 130,
        "top": 220,
        "width": 180,
        "height": 345
      },
      "returnRect": {
        "left": 118,
        "top": 208,
        "width": 232,
        "height": 390
      },
      "editableRects": [
        {
          "left": 130,
          "top": 220,
          "width": 180,
          "height": 345
        },
        {
          "left": 185,
          "top": 540,
          "width": 140,
          "height": 43
        }
      ],
      "editablePolygons": [
        [
          [
            300,
            342
          ],
          [
            321,
            351
          ],
          [
            330,
            415
          ],
          [
            325,
            448
          ],
          [
            310,
            450
          ]
        ],
        [
          [
            300,
            458
          ],
          [
            328,
            498
          ],
          [
            338,
            550
          ],
          [
            327,
            579
          ],
          [
            302,
            579
          ]
        ]
      ],
      "protectedRects": [
        {
          "left": 90,
          "top": 412,
          "width": 50,
          "height": 58
        },
        {
          "left": 275,
          "top": 583,
          "width": 67,
          "height": 50
        }
      ],
      "sourceBodyChecks": [
        {
          "left": 310,
          "top": 365,
          "width": 10,
          "height": 55
        },
        {
          "left": 300,
          "top": 550,
          "width": 20,
          "height": 25
        },
        {
          "left": 196,
          "top": 565,
          "width": 32,
          "height": 14
        }
      ],
      "targetSourceId": "source-purple-hoop-child",
      "propDirections": "Preserve the existing wooden hoop, its ground contact and the long hoop stick at their ORIGINAL coordinates. Connect the new hand naturally to the original upper stick; do not move the prop or erase the left green player shoe, the kneeling archaeology child or the orange runner.",
      "parentReturnRect": {
        "left": 118,
        "top": 208,
        "width": 204,
        "height": 369
      }
    }
  ]
});
export const SOURCE_BODY_REPAIR_MANIFEST_SHA256 = 'adeb6ebaef3a296aa143c6830572047c823819d6d54eeb5a560bd7ca516d2f99';
export function assertSourceBodyManifest(){if(sourcePlacementSha256(SOURCE_BODY_REPAIR_MANIFEST)!==SOURCE_BODY_REPAIR_MANIFEST_SHA256)throw Error('SOURCE_BODY: public geometry manifest changed');}

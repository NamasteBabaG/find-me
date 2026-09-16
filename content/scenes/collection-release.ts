import { SceneDefinitionSchema } from "../../src/domain/scene/schema";
import { maskOf } from "../../src/domain/scene/local-patch-hides";
import { COLLECTION_PATCH_BOARDS, COLLECTION_SCENE_VERSION, WIZARD_ADVENTURE_CATALOG } from "../adventures/wizard-release";
import { localPatchSceneRelease } from "./local-patch-release";

export function collectionSceneRelease(raw: unknown): unknown {
  const legacy = SceneDefinitionSchema.parse(localPatchSceneRelease(raw));
  const board = COLLECTION_PATCH_BOARDS.find(b => b.board === legacy.slug);
  const plan = WIZARD_ADVENTURE_CATALOG.boards.find(b => b.boardSlug === legacy.slug);
  if (!board || !plan || plan.status !== "ready") throw new Error(`Missing collection board ${legacy.slug}`);
  return { ...legacy, version: COLLECTION_SCENE_VERSION, artStatus: "final",
    art: { ...plan.art, thumbnail: plan.art.base, palette: legacy.art.palette }, ambient: [], bonus: undefined,
    playMode: "find-any", appearancesPerBoard: 3, findsRequiredToAdvance: 3,
    wardrobe: board.wardrobe,
    celebration: { ...legacy.celebration, completeText: { he: "מצאתם את {name} שלוש פעמים — הבורד הושלם!", en: "You found {name} three times — board complete!" } },
    targets: board.hides.map((hide, i) => {
      const template = legacy.targets[Math.min(i, legacy.targets.length - 1)]!;
      const box = maskOf(hide), x = (box.left + box.width / 2) / plan.art.width, y = (box.top + box.height / 2) / plan.art.height;
      return { ...template, id: hide.targetId, targetType: `${legacy.slug}_v10_${i + 1}`,
        difficulty: (i + 1), slots: template.slots.map((slot, variant) => ({ ...slot,
          id: `${hide.targetId}-${variant ? "B" : "A"}`, x, y, scale: box.height / plan.art.height,
          hintText: hide.hint!, hintZone: { x, y, r: Math.max(0.04, box.width / plan.art.width) },
          flip: false, rotation: 0, layer: "front",
        })),
      };
    }),
  };
}

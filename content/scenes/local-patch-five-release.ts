import { localPatchSceneRelease } from "./local-patch-release";
import { localPatchBoardForVersion, LOCAL_PATCH_FIVE_SCENE_VERSION, LOCAL_PATCH_STRICT_SCENE_VERSION } from "../../src/domain/scene/local-patch-catalog";
import { maskOf } from "../../src/domain/scene/local-patch-hides";
import { SceneDefinitionSchema } from "../../src/domain/scene/schema";

/** A new opt-in release, never replacing or reinterpreting v6 paid content. */
export function localPatchFiveSceneRelease(raw: unknown): unknown {
  const legacy = SceneDefinitionSchema.parse(localPatchSceneRelease(raw));
  const board = localPatchBoardForVersion(legacy.slug, LOCAL_PATCH_FIVE_SCENE_VERSION);
  if (!board) throw new Error(`No five-hide release for ${legacy.slug}`);
  return {
    ...legacy, version: LOCAL_PATCH_FIVE_SCENE_VERSION,
    playMode: "find-any", appearancesPerBoard: 5, findsRequiredToAdvance: 3,
    wardrobe: board.wardrobe,
    celebration: { ...legacy.celebration, completeText: { he: "מצאתם את {name} חמש פעמים — הבורד הושלם!", en: "You found {name} five times — board complete!" } },
    targets: board.hides.map((hide, i) => {
      const template = legacy.targets[Math.min(i, 2)]!;
      const box = maskOf(hide), x = (box.left + box.width / 2) / legacy.art.width, y = (box.top + box.height / 2) / legacy.art.height;
      return { ...template, id: hide.targetId, targetType: `${legacy.slug}_v7_${i + 1}`,
        difficulty: hide.placement!.depth === "near" ? 1 : hide.placement!.depth === "middle" ? 2 : 3,
        slots: template.slots.map((slot, variant) => ({ ...slot, id: `${hide.targetId}-${variant ? "B" : "A"}`,
          x, y, scale: box.height / legacy.art.height, hintText: hide.hint!, hintZone: { x, y, r: Math.max(0.04, box.width / legacy.art.width) } })),
      };
    }),
  };
}

/** Version8 changes generation quality policy, never a historical game's art. */
export function localPatchStrictSceneRelease(raw: unknown): unknown {
  return { ...SceneDefinitionSchema.parse(localPatchFiveSceneRelease(raw)), version: LOCAL_PATCH_STRICT_SCENE_VERSION };
}

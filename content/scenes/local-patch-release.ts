import release from "../local-patch-world/art.json";
import { WORLD_LOCAL_PATCH_HIDES, maskOf } from "../../src/domain/scene/local-patch-hides";
import { localPatchHint } from "../../src/domain/scene/local-patch-hints";
import { SceneDefinitionSchema } from "../../src/domain/scene/schema";

export const LOCAL_PATCH_SCENE_VERSION = release.sceneVersion;

/** Explicit version-6 authoring overlay for the local-patch engine. Imported
 * scene.json files remain the defaults for legacy callers and keep their art
 * and hints. Only a game pinned to v6 selects this engine-specific contract. */
export function localPatchSceneRelease(raw: unknown): unknown {
  const source = SceneDefinitionSchema.parse(raw);
  const board = WORLD_LOCAL_PATCH_HIDES.find(row => row.board === source.slug);
  if (!board) return raw;
  const artwork = release.boards.find(row => row.board === board.board);
  if (!artwork || `public${artwork.base}` !== board.art) throw new Error(`LOCAL_PATCH: inconsistent art for ${board.board}`);
  if (source.version >= LOCAL_PATCH_SCENE_VERSION) throw new Error(`LOCAL_PATCH: release must advance ${board.board}'s version`);
  const { foreground: _foreground, ...art } = source.art;
  return {
    ...source,
    version: LOCAL_PATCH_SCENE_VERSION,
    art: { ...art, base: artwork.base, thumbnail: artwork.thumbnail, sha256: artwork.sha256, width: artwork.width, height: artwork.height },
    targets: source.targets.map(target => {
      const hide = board.hides.find(row => row.targetId === target.id);
      if (!hide) throw new Error(`LOCAL_PATCH: no hide for ${board.board}/${target.id}`);
      const box = maskOf(hide);
      const x = (box.left + box.width / 2) / artwork.width;
      const y = (box.top + box.height / 2) / artwork.height;
      const { action: _action, expression: _expression, ...rest } = target;
      return {
        ...rest,
        mission: { en: "Find {name}", he: "מצאו את {name}" },
        item: { en: "the hidden explorer", he: "הדמות המסתתרת" },
        success: [
          { en: "You found me!", he: "מצאתם אותי!" },
          { en: "What a great hiding place!", he: "איזה מקום מחבוא נהדר!" },
          { en: "Ready for another adventure?", he: "מוכנים לעוד הרפתקה?" },
        ],
        // Both replay variants use this same approved appearance. No legacy
        // rotation, mirror, foreground polygon or positional hint may survive.
        slots: target.slots.map(slot => ({
          id: slot.id, x, y, scale: box.height / artwork.height,
          rotation: 0, flip: false, layer: "front", zIndex: 10,
          hintText: localPatchHint(hide.id),
          hintZone: { x, y, r: Math.max(0.075, box.width / artwork.width) },
        })),
      };
    }),
  };
}

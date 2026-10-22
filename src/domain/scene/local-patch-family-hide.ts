import { localPatchFamilyForVersion } from "./local-patch-family";
import { localPatchBoardsForVersion } from "./local-patch-catalog";

/** Exact authored membership in a known family. No ID regex or latest fallback. */
export function localPatchHideForVersion(hideId: string, sceneVersion: number) {
  if (!localPatchFamilyForVersion(sceneVersion)) return null;
  for (const board of localPatchBoardsForVersion(sceneVersion)) {
    const hide = board.hides.find(hide => hide.id === hideId);
    if (hide) return { board, hide };
  }
  return null;
}

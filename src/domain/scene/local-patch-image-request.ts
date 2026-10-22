import type { LocalPatchBoard, LocalPatchHide } from "./local-patch-hides";
import { localPatchHideForVersion } from "./local-patch-family-hide";
import { localPatchBoardForVersion } from "./local-patch-catalog";

/** Both accounting authority and recovery use the catalog's exact pose, never
 * a second pose enum that can silently omit a valid child placement. */
export function interruptedLocalPatchImageRequest(key: string): { board: LocalPatchBoard; hide: LocalPatchHide; attempt: number; sceneVersion?: 13 } | null {
  const match = /^([a-z]+)-v12-([123]):([^:]+):render:([12])$/.exec(key);
  if (!match) {
    const modern = /^([a-z0-9-]+):([^:]+):render:([12])$/.exec(key);
    const authored = modern ? localPatchHideForVersion(modern[1]!, 13) : null;
    return authored && authored.hide.pose === modern![2] ? { ...authored, attempt: Number(modern![3]), sceneVersion: 13 as const } : null;
  }
  const board = localPatchBoardForVersion(match[1]!, 12);
  const hide = board?.hides.find(h => h.id === `${match[1]}-v12-${match[2]}` && h.pose === match[3]);
  return board && hide ? { board, hide, attempt: Number(match[4]) } : null;
}

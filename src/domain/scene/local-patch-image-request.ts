import { localPatchBoardForVersion } from "./local-patch-catalog";

/** Both accounting authority and recovery use the catalog's exact pose, never
 * a second pose enum that can silently omit a valid child placement. */
export function interruptedLocalPatchImageRequest(key: string) {
  const match = /^([a-z]+)-v12-([123]):([^:]+):render:([12])$/.exec(key);
  if (!match) return null;
  const board = localPatchBoardForVersion(match[1]!, 12);
  const hide = board?.hides.find(h => h.id === `${match[1]}-v12-${match[2]}` && h.pose === match[3]);
  return board && hide ? { board, hide, attempt: Number(match[4]) } : null;
}

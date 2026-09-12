import { WORLD_LOCAL_PATCH_HIDES, type LocalPatchBoard } from "./local-patch-hides";
import { FIVE_HIDE_BOARDS } from "./local-patch-five-hides";

export const LOCAL_PATCH_FIVE_SCENE_VERSION = 7;
export const isLocalPatchAdvisoryVersion = (version: number | undefined): boolean => version === LOCAL_PATCH_FIVE_SCENE_VERSION;

/** No default-to-latest: a missing historical version must never move a paid child. */
export function localPatchBoardsForVersion(version: number): readonly LocalPatchBoard[] {
  return version === 6 ? WORLD_LOCAL_PATCH_HIDES : version === LOCAL_PATCH_FIVE_SCENE_VERSION ? FIVE_HIDE_BOARDS : [];
}
export function localPatchBoardForVersion(slug: string, version: number): LocalPatchBoard | null {
  return localPatchBoardsForVersion(version).find(board => board.board === slug) ?? null;
}
export const ALL_LOCAL_PATCH_BOARDS = [...WORLD_LOCAL_PATCH_HIDES, ...FIVE_HIDE_BOARDS] as const;

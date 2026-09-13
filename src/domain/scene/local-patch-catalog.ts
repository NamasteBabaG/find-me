import { WORLD_LOCAL_PATCH_HIDES, type LocalPatchBoard } from "./local-patch-hides";
import { FIVE_HIDE_BOARDS } from "./local-patch-five-hides";

export const LOCAL_PATCH_FIVE_SCENE_VERSION = 7;
export const LOCAL_PATCH_STRICT_SCENE_VERSION = 8;
export const LOCAL_PATCH_AGE_SCENE_VERSION = 9;
export const isLocalPatchAgeVersion = (version: number | undefined): boolean => version === LOCAL_PATCH_AGE_SCENE_VERSION;
export const isLocalPatchStrictVersion = (version: number | undefined): boolean => version === LOCAL_PATCH_STRICT_SCENE_VERSION || isLocalPatchAgeVersion(version);
/** Grouped five-hide workflow; v8 adds narrow quality exceptions to warnings. */
export const isLocalPatchAdvisoryVersion = (version: number | undefined): boolean => version === LOCAL_PATCH_FIVE_SCENE_VERSION || isLocalPatchStrictVersion(version);

/** No default-to-latest: a missing historical version must never move a paid child. */
export function localPatchBoardsForVersion(version: number): readonly LocalPatchBoard[] {
  return version === 6 ? WORLD_LOCAL_PATCH_HIDES : isLocalPatchAdvisoryVersion(version) ? FIVE_HIDE_BOARDS : [];
}
export function localPatchBoardForVersion(slug: string, version: number): LocalPatchBoard | null {
  return localPatchBoardsForVersion(version).find(board => board.board === slug) ?? null;
}
export const ALL_LOCAL_PATCH_BOARDS = [...WORLD_LOCAL_PATCH_HIDES, ...FIVE_HIDE_BOARDS] as const;

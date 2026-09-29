import { REFRESHED_COLLECTION_BOARDS } from "../../../content/adventures/wizard-refresh-release";
import { INTEGRATED_COLLECTION_BOARDS } from "../../../content/adventures/wizard-integrated-release";
import { isCollectionVersion, REFRESHED_COLLECTION_VERSION, INTEGRATED_COLLECTION_VERSION } from "./local-patch-versions";
export { isCollectionVersion, REFRESHED_COLLECTION_VERSION };
import { WORLD_LOCAL_PATCH_HIDES, type LocalPatchBoard } from "./local-patch-hides";
import { FIVE_HIDE_BOARDS } from "./local-patch-five-hides";
import { COLLECTION_PATCH_BOARDS, COLLECTION_SCENE_VERSION } from "../../../content/adventures/wizard-release";
export { COLLECTION_SCENE_VERSION };
export const localPatchHidesPerBoard = (version: number | undefined) => isCollectionVersion(version) || version === 6 ? 3 : 5;

export const LOCAL_PATCH_FIVE_SCENE_VERSION = 7;
export const LOCAL_PATCH_STRICT_SCENE_VERSION = 8;
export const LOCAL_PATCH_AGE_SCENE_VERSION = 9;
export const isLocalPatchAgeVersion = (version: number | undefined): boolean => version === LOCAL_PATCH_AGE_SCENE_VERSION || isCollectionVersion(version);
export const isLocalPatchStrictVersion = (version: number | undefined): boolean => version === LOCAL_PATCH_STRICT_SCENE_VERSION || isLocalPatchAgeVersion(version);
/** Grouped review; v10 carries three hides, historical v7-v9 carry five. */
export const isLocalPatchAdvisoryVersion = (version: number | undefined): boolean => version === LOCAL_PATCH_FIVE_SCENE_VERSION || isLocalPatchStrictVersion(version);

/** No default-to-latest: a missing historical version must never move a paid child. */
export function localPatchBoardsForVersion(version: number): readonly LocalPatchBoard[] {
  return version === INTEGRATED_COLLECTION_VERSION ? INTEGRATED_COLLECTION_BOARDS : version === REFRESHED_COLLECTION_VERSION ? REFRESHED_COLLECTION_BOARDS : version === COLLECTION_SCENE_VERSION ? COLLECTION_PATCH_BOARDS : version === 6 ? WORLD_LOCAL_PATCH_HIDES : isLocalPatchAdvisoryVersion(version) ? FIVE_HIDE_BOARDS : [];
}
export function localPatchBoardForVersion(slug: string, version: number): LocalPatchBoard | null {
  return localPatchBoardsForVersion(version).find(board => board.board === slug) ?? null;
}
export const ALL_LOCAL_PATCH_BOARDS = [...WORLD_LOCAL_PATCH_HIDES, ...FIVE_HIDE_BOARDS, ...COLLECTION_PATCH_BOARDS, ...REFRESHED_COLLECTION_BOARDS, ...INTEGRATED_COLLECTION_BOARDS] as const;

import { DETECTIVES_SCENE_VERSION, INTEGRATED_COLLECTION_VERSION, REFRESHED_COLLECTION_VERSION } from "./local-patch-versions";

/** Closed runtime capabilities, not a default-to-latest content selector.
 * A capability supports a route; its per-game pins still authorize that route.
 * Historical callers retain their original contracts for every old version. */
export type LocalPatchCapabilities = Readonly<{
  collection: boolean; advisoryReview: boolean; strictReview: boolean; ageBody: boolean;
  refreshedIdentity: boolean; integratedQuality: boolean; mediumPainter: boolean;
  readyOnlyDualReview: boolean; fullSourceIdentity: boolean; automaticRecovery: boolean;
  subjectEnrollment: boolean; requiresFamilyPin: boolean;
}>;
export type LocalPatchRuntimeCapabilities = Readonly<{
  familyId: string; sceneVersion: number; searchLevel: "explorers" | "detectives";
  worldSlugs: readonly string[]; hidesPerBoard: 3 | 5; capabilities: LocalPatchCapabilities;
}>;

const entry = (sceneVersion: number, familyId: string, hidesPerBoard: 3 | 5,
  on: readonly (keyof LocalPatchCapabilities)[], detectives = false): LocalPatchRuntimeCapabilities => Object.freeze({
  familyId, sceneVersion, searchLevel: detectives ? "detectives" : "explorers",
  worldSlugs: Object.freeze(sceneVersion === INTEGRATED_COLLECTION_VERSION ? ["journey", "kingdom"] : ["journey"]),
  hidesPerBoard, capabilities: Object.freeze({
    collection: on.includes("collection"), advisoryReview: on.includes("advisoryReview"),
    strictReview: on.includes("strictReview"), ageBody: on.includes("ageBody"),
    refreshedIdentity: on.includes("refreshedIdentity"), integratedQuality: on.includes("integratedQuality"),
    mediumPainter: on.includes("mediumPainter"), readyOnlyDualReview: on.includes("readyOnlyDualReview"),
    fullSourceIdentity: on.includes("fullSourceIdentity"), automaticRecovery: on.includes("automaticRecovery"),
    subjectEnrollment: on.includes("subjectEnrollment"), requiresFamilyPin: on.includes("requiresFamilyPin"),
  }),
});
const strict = ["advisoryReview", "strictReview"] as const;
const age = [...strict, "ageBody"] as const;
const collection = [...age, "collection", "automaticRecovery"] as const;
const refreshed = [...collection, "refreshedIdentity"] as const;
const integrated = [...refreshed, "integratedQuality", "mediumPainter", "readyOnlyDualReview", "fullSourceIdentity", "subjectEnrollment"] as const;
const families = new Map<number, LocalPatchRuntimeCapabilities>([
  [6, entry(6, "local-patch/v6", 3, ["mediumPainter"])],
  [7, entry(7, "five-hide/v7", 5, ["advisoryReview"])],
  [8, entry(8, "strict-five-hide/v8", 5, strict)],
  [9, entry(9, "age-five-hide/v9", 5, age)],
  [10, entry(10, "collection/v10", 3, collection)],
  [REFRESHED_COLLECTION_VERSION, entry(REFRESHED_COLLECTION_VERSION, "refreshed-journey/v11", 3, refreshed)],
  [INTEGRATED_COLLECTION_VERSION, entry(INTEGRATED_COLLECTION_VERSION, "integrated-explorers/v12", 3, integrated)],
  [DETECTIVES_SCENE_VERSION, entry(DETECTIVES_SCENE_VERSION, "journey-detectives/v1", 3, [...integrated, "requiresFamilyPin"], true)],
]);

export function localPatchFamilyForVersion(version: number | undefined): LocalPatchRuntimeCapabilities | null {
  return version === undefined ? null : families.get(version) ?? null;
}

/** A concise feature gate with the same closed version authority. */
export function hasLocalPatchCapability(version: number | undefined, capability: keyof LocalPatchCapabilities): boolean {
  return localPatchFamilyForVersion(version)?.capabilities[capability] === true;
}

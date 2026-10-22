import { describe, expect, it } from "vitest";
import { hasLocalPatchCapability, localPatchFamilyForVersion } from "../local-patch-family";
import { DETECTIVES_SCENE_VERSION, INTEGRATED_COLLECTION_VERSION, isCollectionVersion, isRefreshedCollectionVersion } from "../local-patch-versions";

describe("explicit local-patch runtime families", () => {
  it("gives Detectives its own three-hide Journey family without changing the integrated version", () => {
    expect(DETECTIVES_SCENE_VERSION).toBe(13);
    expect(INTEGRATED_COLLECTION_VERSION).toBe(12);
    const family = localPatchFamilyForVersion(13)!;
    expect(family.familyId).toBe("journey-detectives/v1");
    expect(family.searchLevel).toBe("detectives");
    expect(family.worldSlugs).toEqual(["journey"]);
    expect(family.hidesPerBoard).toBe(3);
    expect(family.capabilities).toMatchObject({ mediumPainter: true, integratedQuality: true, fullSourceIdentity: true,
      refreshedIdentity: true, subjectEnrollment: true, readyOnlyDualReview: true, automaticRecovery: true, requiresFamilyPin: true });
    expect(isCollectionVersion(13)).toBe(true);
    expect(isRefreshedCollectionVersion(13)).toBe(false);
  });
  it("does not turn old low/advisory, strict-selection or source policies into the new family", () => {
    expect(localPatchFamilyForVersion(7)).toMatchObject({ hidesPerBoard: 5, capabilities: { mediumPainter: false, strictReview: false, integratedQuality: false } });
    expect(localPatchFamilyForVersion(9)).toMatchObject({ capabilities: { ageBody: true, refreshedIdentity: false, fullSourceIdentity: false } });
    expect(localPatchFamilyForVersion(11)).toMatchObject({ capabilities: { refreshedIdentity: true, integratedQuality: false, mediumPainter: false } });
    expect(localPatchFamilyForVersion(12)).toMatchObject({ searchLevel: "explorers", worldSlugs: ["journey", "kingdom"], capabilities: { requiresFamilyPin: false } });
    expect(localPatchFamilyForVersion(6)).toMatchObject({ hidesPerBoard: 3, capabilities: { mediumPainter: true, collection: false } });
  });
  it("refuses unknown and nonintegral versions rather than assigning the latest capabilities", () => {
    for (const value of [undefined, 0, 5, 14, 12.5, NaN, Infinity]) expect(localPatchFamilyForVersion(value)).toBeNull();
    expect(isCollectionVersion(14)).toBe(false);
    expect(hasLocalPatchCapability(13, "integratedQuality")).toBe(true);
    expect(hasLocalPatchCapability(14, "integratedQuality")).toBe(false);
    expect(hasLocalPatchCapability(undefined, "fullSourceIdentity")).toBe(false);
    expect(hasLocalPatchCapability(9, "integratedQuality")).toBe(false);
  });
  it("does not expose mutable capability or world lists", () => {
    const family = localPatchFamilyForVersion(13)!;
    expect(Object.isFrozen(family)).toBe(true);
    expect(Object.isFrozen(family.capabilities)).toBe(true);
    expect(Object.isFrozen(family.worldSlugs)).toBe(true);
  });
});

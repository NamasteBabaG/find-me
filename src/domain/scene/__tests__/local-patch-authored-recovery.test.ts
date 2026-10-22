import { describe, expect, it } from "vitest";
import { authoredLocalPatchReturnContract, LOCAL_PATCH_COMPOSITION_VERSION, localPatchReturnRegion } from "../local-patch-return-region";
import { AUTHORED_RECOVERY_VERSION, authoredRecoveryAlpha, authoredRecoveryParentSha256, createAuthoredLocalPatchRecovery,
  readAuthoredLocalPatchRecovery } from "../local-patch-authored-recovery";
import type { SelfRepairDecision } from "../local-patch-self-repair";

const source = { art: "public/scenes/synthetic/base.webp", sha256: "a".repeat(64), width: 3840, height: 2160 };
const placement = { manifestSha256: "b".repeat(64), basePlacementSha256: "c".repeat(64) };
const input = { contentVersion: 12, boardId: "synthetic", hideId: "synthetic-hide", source,
  crop: { left: 1424, top: 794, width: 512, height: 768 }, child: { left: 108, top: 208, width: 256, height: 350 },
  authored: { left: 66, top: 136, width: 312, height: 632 } };
const parent = authoredLocalPatchReturnContract({ ...input, sourcePlacement: placement });
const decision: SelfRepairDecision = { cause: "neighbor-damage", explanation: "The corrected child and closed join preserve the complete original neighbours.",
  action: "redraw-with-new-placement", sourceKey: "synthetic-hide:standing:render:1", returnWindow: { left: 74, top: 136, width: 304, height: 631 },
  protectedCore: { left: 128, top: 228, width: 220, height: 312 }, faceRect: { left: 180, top: 250, width: 65, height: 70 } };
const data = () => ({ parent, cycle: 1, decision, sourcePngSha256: "d".repeat(64),
  diagnosis: { requestKey: "self-repair:synthetic-hide:diagnosis:1", operationFingerprint: "e".repeat(64), rawSha256: "f".repeat(64) },
  source: { requestKey: "synthetic-hide:standing:self-repair:1", operationFingerprint: "1".repeat(64), retainedRawSha256: "2".repeat(64), normalizedRawSha256: "3".repeat(64) } });

describe("derived same-crop authored recovery contract", () => {
  it("omits companion metadata on old v4 and preserves the exact v3 return recipe", () => {
    const old = authoredLocalPatchReturnContract(input);
    expect(Object.hasOwn(old, "sourcePlacement")).toBe(false);
    expect(JSON.stringify(old)).not.toContain("sourcePlacement");
    expect(localPatchReturnRegion(input.crop, input.child)).toEqual({
      local: { left: 0, top: 88, width: 484, height: 590 },
      region: { left: 1424, top: 882, width: 484, height: 590 }, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION });
    expect(parent.sourcePlacement).toEqual(placement);
  });
  it("binds the actual paid diagnosis, raw, cycle and closed window to the canonical parent", () => {
    const derived = createAuthoredLocalPatchRecovery(data());
    expect(derived).toMatchObject({ version: AUTHORED_RECOVERY_VERSION, parentSha256: authoredRecoveryParentSha256(parent),
      crop: parent.crop, returnWindow: decision.returnWindow, protectedCore: decision.protectedCore, faceRect: decision.faceRect });
    expect(readAuthoredLocalPatchRecovery(parent, JSON.parse(JSON.stringify(derived)))).toEqual(derived);
    const other = authoredLocalPatchReturnContract({ ...input, sourcePlacement: { ...placement, manifestSha256: "4".repeat(64) } });
    expect(() => readAuthoredLocalPatchRecovery(other, derived)).toThrow("parent");
    expect(() => readAuthoredLocalPatchRecovery(authoredLocalPatchReturnContract(input), derived)).toThrow("parent");
  });
  it.each(["crop", "core", "window", "face", "open-edge", "parent", "diagnosis", "paid-source"])("refuses a changed %s before any join", field => {
    const derived = createAuthoredLocalPatchRecovery(data());
    if (field === "crop") derived.crop.left++;
    if (field === "core") derived.protectedCore.left = 100;
    if (field === "window") derived.returnWindow.left = 65;
    if (field === "face") derived.faceRect.width = 29;
    if (field === "open-edge") derived.returnWindow.height = 632;
    if (field === "parent") derived.parentSha256 = "0".repeat(64);
    if (field === "diagnosis") derived.diagnosis.rawSha256 = "not-a-hash";
    if (field === "paid-source") derived.source.operationFingerprint = "not-a-hash";
    expect(() => readAuthoredLocalPatchRecovery(parent, derived)).toThrow();
  });
  it("keeps every outside pixel original and the child plus12px guard fully paid", () => {
    const a = authoredRecoveryAlpha(createAuthoredLocalPatchRecovery(data()));
    const r = decision.returnWindow, p = decision.protectedCore;
    let outside = 0, protectedChanged = 0, feather = 0;
    for (let y = 0; y < 768; y++) for (let x = 0; x < 512; x++) {
      const v = a[y * 512 + x]!;
      if ((x < r.left || y < r.top || x >= r.left + r.width || y >= r.top + r.height) && v !== 0) outside++;
      if (x >= p.left - 12 && y >= p.top - 12 && x < p.left + p.width + 12 && y < p.top + p.height + 12 && v !== 255) protectedChanged++;
      if (v > 0 && v < 255) feather++;
    }
    expect(outside).toBe(0); expect(protectedChanged).toBe(0); expect(feather).toBeGreaterThan(0);
    expect(a[0]).toBe(0); expect(a[767 * 512 + 511]).toBe(0);
  });
});

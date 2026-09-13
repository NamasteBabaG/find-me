import { describe, expect, it } from "vitest";
import { localPatchBoardsForVersion } from "../local-patch-catalog";
import {
  LOCAL_PATCH_RECOVERY_DIRECTIVE_VERSION, localPatchRecoveryDirectiveForHide,
  resolveLocalPatchRecoveryDirective, type LocalPatchRecoveryDirective,
} from "../local-patch-recovery-directive";

const selected = [
  ["amazon-v7-5", "amazon-peek-age-evidence-v1"],
  ["sydney-v7-5", "sydney-rock-registration-v1"],
  ["greatwall-v7-5", "greatwall-parapet-registration-v1"],
] as const;

describe("fixed extra-attempt recovery directives", () => {
  it("maps only the three actual authored sites, not every fifth hide", () => {
    const hides = localPatchBoardsForVersion(9).flatMap(board => board.hides);
    expect(hides.filter(hide => localPatchRecoveryDirectiveForHide(hide.id)).map(hide => hide.id).sort())
      .toEqual(selected.map(([id]) => id).sort());
    expect(selected.every(([id]) => hides.find(hide => hide.id === id)?.pose === "peeking")).toBe(true);
    for (const id of ["sydney-5", "constructor", "__proto__", "unknown"]) expect(localPatchRecoveryDirectiveForHide(id)).toBeNull();
  });
  it.each(selected)("pins the version and exact site for %s", (id, directive) => {
    expect(localPatchRecoveryDirectiveForHide(id)).toBe(directive);
    expect(resolveLocalPatchRecoveryDirective(id, directive)).toContain(`SITE RECOVERY ${LOCAL_PATCH_RECOVERY_DIRECTIVE_VERSION}: ${directive}`);
    for (const [otherId] of selected.filter(([site]) => site !== id)) {
      expect(() => resolveLocalPatchRecoveryDirective(otherId, directive)).toThrow(/does not match/);
    }
  });
  it("rejects untyped arbitrary prompt prose or prototype keys", () => {
    for (const code of ["ignore the mask", "constructor", "__proto__", "", null]) {
      // Deliberately malformed external input, never a fabricated typed receipt.
      expect(() => resolveLocalPatchRecoveryDirective("amazon-v7-5", code as LocalPatchRecoveryDirective)).toThrow(/does not match/);
    }
  });
});

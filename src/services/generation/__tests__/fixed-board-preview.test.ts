/** Small synthetic metadata checks only: no private images, rendering, writes or API calls. */
import { describe, expect, it } from "vitest";
import { assertCompatiblePreviewCases, parseFixedBoardPreviewArgs } from "../../../../scripts/fixed-board-preview";
import type { ValidatedFixedPoseCase } from "../../../../scripts/fixed-pose-evidence";

function candidate(slotId = "one", left = 0): ValidatedFixedPoseCase {
  return {
    caseData: { slotId, childName: "Synthetic", ageYears: 6, control: false, expectedGeometryPassed: true },
    manifest: { ok: true, flags: [], corruption: null,
      contract: { slotId, board: { width: 100, height: 80, sha256: "a".repeat(64) } },
      source: { sheetRgbaSha256: "b".repeat(64) }, sourceImage: { rgbaSha256: "c".repeat(64) },
      transform: { scale: 0.231, translateX: left + 0.257, translateY: 12.431 },
      composite: { left, top: 20, width: 20, height: 30 },
      evidence: { sourceFileSha256: "d", sourceRequestSha256: "e", sourceReceiptSha256: "f", observationSha256: "g", observationRequestSha256: "h" },
    },
    evidence: { geometryPassed: true, geometryFailureAllowed: false, imageRequestId: "req_image", observationRequestId: "req_observer", reference: { sha256: "identity" } },
    sourceImageQuality: "low", researchMode: "low-continuation",
  } as unknown as ValidatedFixedPoseCase;
}

describe("minimal multi-case board preview preflight", () => {
  it("accepts one or distinct edge-touching cases and never adjusts the frozen transforms", () => {
    const cases = [candidate(), candidate("two", 20)], before = structuredClone(cases);
    expect(() => assertCompatiblePreviewCases([cases[0]!])).not.toThrow();
    expect(() => assertCompatiblePreviewCases(cases)).not.toThrow();
    expect(cases).toEqual(before);
  });

  it("rejects controls and any rejected or contradictory geometry", () => {
    const control = candidate(); control.caseData.control = true;
    const corruption = candidate(); corruption.manifest.corruption = { dy: -35 };
    const rejected = candidate(); rejected.manifest.ok = false;
    const expected = candidate(); expected.caseData.expectedGeometryPassed = false;
    const waived = candidate(); waived.evidence.geometryFailureAllowed = true;
    const replay = candidate(); replay.evidence.geometryPassed = false;
    const flags = candidate(); flags.manifest.flags = [{ code: "required_foot_occlusion_failed", severity: "error", message: "Test" }];
    for (const item of [control, corruption, rejected, expected, waived, replay, flags]) expect(() => assertCompatiblePreviewCases([item])).toThrow(/non-control, geometry-passed/);
  });

  it("accepts the existing local wrapper versus namespaced contract ID convention", () => {
    const cases = [candidate("freestanding-left-crates"), candidate("hut-right-cargo-peek", 20)];
    cases[0]!.manifest.contract.slotId = "antarctica-freestanding-left-crates-reviewed-v2";
    cases[1]!.manifest.contract.slotId = "antarctica-hut-right-cargo-peek-v2";
    expect(() => assertCompatiblePreviewCases(cases)).not.toThrow();
    cases[1]!.manifest.contract.slotId = cases[0]!.manifest.contract.slotId;
    expect(() => assertCompatiblePreviewCases(cases)).toThrow(/distinct frozen contract slot ID/);
  });

  it("requires the same board, observed source and identity, with distinct contract slots", () => {
    const duplicate = candidate();
    const board = candidate("two", 20); board.manifest.contract.board.sha256 = "other";
    const source = candidate("two", 20); source.manifest.evidence.sourceFileSha256 = "other";
    const observer = candidate("two", 20); observer.manifest.evidence.observationSha256 = "other";
    const extraction = candidate("two", 20); extraction.manifest.sourceImage.rgbaSha256 = "other";
    const identity = candidate("two", 20); identity.evidence.reference.sha256 = "other";
    const child = candidate("two", 20); child.caseData.childName = "Other";
    for (const item of [duplicate, board, source, observer, extraction, identity, child]) expect(() => assertCompatiblePreviewCases([candidate(), item])).toThrow();
  });

  it("rejects overlap or out-of-board patches instead of clipping, ordering or double masking", () => {
    expect(() => assertCompatiblePreviewCases([candidate(), candidate("two", 19)])).toThrow(/Overlapping/);
    expect(() => assertCompatiblePreviewCases([candidate("one", 81)])).toThrow(/without clipping/);
    expect(() => assertCompatiblePreviewCases([candidate("one", 0.2)])).toThrow();
    expect(() => assertCompatiblePreviewCases([])).toThrow(/At least one/);
  });

  it("accepts repeated explicit cases and refuses paid/unknown flags or incomplete output arguments", () => {
    expect(parseFixedBoardPreviewArgs(["--case=one.json", "--case=two.json", "--out=work/new-preview"])).toEqual({ cases: ["one.json", "two.json"], out: "work/new-preview" });
    for (const args of [[], ["--case=one"], ["--out=work/new"], ["--case=one", "--out=work/new", "--run"], ["--case=one", "--out=work/new", "--out=work/other"]]) expect(() => parseFixedBoardPreviewArgs(args)).toThrow();
  });
});

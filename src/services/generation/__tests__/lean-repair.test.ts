import { describe, expect, it } from "vitest";
import { leanReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { SUBJECT_POLICY_V2, SUBJECT_READER_V2 } from "../../../domain/generation/subject-policy";
import { SUBJECT_QUALITY_BUNDLE_VERSION } from "../../../domain/generation/subject-quality-bundle";
import { CONTINUITY_READER_BOUNDED } from "../../../domain/scene/local-patch-body-continuity";
import { CURRENT_QUALITY_READER } from "../local-patch-dual-evidence";
import { localPatchHideEvidenceIds } from "../local-patch-judge";
import { DUAL_VISUAL_REVIEW_V3 } from "../visual-review-release";
import { leanSubjectOnlyRefusal } from "../lean-repair";
import { GOOD_V12_VERDICT, longAnswer } from "./local-patch-dual-fixtures";

/**
 * Which refusal of a lean world gets a third painting instead of a paid diagnosis (local-patch-lean/v1, Codex's P1 of
 * 19 October): only a definite refusal of who the child is, beside passing quality and continuity answers about the
 * same pixels. Every receipt here is built the way the dual review records it; no provider.
 */
const HIDE = "newyork-v12-1", SHA = "a".repeat(64), AGE = 8;
const observed = (status: string) => ({ status, observation: "A specific synthetic observation of the drawn child." });
const defect = { check: "photoLikeness", where: "Child by the stall: short straight hair, not the photograph's long fringe" };

function receipt(options: { quality?: Record<string, unknown>; photoLikeness?: string; faults?: unknown[]; collectionRefusal?: string;
  failedChecks?: unknown[]; continuity?: string | null; continuityFault?: string | null; subjectPolicy?: string; judgedSha256?: string } = {}) {
  const subject = { hideId: HIDE, subjectPolicy: SUBJECT_POLICY_V2, checks: { photoLikeness: observed(options.photoLikeness ?? "fail"), canonicalAgreement: observed("pass"),
    faceVisible: observed("pass"), perceivedAge: { ...observed("pass"), estimatedMinYears: 7, estimatedMaxYears: 9 }, requiredWardrobe: observed("not-required") },
    appearance: { head: "profile", expression: "focused", engagement: "acting", portraitCopy: false }, faults: options.faults ?? [defect] };
  const raw = JSON.stringify({ version: SUBJECT_QUALITY_BUNDLE_VERSION, quality: { hides: [{ hideId: HIDE, evidenceIds: localPatchHideEvidenceIds(HIDE),
    verdict: options.quality ?? GOOD_V12_VERDICT }] }, subject });
  const policy = leanReviewPolicy("scene-quality", "flex"), base = { requestKey: `self-repair:board:newyork:${"b".repeat(64)}`, fingerprint: "b".repeat(64),
    attempt: 1, policy, raw, model: "gpt-6.1-sol", finishReason: "stop", wireFault: null, costMicroUsd: 5_000 };
  const bundle = { version: SUBJECT_QUALITY_BUNDLE_VERSION, photoSha256: "c".repeat(64), planSha256: "d".repeat(64), subjectPolicy: SUBJECT_POLICY_V2 };
  const continuity = options.continuity === null ? null : { requestKey: `self-repair:board:newyork:${"e".repeat(64)}`, fingerprint: "e".repeat(64), attempt: 1,
    policy: leanReviewPolicy("head-continuity", "flex"), raw: options.continuity ?? longAnswer(HIDE, 400, 400, 160), model: "gpt-6.1-sol", finishReason: "stop",
    wireFault: options.continuityFault ?? null, costMicroUsd: 5_000, reader: CONTINUITY_READER_BOUNDED };
  return JSON.stringify({ hide: HIDE, reviewState: "board-review-complete", judgedSha256: options.judgedSha256 ?? SHA, boardReview: { dual: {
    version: DUAL_VISUAL_REVIEW_V3, hideId: HIDE, imageSha256: SHA, geometrySha256: "f".repeat(64), identitySha256: "f".repeat(64),
    quality: { ...base, reader: CURRENT_QUALITY_READER, subjectBundle: bundle }, continuity,
    subject: { ...base, subjectPolicy: options.subjectPolicy ?? SUBJECT_POLICY_V2, reader: SUBJECT_READER_V2, photoSha256: bundle.photoSha256,
      planSha256: bundle.planSha256, combined: SUBJECT_QUALITY_BUNDLE_VERSION, failedChecks: options.failedChecks ?? ["photoLikeness"],
      ...(options.collectionRefusal ? { collectionRefusal: options.collectionRefusal } : {}) } } } });
}

describe("a lean world's refusal of who the child is only", () => {
  it("is a definite subject refusal beside passing quality and continuity answers about the same pixels", () => {
    expect(leanSubjectOnlyRefusal(receipt(), AGE)).toBe(true);
    // The collection's variety, refusing a child who passed every check.
    expect(leanSubjectOnlyRefusal(receipt({ photoLikeness: "pass", faults: [], failedChecks: ["collectionVariety"],
      collectionRefusal: `${HIDE} repeats a look (profile, focused, acting) that 9 accepted appearances of this 27-hide world already show; at most 9 may share one look` }), AGE)).toBe(true);
  });

  it("is never a refusal its continuity answer did not pass: missing, broken or unreadable", () => {
    expect(leanSubjectOnlyRefusal(receipt({ continuity: null }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(receipt({ continuity: longAnswer(HIDE, 400, 400, 160, { state: "broken",
      faults: [{ kind: "hard-cut", where: "The vendor's neck stops at a straight vertical cut on the left join" }] }) }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(receipt({ continuityFault: "truncated" }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(receipt({ continuity: "not json" }), AGE)).toBe(false);
  });

  it("is never uncertainty, a quality defect, another picture, another policy or a pose code", () => {
    // The subject reviewer was unsure: not a definite refusal of who the child is.
    expect(leanSubjectOnlyRefusal(receipt({ photoLikeness: "unsure", faults: [] }), AGE)).toBe(false);
    // The quality answer itself refused the picture.
    expect(leanSubjectOnlyRefusal(receipt({ quality: { ...GOOD_V12_VERDICT, pictureWhole: "fail", verdict: "fail",
      faults: [{ check: "pictureWhole", where: "A penguin's body stops in a straight vertical cut at the left join" }] } }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(receipt({ judgedSha256: "9".repeat(64) }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(receipt({ subjectPolicy: "local-patch-subject/v1" }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(receipt({ failedChecks: ["plannedAction"] }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(receipt({ failedChecks: [] }), AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal("not json", AGE)).toBe(false);
    expect(leanSubjectOnlyRefusal(null, AGE)).toBe(false);
  });
});

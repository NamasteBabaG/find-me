import { describe, expect, it } from "vitest";
import { QA_SUNBURST_TAIL_COMPLETION_VERSION, qaSunburstTailCompletionId, qaSunburstTailOperationOf, qaSunburstTailPlanSchema,
  qaSunburstTailRequestKey, QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION } from "../qa-sunburst-tail-completion";
import { QA_FIVE_COMPLETION_CONFIRMATION, QA_FIVE_COMPLETION_VERSION, qaFiveCompletionId } from "../qa-five-dollar-completion";
import { JOURNEY_SUNBURST_TAIL_HIDE_IDS, JOURNEY_SUNBURST_TAIL_VERSION, type JourneySunburstTailHideId } from "../journey-sunburst-tail";

const sha = (c: string) => c.repeat(64);
const state = { gameId: "synthetic", worldId: "synthetic:board-wizard", ownerId: "owner", childId: "child", sceneVersion: 13,
  scenesSha256: sha("1"), familySha256: sha("2"), paymentSha256: sha("3"), reviewAuthoritySha256: sha("4"), enrollmentSha256: sha("5"),
  identityReviewSha256: sha("6"), identityAssetId: "identity", identitySha256: sha("7"), avatarAssetId: "avatar", photoAssetId: "photo",
  photoSha256: sha("8"), ageYears: 7, cropSha256: sha("9") };
const op = (hideId: JourneySunburstTailHideId, pose = "standing") => ({ kind: JOURNEY_SUNBURST_TAIL_VERSION, hideId, rowId: "row-" + hideId,
  requestKey: qaSunburstTailRequestKey(hideId, pose), previousJudgeSha256: sha("a"),
  imageReserveMicroUsd: 150_000, reviewCoverageMicroUsd: 250_000, requiredMicroUsd: 400_000 });
/** The measured new game: closed 3327349 + UNKNOWN 411231. */
/** Operations are deliberately untyped: refusal cases feed malformed ones to the schema. */
const plan = (over: Record<string, unknown> = {}, operations: readonly unknown[] = JOURNEY_SUNBURST_TAIL_HIDE_IDS.map(h => op(h))) => {
  const committed = (over.committedMicroUsd as number | undefined) ?? 3_738_580;
  return { version: QA_SUNBURST_TAIL_COMPLETION_VERSION, state, baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000,
    jobId: "job_synthetic", jobSha256: sha("b"), ledgerRevision: 41, ledgerSha256: sha("c"), rowsSha256: sha("d"),
    committedMicroUsd: committed, reservedMicroUsd: 411_231, remainingUnderBaseMicroUsd: 4_000_000 - committed,
    requiredMicroUsd: operations.length * 400_000, operations,
    originalRequests: [{ requestKey: "old", sha256: sha("e") }],
    unknowns: [{ requestKey: "unknown-review", operationFingerprint: sha("f"), reserveMicroUsd: 411_231 }], ...over };
};

describe("explicit-existing-qa-sunburst-tail-completion/v1 plan", () => {
  it("is a new receipt beside, never a reinterpretation of, the single-Paris five-dollar v1", () => {
    expect(QA_SUNBURST_TAIL_COMPLETION_VERSION).not.toBe(QA_FIVE_COMPLETION_VERSION);
    expect(QA_SUNBURST_TAIL_COMPLETION_CONFIRMATION).not.toBe(QA_FIVE_COMPLETION_CONFIRMATION);
    expect(qaSunburstTailCompletionId("g")).not.toBe(qaFiveCompletionId("g"));
  });
  it("freezes the measured game's three operations inside five dollars, UNKNOWN reserves included", () => {
    const parsed = qaSunburstTailPlanSchema.parse(plan());
    expect(parsed.requiredMicroUsd).toBe(1_200_000);
    expect(parsed.committedMicroUsd + parsed.requiredMicroUsd).toBe(4_938_580);
    expect(qaSunburstTailOperationOf({ plan: parsed }, "greatwall-detectives-hide-1")?.requestKey).toBe("greatwall-detectives-hide-1:standing:render:2");
    expect(qaSunburstTailOperationOf({ plan: parsed }, "newyork-detectives-hide-1")).toBeNull();
  });
  it("refuses a list that would pass five dollars by even one micro-dollar", () => {
    expect(qaSunburstTailPlanSchema.safeParse(plan({ committedMicroUsd: 3_800_000 })).success).toBe(true);
    expect(qaSunburstTailPlanSchema.safeParse(plan({ committedMicroUsd: 3_800_001 })).success).toBe(false);
  });
  it("forces no extension when the complete list fits the original four dollars", () => {
    expect(qaSunburstTailPlanSchema.safeParse(plan({ committedMicroUsd: 3_600_000 }, [op("amazon-detectives-hide-3")])).success).toBe(false);
    expect(qaSunburstTailPlanSchema.safeParse(plan({ committedMicroUsd: 3_600_001 }, [op("amazon-detectives-hide-3")])).success).toBe(true);
  });
  it("binds exact money, no other ceiling and no wrong reservation", () => {
    for (const bad of [{ capMicroUsd: 6_000_000 }, { baseCapMicroUsd: 5_000_000 }, { requiredMicroUsd: 1_199_999 }, { remainingUnderBaseMicroUsd: 1 },
      { committedMicroUsd: 4_000_001 }, { reservedMicroUsd: 400_000 }, { extra: true }])
      expect(qaSunburstTailPlanSchema.safeParse(plan(bad)).success, JSON.stringify(bad)).toBe(false);
    for (const field of [{ imageReserveMicroUsd: 149_999 }, { reviewCoverageMicroUsd: 200_000 }, { requiredMicroUsd: 350_000 }, { kind: "journey-source-head-sunburst/v1" }])
      expect(qaSunburstTailPlanSchema.safeParse(plan({}, [{ ...op("amazon-detectives-hide-3"), ...field }, op("paris-detectives-hide-1")])).success, JSON.stringify(field)).toBe(false);
  });
  it("names only the three appearances, each once, in fixed order, with its own second render", () => {
    expect(qaSunburstTailPlanSchema.safeParse(plan({}, [])).success).toBe(false);
    expect(qaSunburstTailPlanSchema.safeParse(plan({}, [op("paris-detectives-hide-1"), op("paris-detectives-hide-1")])).success).toBe(false);
    expect(qaSunburstTailPlanSchema.safeParse(plan({}, [op("paris-detectives-hide-1"), op("amazon-detectives-hide-3")])).success).toBe(false);
    expect(qaSunburstTailPlanSchema.safeParse(plan({}, [{ ...op("amazon-detectives-hide-3"), hideId: "newyork-detectives-hide-1" }])).success).toBe(false);
    expect(qaSunburstTailPlanSchema.safeParse(plan({}, [{ ...op("amazon-detectives-hide-3"), requestKey: "paris-detectives-hide-1:standing:render:2" }, op("paris-detectives-hide-1")])).success).toBe(false);
    expect(qaSunburstTailPlanSchema.safeParse(plan({}, [{ ...op("amazon-detectives-hide-3"), requestKey: "amazon-detectives-hide-3:standing:render:3" }, op("paris-detectives-hide-1")])).success).toBe(false);
    expect(qaSunburstTailPlanSchema.safeParse(plan({}, [op("amazon-detectives-hide-3", "sitting-cross-legged"), op("paris-detectives-hide-1")])).success).toBe(true);
  });
  it("keeps every UNKNOWN reserve whole inside what is reserved", () => {
    expect(qaSunburstTailPlanSchema.safeParse(plan({ unknowns: [{ requestKey: "u", operationFingerprint: sha("f"), reserveMicroUsd: 411_232 }] })).success).toBe(false);
  });
});

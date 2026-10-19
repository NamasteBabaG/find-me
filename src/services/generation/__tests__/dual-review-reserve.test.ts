import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { localPatchBoardsForVersion } from "../../../domain/scene/local-patch-catalog";
import { visualReviewCharge } from "../../../infra/generation/visual-review-pricing";
import { DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD, DUAL_REVIEW_RESERVES_MICRO_USD, DUAL_REVIEW_V3_RESERVE_MICRO_USD,
  dualQuestionReserveMicroUsd, dualReviewReserveMicroUsd, dualReviewReserves, type DualReviewRole } from "../../../domain/generation/dual-review-reserve";
import type { EvidenceStrategy } from "../../../domain/scene/local-patch-evidence-policy";
import { PLAYER_REVIEW_MODE } from "../local-patch-player-review";
import { prepareBoundaryComparisons, prepareJoinDetails } from "../local-patch-integration-evidence";
import { dualQualityQuestion, QUALITY_ANSWER_SHORT_WHEN_PASSING, runtimeContinuityQuestion } from "../local-patch-dual-review";
import type { LocalPatchBoardJudgeRequest } from "../local-patch-judge";
import { visualReviewMaxCharge, type PreparedVisualReview } from "../visual-review";
import { DUAL_VISUAL_REVIEW_V3, QUALITY_QUESTION_OBJECT_JOINS, QUALITY_QUESTION_OBJECT_JOINS_LEAN } from "../visual-review-release";
import { subjectPlansForBoard } from "../../../domain/generation/subject-policy";
import { combinedQualitySubjectQuestion, subjectQuestion } from "../local-patch-subject-review";
import type { SubjectUpgradeReceipt } from "../subject-enrollment";

const opus = visualReviewPolicy("scene-quality", "high"), sol = visualReviewPolicy("head-continuity", "high");
const micro = (charge: { costCents: number; costUnknown: boolean }) => { expect(charge.costUnknown).toBe(false); return Math.ceil(charge.costCents * 10_000); };
const blank = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "white" } }).png().toBuffer();

/**
 * Every image at the largest size any current appearance can produce, ordinary or
 * self-repaired: the board fitted inside 1536x1024; the portrait inside 512x512; a
 * 512x768 crop with 192 px of context on every side (896x1152); the closeup as the
 * whole crop; and a 420x420 return window, whose four joins span 500 px and are
 * magnified 3x, the largest a join detail can be (a longer span is magnified 2x).
 * Sizes that cannot all occur in one request are summed anyway. The words are the
 * longest any current board has: its hide id and support, age ten, 64-character
 * ids and attempt 99.
 */
const V12 = localPatchBoardsForVersion(12);
const longest = (values: string[]) => values.reduce((a, b) => (Buffer.byteLength(b) > Buffer.byteLength(a) ? b : a));
const HIDE_ID = longest(V12.flatMap(board => board.hides.map(hide => hide.id)));
const BOARD_ID = longest(V12.map(board => board.board));
const SUPPORT = longest(V12.flatMap(board => board.hides.map(hide => `${hide.pose} on ${board.ground}`)));
const BINDING = { version: DUAL_VISUAL_REVIEW_V3, gameId: "g".repeat(64), sceneId: "s".repeat(64), hideId: HIDE_ID, variantId: "v".repeat(64),
  imageSha256: "a".repeat(64), geometrySha256: "b".repeat(64), identitySha256: "c".repeat(64), attempts: 99 };
async function largestRequest(): Promise<LocalPatchBoardJudgeRequest> {
  const context = await blank(896, 1152), window = { left: 238, top: 366, width: 420, height: 420 };
  return { boardId: BOARD_ID, contentVersion: 12, assessmentMode: PLAYER_REVIEW_MODE, reviewScope: "ready-only/v1", qualityQuestion: QUALITY_QUESTION_OBJECT_JOINS,
    boardPng: await blank(1536, 1024), identityPng: await blank(512, 512),
    hides: [{ hideId: HIDE_ID, beforePng: context, afterPng: context, closeupPng: await blank(512, 768), afterEvidencePng: await blank(896 + 24 + 512, 1152),
      boundaryComparisons: await prepareBoundaryComparisons(context, context, window), returnedWindow: window,
      joinDetails: await prepareJoinDetails(context, context, window), expectation: { ageYears: 10, support: SUPPORT } }] };
}
const STRATEGIES: Record<DualReviewRole, EvidenceStrategy[]> = { quality: ["standard/v1", "strict-json/v1", "compact/v1"],
  continuity: ["standard/v1", "strict-json/v1", "compact/v1", "decide/v1"] };
async function largestQuestions(role: DualReviewRole): Promise<PreparedVisualReview[]> {
  const request = await largestRequest(), prepared = { request } as unknown as Parameters<typeof runtimeContinuityQuestion>[0];
  return Promise.all(STRATEGIES[role].map(strategy => role === "quality" ? dualQualityQuestion(request, BINDING, 99, strategy)
    : runtimeContinuityQuestion(prepared, BINDING, 99, DUAL_VISUAL_REVIEW_V3, strategy)));
}

describe("bounded dual review reservations", () => {
  it("admits complete quality and subject inspections at maximal sizes, splitting oversized bundles before purchase", async () => {
    const largest = await largestRequest(), photo = await blank(768, 768);
    const upgrade = { ageYears: 10, photoSha256: "d".repeat(64) } as SubjectUpgradeReceipt;
    let maximum = 0, maximumCase = "", bareMaximum = 0, split = 0;
    for (const board of V12) for (const plan of subjectPlansForBoard(board)) for (const strategy of STRATEGIES.quality) {
      const request = { ...largest, boardId: BOARD_ID, hides: [{ ...largest.hides[0]!, hideId: plan.hideId }] };
      const quality = dualQualityQuestion(request, { ...BINDING, hideId: plan.hideId }, 99, strategy);
      const combined = combinedQualitySubjectQuestion(quality, plan, photo, upgrade);
      const questions = combined ? [combined.question] : [quality, subjectQuestion({ request }, plan, photo,
        { ...BINDING, hideId: plan.hideId }, 99, "Return the complete exact subject JSON; never omit a failed check or its location to save space.", upgrade)];
      if (!combined) split++;
      for (const question of questions) {
      const most = visualReviewMaxCharge(question); if (!most.ok) throw Error(most.reason);
      const bare = visualReviewMaxCharge(quality);
      if (bare.ok) bareMaximum = Math.max(bareMaximum, bare.microUsd);
      if (most.microUsd > maximum) { maximum = most.microUsd; maximumCase = `${plan.hideId}, ${strategy}: ${most.inputTokens} input tokens`; }
      expect(most.outputTokens).toBe(6_500);
      expect(question.policy.model).toBe("claude-opus-5-5");
      if (combined || question !== quality) expect(question.labels.join("\n")).toContain(`EVIDENCE_ID=${plan.hideId}:closeup`);
      }
    }
    console.info(JSON.stringify({ admittedMaximumMicroUsd: maximum, bareMaximumMicroUsd: bareMaximum, maximumCase, splitCases: split, cases: V12.length * 3 * STRATEGIES.quality.length }));
    expect(maximum, maximumCase).toBeLessThanOrEqual(DUAL_REVIEW_V3_RESERVE_MICRO_USD.quality);
    expect(maximum).toBeGreaterThan(0);
    expect(split).toBeGreaterThan(0);
    const small = await blank(128, 128), plan = subjectPlansForBoard(V12[0]!)[0]!;
    const quality = dualQualityQuestion({ ...largest, boardId: V12[0]!.board, hides: [{ ...largest.hides[0]!, hideId: plan.hideId }],
      boardPng: small, identityPng: small }, { ...BINDING, hideId: plan.hideId }, 1, "standard/v1");
    expect(combinedQualitySubjectQuestion(quality, plan, small, upgrade)).not.toBeNull();
  });
  it("admit the largest request any current appearance can produce, in every evidence variant", async () => {
    for (const role of ["quality", "continuity"] as const) for (const question of await largestQuestions(role)) {
      // The maximal joins really are magnified 3x, at their largest.
      if (role === "quality") expect(question.images.slice(-4).map(png => png.readUInt32BE(16) * png.readUInt32BE(20)).every(area => area === 496 * 1528)).toBe(true);
      const most = visualReviewMaxCharge(question);
      expect(most.ok).toBe(true);
      if (!most.ok) continue;
      expect(most.outputTokens).toBe(role === "quality" ? 6_500 : 4_096);
      expect(most.microUsd).toBeLessThanOrEqual(DUAL_REVIEW_V3_RESERVE_MICRO_USD[role]);
    }
  });

  it("admit cost experiment E1's Sol quality variants at their largest, full, short or lean, under the same quality reservation", async () => {
    const request = await largestRequest(), lean = { ...request, qualityQuestion: QUALITY_QUESTION_OBJECT_JOINS_LEAN };
    for (const [asked, answer] of [[request, undefined], [request, QUALITY_ANSWER_SHORT_WHEN_PASSING], [lean, QUALITY_ANSWER_SHORT_WHEN_PASSING]] as const)
      for (const strategy of STRATEGIES.quality) {
        const question = dualQualityQuestion(asked, BINDING, 99, strategy, { judge: "gpt-6.1-sol", effort: "medium", ...(answer ? { answer } : {}) });
        expect(question.policy.model).toBe("gpt-6.1-sol");
        const most = visualReviewMaxCharge(question);
        expect(most.ok && most.outputTokens === 6_500 && most.microUsd <= DUAL_REVIEW_V3_RESERVE_MICRO_USD.quality).toBe(true);
      }
  });

  it("price the most a question can be billed at or above every bill the rate card accepts within its bounds", async () => {
    const [quality] = await largestQuestions("quality"), [continuity] = await largestQuestions("continuity");
    const q = visualReviewMaxCharge(quality!), c = visualReviewMaxCharge(continuity!);
    if (!q.ok || !c.ok) throw Error("The largest questions must be bounded");
    // Opus: cache reads are cheaper than ordinary input, and no cache is written without a breakpoint.
    for (const usage of [{ input_tokens: q.inputTokens, output_tokens: q.outputTokens },
      { input_tokens: q.inputTokens - 1_000, cache_read_input_tokens: 1_000, output_tokens: q.outputTokens }])
      expect(micro(visualReviewCharge(opus, opus.model, usage))).toBeLessThanOrEqual(q.microUsd);
    // Sol: ordinary input is never priced above 2.5 per million micro-cents, cached or written.
    for (const usage of [{ prompt_tokens: c.inputTokens, completion_tokens: c.outputTokens },
      { prompt_tokens: c.inputTokens, completion_tokens: c.outputTokens, prompt_tokens_details: { cached_tokens: 2_000 } },
      { prompt_tokens: c.inputTokens, completion_tokens: c.outputTokens, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: c.inputTokens } }])
      expect(micro(visualReviewCharge(sol, sol.model, usage))).toBeLessThanOrEqual(c.microUsd);
    // One more input token than the bound, at the full output cap, is billed above it.
    expect(micro(visualReviewCharge(sol, sol.model, { prompt_tokens: c.inputTokens + 1, completion_tokens: c.outputTokens }))).toBeGreaterThan(c.microUsd);
  });

  it("keep the reservation already in the ledger for a request key, whatever the release", () => {
    // A v3 question reserved before these bounds keeps 300,000: the ledger and replay compare it.
    expect(dualQuestionReserveMicroUsd(300_000, true, "quality")).toBe(300_000);
    expect(dualQuestionReserveMicroUsd(250_000, true, "quality")).toBe(250_000);
    expect(dualQuestionReserveMicroUsd(undefined, true, "continuity")).toBe(66_000);
    expect(dualQuestionReserveMicroUsd(undefined, false, "continuity")).toBe(300_000);
  });

  it("apply only to the bounded release; v1/v2 keep the flat amount", () => {
    for (const role of ["quality", "continuity"] as const) {
      expect(dualReviewReserveMicroUsd(false, role)).toBe(DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD);
      expect(dualReviewReserveMicroUsd(true, role)).toBe(DUAL_REVIEW_V3_RESERVE_MICRO_USD[role]);
    }
  });

  it("fit the 0.289913 USD the first full v19/v3 world parked with one at a time, not both at their maximum", () => {
    const remaining = 289_913, { quality, continuity } = DUAL_REVIEW_V3_RESERVE_MICRO_USD;
    expect(DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD).toBeGreaterThan(remaining);
    expect(quality).toBeLessThanOrEqual(remaining);
    // After an Opus answer billed like that world's most expensive (0.129828 USD), Sol still fits;
    expect(continuity).toBeLessThanOrEqual(remaining - 129_828);
    // after one billed at its whole reservation, it does not.
    expect(quality + continuity).toBeGreaterThan(remaining);
  });

  it("list every amount an interrupted question may carry into recovery, per role and overall", () => {
    // A lean world's amounts (local-patch-lean/v1) join each role's set, so its lost creates are recovered too.
    expect(dualReviewReserves("quality")).toEqual([300_000, 250_000, 200_000]);
    expect(dualReviewReserves("continuity")).toEqual([300_000, 66_000, 120_000]);
    expect(DUAL_REVIEW_RESERVES_MICRO_USD).toEqual([300_000, 250_000, 200_000, 66_000, 120_000]);
  });
});

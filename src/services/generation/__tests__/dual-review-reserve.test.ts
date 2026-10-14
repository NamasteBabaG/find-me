import { describe, expect, it } from "vitest";
import { visualReviewPolicy } from "../../../domain/generation/visual-review-policy";
import { visualReviewCharge } from "../../../infra/generation/visual-review-pricing";
import { DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD, DUAL_REVIEW_RESERVES_MICRO_USD, DUAL_REVIEW_V3_INPUT_TOKEN_BOUND,
  DUAL_REVIEW_V3_RESERVE_MICRO_USD, dualQuestionReserveMicroUsd, dualReviewReserveMicroUsd, dualReviewReserves } from "../../../domain/generation/dual-review-reserve";

const opus = visualReviewPolicy("scene-quality", "high"), sol = visualReviewPolicy("head-continuity", "high");
const micro = (charge: { costCents: number; costUnknown: boolean }) => { expect(charge.costUnknown).toBe(false); return Math.ceil(charge.costCents * 10_000); };

describe("bounded dual review reservations", () => {
  it("cover the rate card's charge for a question at its input ceiling and the full output cap its request sends", () => {
    // The caps the requests send (Opus max_tokens with thinking; Sol max_completion_tokens with reasoning).
    expect([opus.maxOutputTokens, sol.maxOutputTokens]).toEqual([6_500, 4_096]);
    const worst = {
      quality: micro(visualReviewCharge(opus, opus.model, { input_tokens: DUAL_REVIEW_V3_INPUT_TOKEN_BOUND.quality, output_tokens: opus.maxOutputTokens })),
      continuity: micro(visualReviewCharge(sol, sol.model, { prompt_tokens: DUAL_REVIEW_V3_INPUT_TOKEN_BOUND.continuity, completion_tokens: sol.maxOutputTokens })),
    };
    expect(worst).toEqual({ quality: 250_000, continuity: 65_960 });
    for (const role of ["quality", "continuity"] as const) {
      expect(DUAL_REVIEW_V3_RESERVE_MICRO_USD[role]).toBeGreaterThanOrEqual(worst[role]);
      expect(DUAL_REVIEW_V3_RESERVE_MICRO_USD[role]).toBeLessThan(DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD);
    }
  });

  it("keep each input ceiling at least 1.5 times the largest input of the first full v19/v3 world", () => {
    // 14 October QA world: 30 Opus questions 15,181-17,842 input tokens; 31 Sol questions 4,028-4,687.
    expect(DUAL_REVIEW_V3_INPUT_TOKEN_BOUND.quality).toBeGreaterThanOrEqual(1.5 * 17_842);
    expect(DUAL_REVIEW_V3_INPUT_TOKEN_BOUND.continuity).toBeGreaterThanOrEqual(1.5 * 4_687);
  });

  it("let both last questions of that world fit the 0.289913 USD it parked with, where the flat amount did not", () => {
    const remaining = 289_913;
    expect(DUAL_REVIEW_LEGACY_RESERVE_MICRO_USD).toBeGreaterThan(remaining);
    expect(DUAL_REVIEW_V3_RESERVE_MICRO_USD.quality).toBeLessThanOrEqual(remaining);
    // After the quality answer settles at its observed maximum (0.129828 USD), the anatomy question still fits.
    expect(DUAL_REVIEW_V3_RESERVE_MICRO_USD.continuity).toBeLessThanOrEqual(remaining - 129_828);
  });

  it("apply only to the bounded release; v1/v2 keep the flat amount", () => {
    for (const role of ["quality", "continuity"] as const) {
      expect(dualReviewReserveMicroUsd(false, role)).toBe(300_000);
      expect(dualReviewReserveMicroUsd(true, role)).toBe(DUAL_REVIEW_V3_RESERVE_MICRO_USD[role]);
    }
  });

  it("keep the reservation already in the ledger for a request key, whatever the release", () => {
    // A v3 question reserved before these bounds keeps 300,000: the ledger and replay compare it.
    expect(dualQuestionReserveMicroUsd(300_000, true, "quality")).toBe(300_000);
    expect(dualQuestionReserveMicroUsd(250_000, true, "quality")).toBe(250_000);
    expect(dualQuestionReserveMicroUsd(undefined, true, "continuity")).toBe(66_000);
    expect(dualQuestionReserveMicroUsd(undefined, false, "continuity")).toBe(300_000);
  });

  it("list every amount an interrupted question may carry into recovery, per role and overall", () => {
    expect(dualReviewReserves("quality")).toEqual([300_000, 250_000]);
    expect(dualReviewReserves("continuity")).toEqual([300_000, 66_000]);
    expect(DUAL_REVIEW_RESERVES_MICRO_USD).toEqual([300_000, 250_000, 66_000]);
  });
});

import { describe, expect, it } from "vitest";
import {
  BACKGROUND_CANCEL_AFTER_MS, BACKGROUND_CREATE_GRACE_MS, BACKGROUND_REVIEW_ROUND_VERSION, backgroundRoundOf, nextBackgroundStep,
  type BackgroundReviewEvent,
} from "../background-review-round";

const intent: BackgroundReviewEvent = { kind: "intent", intent: { version: BACKGROUND_REVIEW_ROUND_VERSION, roundId: "sbsynthetic", gameId: "game-synthetic",
  worldId: "game-synthetic:board-wizard", requestKey: `self-repair:board:newyork:${"a".repeat(64)}`, fingerprint: "a".repeat(64), bodySha256: "b".repeat(64),
  reserveMicroUsd: 66_000, binding: { hideId: "newyork-v12-1", variantId: "tva-synthetic", imageSha256: "c".repeat(64), geometrySha256: "d".repeat(64), identitySha256: "e".repeat(64) } } };
const T = 1_800_000_000_000;

describe("one background question, one create, polled by its id", () => {
  it("creates once, then only polls the known response, and cancels once past its deadline", () => {
    expect(nextBackgroundStep(backgroundRoundOf([intent]), T)).toEqual({ step: "create" });
    const submitted = backgroundRoundOf([intent, { kind: "claim", at: T }, { kind: "submitted", responseId: "resp_one", at: T }]);
    expect(nextBackgroundStep(submitted, T + 60_000)).toEqual({ step: "poll", responseId: "resp_one", cancelDue: false });
    expect(nextBackgroundStep(submitted, T + BACKGROUND_CANCEL_AFTER_MS)).toEqual({ step: "poll", responseId: "resp_one", cancelDue: true });
    const cancelled = backgroundRoundOf([intent, { kind: "claim", at: T }, { kind: "submitted", responseId: "resp_one", at: T }, { kind: "cancel", at: T + BACKGROUND_CANCEL_AFTER_MS }]);
    expect(nextBackgroundStep(cancelled, T + 2 * BACKGROUND_CANCEL_AFTER_MS)).toEqual({ step: "poll", responseId: "resp_one", cancelDue: false });
  });
  it("waits for a claimed create within its grace, then records it lost; never a second create", () => {
    const claimed = backgroundRoundOf([intent, { kind: "claim", at: T }]);
    expect(nextBackgroundStep(claimed, T + 1_000)).toMatchObject({ step: "wait" });
    expect(nextBackgroundStep(claimed, T + BACKGROUND_CREATE_GRACE_MS)).toEqual({ step: "lost" });
    expect(nextBackgroundStep(backgroundRoundOf([intent, { kind: "claim", at: T }, { kind: "lost", reason: "no answer", at: T + 1 }]), T + 9e9)).toEqual({ step: "done" });
  });
  it("refuses a record that contradicts its own rules instead of repairing it", () => {
    expect(() => backgroundRoundOf([{ kind: "claim", at: T }])).toThrow();
    expect(() => backgroundRoundOf([intent, { kind: "submitted", responseId: "resp_one", at: T }])).toThrow();
    expect(() => backgroundRoundOf([intent, { kind: "claim", at: T }, { kind: "submitted", responseId: "resp_one", at: T },
      { kind: "outcome", state: "answered", responseId: "resp_two", providerStatus: "completed", at: T }])).toThrow();
    expect(() => backgroundRoundOf([intent, { kind: "claim", at: T }, { kind: "submitted", responseId: "resp_one", at: T },
      { kind: "lost", reason: "late", at: T }])).toThrow();
    expect(() => backgroundRoundOf([intent, { kind: "claim", at: T }, { kind: "claim", at: T + 1 }])).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  QUALITY_BATCH_CREATE_GRACE_MS, QUALITY_BATCH_REFUSAL_BACKOFF_MS, QUALITY_BATCH_VERSION, decideQualityBatchResults, nextQualityBatchStep,
  qualityBatchCleanupDue, qualityBatchEventName, qualityBatchReserveMicroUsd, qualityBatchRoundOf, type QualityBatchEvent, type QualityBatchIntent,
} from "../generation/quality-batch-round";

const T0 = Date.parse("2026-10-16T08:00:00.000Z"), HOUR = 60 * 60_000;
const intent: QualityBatchIntent = { version: QUALITY_BATCH_VERSION, roundId: "qb" + "a".repeat(30), gameId: "game-synthetic", worldId: "game-synthetic:board-wizard",
  sceneId: "scene", board: "giza", hideId: "giza-v12-1", variantId: "row", imageSha256: "b".repeat(64), syncKey: `self-repair:board:giza:${"c".repeat(64)}`,
  batchKey: `self-repair:batch:giza:${"c".repeat(64)}`, customId: "q" + "d".repeat(40), fingerprint: "c".repeat(64), model: "claude-opus-5-5",
  syncReserveMicroUsd: 250_000, batchReserveMicroUsd: 125_000, paramsSha256: "e".repeat(64), intentAt: T0, deadlineAt: T0 + 6 * HOUR };
const round = (...events: QualityBatchEvent[]) => qualityBatchRoundOf([{ kind: "intent", intent }, ...events]);
const step = (at: number, ...events: QualityBatchEvent[]) => nextQualityBatchStep(round(...events), at);

describe("a quality question's batch round, pure", () => {
  it("creates the first batch, then waits out a create that did not answer before any search", () => {
    expect(step(T0)).toEqual({ step: "create", claim: 1 });
    const claimed: QualityBatchEvent = { kind: "claim", n: 1, at: T0 };
    expect(step(T0 + QUALITY_BATCH_CREATE_GRACE_MS - 1, claimed)).toMatchObject({ step: "wait" });
    expect(step(T0 + QUALITY_BATCH_CREATE_GRACE_MS, claimed)).toEqual({ step: "find", sinceMs: T0, nextClaim: 2 });
  });

  it("polls a recorded batch and cancels it only from its deadline", () => {
    const events: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 + 1 }];
    expect(step(T0 + 6 * HOUR - 1, ...events)).toEqual({ step: "poll", batchId: "msgbatch_1", cancelDue: false });
    expect(step(T0 + 6 * HOUR, ...events)).toEqual({ step: "poll", batchId: "msgbatch_1", cancelDue: true });
  });

  it("retries a rate-limited create after its backoff, and falls back unsent only when nothing ever reached the provider", () => {
    const refused = (n: number, at: number): QualityBatchEvent[] => [{ kind: "claim", n, at }, { kind: "refused", n, at, status: 429, errorType: "rate_limit_error", transient: true }];
    expect(step(T0 + QUALITY_BATCH_REFUSAL_BACKOFF_MS - 1, ...refused(1, T0))).toMatchObject({ step: "wait" });
    expect(step(T0 + QUALITY_BATCH_REFUSAL_BACKOFF_MS, ...refused(1, T0))).toEqual({ step: "create", claim: 2 });
    expect(step(T0 + 6 * HOUR, ...refused(1, T0), ...refused(2, T0 + HOUR))).toMatchObject({ step: "fallback-unsent" });
    // One create whose answer was lost may have reached the provider: never an unsent fallback.
    const lost: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "claim", n: 2, at: T0 + HOUR }, { kind: "refused", n: 2, at: T0 + HOUR, status: 429, errorType: "rate_limit_error", transient: true }];
    expect(step(T0 + 7 * HOUR, ...lost)).toEqual({ step: "create", claim: 3 });
  });

  it("holds a create refused for good", () => {
    expect(step(T0 + 1, { kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: "invalid_request_error", transient: false }))
      .toMatchObject({ step: "hold", reason: expect.stringContaining("400 invalid_request_error") });
  });

  it("is done once a terminal outcome is recorded", () => {
    const answered: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 },
      { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 9000, servedTier: "batch", at: T0 + HOUR }];
    expect(step(T0 + 9 * HOUR, ...answered)).toMatchObject({ step: "done", terminal: { kind: "answered" } });
  });

  it.each<[string, QualityBatchEvent[]]>([
    ["a claim with a gap", [{ kind: "claim", n: 2, at: T0 }]],
    ["an outcome of a claim never made", [{ kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }]],
    ["two recorded batches", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_2", at: T0 }]],
    ["a create both refused and recorded", [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 429, errorType: null, transient: true }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }]],
    ["a claim after the recorded batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "claim", n: 2, at: T0 }]],
    ["an answer from an unrecorded batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "answered", batchId: "msgbatch_9", amountMicroUsd: 1, servedTier: "batch", at: T0 }]],
    ["an unsent fallback after a recorded batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }]],
    ["two terminal outcomes", [{ kind: "held", reason: "x", at: T0 }, { kind: "held", reason: "y", at: T0 }]],
    ["a deletion of another batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 },
      { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 1, servedTier: "batch", at: T0 }, { kind: "deleted", batchIds: ["msgbatch_9"], at: T0 }]],
    ["a deletion of part of a hold's batches", [{ kind: "claim", n: 1, at: T0 }, { kind: "held", reason: "x", at: T0, batchIds: ["msgbatch_1", "msgbatch_2"] },
      { kind: "deleted", batchIds: ["msgbatch_1"], at: T0 }]],
    ["a deletion when nothing reached the provider", [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: null, transient: false },
      { kind: "held", reason: "x", at: T0 }, { kind: "deleted", batchIds: [], at: T0 }]],
    ["a hold naming one batch twice", [{ kind: "claim", n: 1, at: T0 }, { kind: "held", reason: "x", at: T0, batchIds: ["msgbatch_1", "msgbatch_1"] }]],
  ])("refuses an impossible record: %s", (_name, events) => {
    expect(() => round(...events)).toThrow("QUALITY_BATCH");
  });

  it("knows every batch it proved, and deletes them once finished: a held round's only for a deleted game", () => {
    const recorded: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }];
    const answered = round(...recorded, { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 9000, servedTier: "batch", at: T0 });
    expect(answered.batchIds).toEqual(["msgbatch_1"]);
    expect([qualityBatchCleanupDue(answered, false), qualityBatchCleanupDue(answered, true)]).toEqual([true, true]);
    const held = round(...recorded, { kind: "held", reason: "unpriced", at: T0 });
    expect([qualityBatchCleanupDue(held, false), qualityBatchCleanupDue(held, true)]).toEqual([false, true]);
    // Two batches found carrying the question, neither ever recorded: the hold names both.
    const found = round({ kind: "claim", n: 1, at: T0 }, { kind: "held", reason: "two", at: T0, batchIds: ["msgbatch_1", "msgbatch_2"] });
    expect(found.batchIds).toEqual(["msgbatch_1", "msgbatch_2"]);
    expect(qualityBatchCleanupDue(found, true)).toBe(true);
    expect(round({ kind: "claim", n: 1, at: T0 }, { kind: "held", reason: "two", at: T0, batchIds: ["msgbatch_2", "msgbatch_1"] },
      { kind: "deleted", batchIds: ["msgbatch_1", "msgbatch_2"], at: T0 }).deleted).toBe(true);
    // Nothing reached the provider; everything is already deleted; the round is still open.
    expect(qualityBatchCleanupDue(round({ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: null, transient: false },
      { kind: "held", reason: "refused", at: T0 }), true)).toBe(false);
    expect(qualityBatchCleanupDue(round(...recorded, { kind: "held", reason: "x", at: T0 }, { kind: "deleted", batchIds: ["msgbatch_1"], at: T0 }), true)).toBe(false);
    expect(qualityBatchCleanupDue(round(...recorded), true)).toBe(false);
  });

  it("reserves half of the synchronous reservation, rounded up", () => {
    expect([250_000, 66_000, 1, 3].map(qualityBatchReserveMicroUsd)).toEqual([125_000, 33_000, 1, 2]);
  });

  it("names each event so a second writer of it is refused by the store", () => {
    expect(qualityBatchEventName({ kind: "claim", n: 3, at: T0 })).toBe("claim-3");
    expect(qualityBatchEventName({ kind: "refused", n: 3, at: T0, status: 429, errorType: null, transient: true })).toBe("refused-3");
    // Answered, fallback and held share one name: only one can ever be written.
    expect(new Set([qualityBatchEventName({ kind: "answered", batchId: "b", amountMicroUsd: 1, servedTier: "batch", at: T0 }),
      qualityBatchEventName({ kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }),
      qualityBatchEventName({ kind: "held", reason: "x", at: T0 })])).toEqual(new Set(["terminal"]));
  });

  it("asks again only after a result documented as unbilled, and never after an invalid question", () => {
    const id = intent.customId, other = "q" + "f".repeat(40);
    expect(decideQualityBatchResults([{ customId: id, type: "succeeded" }], id)).toEqual({ decision: "answer" });
    for (const type of ["canceled", "expired"]) expect(decideQualityBatchResults([{ customId: id, type }], id)).toMatchObject({ decision: "unbilled-fallback", resultType: type });
    expect(decideQualityBatchResults([{ customId: id, type: "errored", errorType: "api_error" }], id)).toMatchObject({ decision: "unbilled-fallback", errorType: "api_error" });
    expect(decideQualityBatchResults([{ customId: id, type: "errored", errorType: "invalid_request_error" }], id)).toMatchObject({ decision: "unbilled-held" });
    expect(decideQualityBatchResults([{ customId: other, type: "succeeded" }], id)).toMatchObject({ decision: "held", reason: expect.stringContaining("without a result") });
    expect(decideQualityBatchResults([{ customId: id, type: "succeeded" }, { customId: id, type: "succeeded" }], id)).toMatchObject({ decision: "held" });
    expect(decideQualityBatchResults([{ customId: id, type: "unrecognized" }], id)).toMatchObject({ decision: "held" });
  });
});

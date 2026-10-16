import { describe, expect, it } from "vitest";
import {
  QUALITY_BATCH_CREATE_GRACE_MS, QUALITY_BATCH_LATE_SEARCH_MS, QUALITY_BATCH_REFUSAL_BACKOFF_MS, QUALITY_BATCH_VERSION, decideQualityBatchResults, nextQualityBatchStep,
  qualityBatchCleanupDue, qualityBatchDeletable, qualityBatchEventName, qualityBatchLateDue, qualityBatchReserveMicroUsd, qualityBatchRoundOf, qualityBatchSearching,
  type QualityBatchEvent, type QualityBatchIntent,
} from "../generation/quality-batch-round";

const T0 = Date.parse("2026-10-16T08:00:00.000Z"), HOUR = 60 * 60_000;
const intent: QualityBatchIntent = { version: QUALITY_BATCH_VERSION, roundId: "qb" + "a".repeat(30), gameId: "game-synthetic", worldId: "game-synthetic:board-wizard",
  sceneId: "scene", board: "giza", hideId: "giza-v12-1", variantId: "row", imageSha256: "b".repeat(64), syncKey: `self-repair:board:giza:${"c".repeat(64)}`,
  batchKey: `self-repair:batch:giza:${"c".repeat(64)}`, customId: "q" + "d".repeat(40), fingerprint: "c".repeat(64), model: "claude-opus-5-5",
  syncReserveMicroUsd: 250_000, batchReserveMicroUsd: 125_000, paramsSha256: "e".repeat(64), intentAt: T0, deadlineAt: T0 + 6 * HOUR };
const round = (...events: QualityBatchEvent[]) => qualityBatchRoundOf([{ kind: "intent", intent }, ...events]);
const step = (at: number, ...events: QualityBatchEvent[]) => nextQualityBatchStep(round(...events), at);
/** A round whose create did not answer and that no complete search found: presumed lost, and fallen back. */
const PRESUMED_AT = T0 + QUALITY_BATCH_CREATE_GRACE_MS;
const presumedLost: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "presumed", n: 1, at: PRESUMED_AT },
  { kind: "fallback", batchId: null, resultType: "presumed-lost", errorType: null, at: PRESUMED_AT }];
const foundLate: QualityBatchEvent = { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: true, at: PRESUMED_AT + QUALITY_BATCH_LATE_SEARCH_MS };

describe("a quality question's batch round, pure", () => {
  it("creates the first batch, then waits out a create that did not answer before any search", () => {
    expect(step(T0)).toEqual({ step: "create", claim: 1 });
    const claimed: QualityBatchEvent = { kind: "claim", n: 1, at: T0 };
    expect(step(T0 + QUALITY_BATCH_CREATE_GRACE_MS - 1, claimed)).toMatchObject({ step: "wait" });
    expect(step(T0 + QUALITY_BATCH_CREATE_GRACE_MS, claimed)).toEqual({ step: "find", sinceMs: T0 });
  });

  it("never sends again after a create that may have reached the provider: the batch is found, or the create is presumed lost", () => {
    const claimed: QualityBatchEvent = { kind: "claim", n: 1, at: T0 };
    // A search found nothing: presumed lost, which settles at the most and falls back; there is no step that creates.
    const presumed: QualityBatchEvent = { kind: "presumed", n: 1, at: T0 + QUALITY_BATCH_CREATE_GRACE_MS };
    expect(step(T0 + 9 * HOUR, claimed, presumed)).toMatchObject({ step: "presumed" });
    const fellBack = round(claimed, presumed, { kind: "fallback", batchId: null, resultType: "presumed-lost", errorType: null, at: T0 });
    expect(fellBack.terminal).toMatchObject({ kind: "fallback", resultType: "presumed-lost" });
    // A copy that turns up later is kept, and read for its bill before it may be deleted: the presumption may not cover it.
    const late = round(...presumedLost, foundLate);
    expect([late.batchIds, qualityBatchLateDue(late), qualityBatchCleanupDue(late, false), qualityBatchCleanupDue(late, true)]).toEqual([["msgbatch_1"], ["msgbatch_1"], false, false]);
    const read = round(...presumedLost, foundLate, { kind: "late", n: 1, batchId: "msgbatch_1", amountMicroUsd: 9000, at: T0 });
    expect([read.lateIds, qualityBatchLateDue(read), qualityBatchDeletable(read, false)]).toEqual([["msgbatch_1"], [], ["msgbatch_1"]]);
    // The presumption and a recorded batch share one name: a round has one or the other.
    expect(qualityBatchEventName(presumed)).toBe(qualityBatchEventName({ kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }));
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
      { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 1, servedTier: "batch", at: T0 }, { kind: "deleted", n: 1, batchIds: ["msgbatch_9"], at: T0 }]],
    ["a deletion with nothing in it", [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: null, transient: false },
      { kind: "held", reason: "x", at: T0 }, { kind: "deleted", n: 1, batchIds: [], at: T0 }]],
    ["deletions with a gap", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 },
      { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 1, servedTier: "batch", at: T0 }, { kind: "deleted", n: 2, batchIds: ["msgbatch_1"], at: T0 }]],
    ["a search naming one batch twice", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1", "msgbatch_1"], complete: true, at: T0 }]],
    ["searches with a gap", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 2, batchIds: ["msgbatch_1"], complete: true, at: T0 }]],
    ["two copies found and then never created", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], complete: true, at: T0 },
      { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }]],
    ["a claim after a create that may have reached the provider", [{ kind: "claim", n: 1, at: T0 }, { kind: "claim", n: 2, at: T0 }]],
    ["a presumption beside a recorded batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "presumed", n: 1, at: T0 }]],
    ["a presumed fallback without the presumption", [{ kind: "claim", n: 1, at: T0 }, { kind: "fallback", batchId: null, resultType: "presumed-lost", errorType: null, at: T0 }]],
    ["a presumption that falls back as never created", [{ kind: "claim", n: 1, at: T0 }, { kind: "presumed", n: 1, at: T0 },
      { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }]],
    ["a presumption under a refused create", [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 429, errorType: null, transient: true }, { kind: "presumed", n: 1, at: T0 }]],
    ["a closing claim that is not the last", [{ kind: "claim", n: 1, at: T0, closing: true }, { kind: "claim", n: 2, at: T0 }]],
    ["a create sent under a closing claim", [{ kind: "claim", n: 1, at: T0, closing: true }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }]],
    ["a closed round held", [{ kind: "claim", n: 1, at: T0, closing: true }, { kind: "held", reason: "x", at: T0 }]],
    ["a round closed after it found a copy", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: false, at: T0 },
      { kind: "claim", n: 2, at: T0, closing: true }]],
    ["a round falling back unsent after it found a copy", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: true, at: T0 },
      { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }]],
    // (Its batch was found by a search, so only the round's outcome refuses the bill.)
    ["a late bill for a round not presumed lost", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: true, at: T0 },
      { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 1, servedTier: "batch", at: T0 },
      { kind: "late", n: 1, batchId: "msgbatch_1", amountMicroUsd: 1, at: T0 }]],
    ["a late bill of a copy never found", [...presumedLost, { kind: "late", n: 1, batchId: "msgbatch_1", amountMicroUsd: 0, at: T0 }]],
    ["a late copy read twice", [...presumedLost, foundLate, { kind: "late", n: 1, batchId: "msgbatch_1", amountMicroUsd: 0, at: T0 },
      { kind: "late", n: 2, batchId: "msgbatch_1", amountMicroUsd: 0, at: T0 }]],
    ["a late bill that is no amount", [...presumedLost, foundLate, { kind: "late", n: 1, batchId: "msgbatch_1", amountMicroUsd: -1, at: T0 }]],
    ["a late copy deleted before its bill was read", [...presumedLost, foundLate, { kind: "deleted", n: 1, batchIds: ["msgbatch_1"], at: T0 }]],
  ])("refuses an impossible record: %s", (_name, events) => {
    expect(() => round(...events)).toThrow("QUALITY_BATCH");
  });

  it("keeps every batch a search proved for good: two copies hold the round, whatever a later search sees", () => {
    const claimed: QualityBatchEvent = { kind: "claim", n: 1, at: T0 }, later = T0 + QUALITY_BATCH_CREATE_GRACE_MS;
    const one: QualityBatchEvent = { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: false, at: later };
    // One copy proven while another might still run: the round keeps searching.
    expect(round(claimed, one)).toMatchObject({ found: ["msgbatch_1"], searches: 1, searchComplete: false });
    expect(step(later, claimed, one)).toEqual({ step: "find", sinceMs: T0 });
    // A second copy found later, even with nothing new after it: held, and the hold cannot be undone.
    const two: QualityBatchEvent = { kind: "found", n: 2, batchIds: ["msgbatch_2"], complete: false, at: later };
    expect(step(later, claimed, one, two)).toEqual({ step: "duplicates", reason: "2 batches carry this one question" });
    const empty: QualityBatchEvent = { kind: "found", n: 3, batchIds: [], complete: true, at: later };
    expect(step(later, claimed, one, two, empty)).toMatchObject({ step: "duplicates" });
    expect(round(claimed, one, two, empty)).toMatchObject({ found: ["msgbatch_1", "msgbatch_2"], searches: 3, searchComplete: true });
    // Copies found beside a presumption, once it is decided, are not a hold: it settles, and each copy is read for its bill.
    expect(step(later, claimed, one, two, { kind: "presumed", n: 1, at: later })).toMatchObject({ step: "presumed" });
  });

  it("closes a round unsent by taking the claim a create would take, and finishes a close it already took", () => {
    const refused = (n: number): QualityBatchEvent[] => [{ kind: "claim", n, at: T0 }, { kind: "refused", n, at: T0, status: 429, errorType: "rate_limit_error", transient: true }];
    expect(step(T0 + 6 * HOUR, ...refused(1))).toEqual({ step: "fallback-unsent", claim: 2, reason: expect.stringContaining("no batch was ever created") });
    expect(step(T0, { kind: "claim", n: 1, at: T0, closing: true })).toEqual({ step: "fallback-unsent", claim: null, reason: expect.stringContaining("being closed") });
    expect(round({ kind: "claim", n: 1, at: T0, closing: true }, { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }).terminal)
      .toMatchObject({ kind: "fallback", batchId: null });
  });

  it("knows every batch it proved, and deletes them once finished: a held round's only for a deleted game, a searching round's as found", () => {
    const recorded: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }];
    const answered = round(...recorded, { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 9000, servedTier: "batch", at: T0 });
    expect(answered.batchIds).toEqual(["msgbatch_1"]);
    expect([qualityBatchCleanupDue(answered, false), qualityBatchCleanupDue(answered, true)]).toEqual([true, true]);
    const held = round(...recorded, { kind: "held", reason: "unpriced", at: T0 });
    expect([qualityBatchCleanupDue(held, false), qualityBatchCleanupDue(held, true)]).toEqual([false, true]);
    expect(qualityBatchSearching(held, T0 + 9 * HOUR)).toBe(false);
    // Two copies found while a third might still run: held, still searching; what is found is deleted as it is found.
    const copies: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], complete: false, at: T0 },
      { kind: "held", reason: "two", at: T0 }];
    const searching = round(...copies);
    expect(searching.batchIds).toEqual(["msgbatch_1", "msgbatch_2"]);
    expect([qualityBatchSearching(searching, T0), qualityBatchCleanupDue(searching, true), qualityBatchCleanupDue(searching, false)]).toEqual([true, true, false]);
    const partly = round(...copies, { kind: "deleted", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], at: T0 }, { kind: "found", n: 2, batchIds: ["msgbatch_3"], complete: true, at: T0 });
    expect(partly).toMatchObject({ batchIds: ["msgbatch_1", "msgbatch_2", "msgbatch_3"], deletedIds: ["msgbatch_1", "msgbatch_2"], deletions: 1 });
    expect([qualityBatchSearching(partly, T0), qualityBatchCleanupDue(partly, true)]).toEqual([false, true]);
    // A round held over copies of a presumed create is the person's: its copies are not read as late bills.
    const heldPresumed = round({ kind: "claim", n: 1, at: T0 }, { kind: "presumed", n: 1, at: T0 },
      { kind: "found", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], complete: true, at: T0 }, { kind: "held", reason: "two", at: T0 },
      { kind: "deleted", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], at: T0 });
    expect([qualityBatchLateDue(heldPresumed), heldPresumed.deletedIds]).toEqual([[], ["msgbatch_1", "msgbatch_2"]]);
    expect(qualityBatchCleanupDue(round(...copies, { kind: "deleted", n: 1, batchIds: ["msgbatch_2"], at: T0 },
      { kind: "deleted", n: 2, batchIds: ["msgbatch_1"], at: T0 }), true)).toBe(false);
    // Nothing reached the provider; everything is already deleted; the round is still open.
    expect(qualityBatchCleanupDue(round({ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: null, transient: false },
      { kind: "held", reason: "refused", at: T0 }), true)).toBe(false);
    expect(qualityBatchCleanupDue(round(...recorded, { kind: "held", reason: "x", at: T0 }, { kind: "deleted", n: 1, batchIds: ["msgbatch_1"], at: T0 }), true)).toBe(false);
    expect(qualityBatchCleanupDue(round(...recorded), true)).toBe(false);
  });

  it("searches a presumed-lost round once more a day after the presumption, until a complete search started after then", () => {
    const due = PRESUMED_AT + QUALITY_BATCH_LATE_SEARCH_MS;
    expect([qualityBatchSearching(round(...presumedLost), due - 1), qualityBatchSearching(round(...presumedLost), due)]).toEqual([false, true]);
    // A complete search that started before then (the one that lost the decision) does not end it, nor does one left undecided.
    const early: QualityBatchEvent = { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: true, at: due - 1 };
    const undecided: QualityBatchEvent = { kind: "found", n: 2, batchIds: [], complete: false, at: due };
    expect(qualityBatchSearching(round(...presumedLost, early, undecided), due + HOUR)).toBe(true);
    const complete: QualityBatchEvent = { kind: "found", n: 3, batchIds: [], complete: true, at: due + HOUR };
    expect(qualityBatchSearching(round(...presumedLost, early, undecided, complete), due + HOUR)).toBe(false);
    // Rounds that never reached the provider, or whose batch was known, do not search after they finish.
    const never = round({ kind: "claim", n: 1, at: T0, closing: true }, { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 });
    const answered = round({ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 },
      { kind: "answered", batchId: "msgbatch_1", amountMicroUsd: 9000, servedTier: "batch", at: T0 });
    expect([never, answered].map(r => qualityBatchSearching(r, due + 9 * HOUR))).toEqual([false, false]);
    // Every copy found is read, each once; then each may be deleted.
    const two = round(...presumedLost, { ...foundLate, batchIds: ["msgbatch_1", "msgbatch_2"] }, { kind: "late", n: 1, batchId: "msgbatch_2", amountMicroUsd: null, at: due });
    expect([qualityBatchLateDue(two), qualityBatchDeletable(two, true), two.lates.map(l => l.amountMicroUsd)]).toEqual([["msgbatch_1"], ["msgbatch_2"], [null]]);
  });

  it("reserves half of the synchronous reservation, rounded up", () => {
    expect([250_000, 66_000, 1, 3].map(qualityBatchReserveMicroUsd)).toEqual([125_000, 33_000, 1, 2]);
  });

  it("names each event so a second writer of it is refused by the store", () => {
    expect(qualityBatchEventName({ kind: "claim", n: 3, at: T0 })).toBe("claim-3");
    expect(qualityBatchEventName({ kind: "refused", n: 3, at: T0, status: 429, errorType: null, transient: true })).toBe("refused-3");
    expect(qualityBatchEventName({ kind: "found", n: 2, batchIds: [], complete: true, at: T0 })).toBe("found-2");
    expect(qualityBatchEventName({ kind: "deleted", n: 1, batchIds: ["b"], at: T0 })).toBe("deleted-1");
    expect(qualityBatchEventName({ kind: "late", n: 2, batchId: "b", amountMicroUsd: null, at: T0 })).toBe("late-2");
    expect(qualityBatchEventName({ kind: "claim", n: 4, at: T0, closing: true })).toBe("claim-4");
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

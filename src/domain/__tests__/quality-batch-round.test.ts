import { describe, expect, it } from "vitest";
import {
  QUALITY_BATCH_CREATE_GRACE_MS, QUALITY_BATCH_LATE_SEARCH_MS, QUALITY_BATCH_REFUSAL_BACKOFF_MS, QUALITY_BATCH_VERSION, decideQualityBatchResults, nextQualityBatchStep,
  qualityBatchCanonicalJson, qualityBatchCleanupDue, qualityBatchCopyStart, qualityBatchDeletable, qualityBatchEventName, qualityBatchLateDue,
  qualityBatchReserveMicroUsd, qualityBatchRoundOf, qualityBatchSearchWindow, qualityBatchSearching, type QualityBatchEvent, type QualityBatchIntent,
} from "../generation/quality-batch-round";

const T0 = Date.parse("2026-10-16T08:00:00.000Z"), HOUR = 60 * 60_000;
const intent: QualityBatchIntent = { version: QUALITY_BATCH_VERSION, roundId: "qb" + "a".repeat(30), gameId: "game-synthetic", worldId: "game-synthetic:board-wizard",
  sceneId: "scene", board: "giza", hideId: "giza-v12-1", variantId: "row", imageSha256: "b".repeat(64), syncKey: `self-repair:board:giza:${"c".repeat(64)}`,
  batchKey: `self-repair:batch:giza:${"c".repeat(64)}`, customId: "q" + "d".repeat(40), fingerprint: "c".repeat(64), model: "claude-opus-5-5",
  syncReserveMicroUsd: 250_000, batchReserveMicroUsd: 125_000, paramsSha256: "e".repeat(64), intentAt: T0, deadlineAt: T0 + 6 * HOUR };
const round = (...events: QualityBatchEvent[]) => qualityBatchRoundOf([{ kind: "intent", intent }, ...events]);
const step = (at: number, ...events: QualityBatchEvent[]) => nextQualityBatchStep(round(...events), at);
const answered = (batchId: string, amountMicroUsd: number, at = T0): QualityBatchEvent => ({ kind: "answered", batchId, amountMicroUsd, servedTier: "batch", at,
  evidence: { providerNamespace: "anthropic:find-me-existing", providerRequestId: "msg_1", usageId: "u", rawUsage: {}, model: "claude-opus-5-5", amountMicroUsd,
    costBasis: "conservative-upper-estimate" } });
const heldUnknown = (reason: string, batchId?: string): QualityBatchEvent => ({ kind: "held", reason, charge: "unknown", at: T0, ...batchId ? { batchId, results: [] } : {} });
const late = (n: number, batchId: string, amountMicroUsd: number | null, at = T0): QualityBatchEvent => ({ kind: "late", n, batchId, amountMicroUsd, results: [], at });
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
    expect(step(T0 + QUALITY_BATCH_CREATE_GRACE_MS, claimed)).toEqual({ step: "find", sinceMs: T0, untilMs: T0 + QUALITY_BATCH_CREATE_GRACE_MS });
  });

  it("searches only the batches its one uncertain create could have made: from the intent to the grace after the last claim", () => {
    const refusedFirst: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 429, errorType: null, transient: true },
      { kind: "claim", n: 2, at: T0 + HOUR }];
    expect(qualityBatchSearchWindow(round(...refusedFirst))).toEqual({ sinceMs: T0, untilMs: T0 + HOUR + QUALITY_BATCH_CREATE_GRACE_MS });
    expect(step(T0 + 9 * HOUR, ...refusedFirst)).toEqual({ step: "find", sinceMs: T0, untilMs: T0 + HOUR + QUALITY_BATCH_CREATE_GRACE_MS });
  });

  it("never sends again after a create that may have reached the provider: the batch is found, or the create is presumed lost", () => {
    const claimed: QualityBatchEvent = { kind: "claim", n: 1, at: T0 };
    // A search found nothing: presumed lost, which settles at the most and falls back; there is no step that creates.
    const presumed: QualityBatchEvent = { kind: "presumed", n: 1, at: T0 + QUALITY_BATCH_CREATE_GRACE_MS };
    expect(step(T0 + 9 * HOUR, claimed, presumed)).toMatchObject({ step: "presumed" });
    const fellBack = round(claimed, presumed, { kind: "fallback", batchId: null, resultType: "presumed-lost", errorType: null, at: T0 });
    expect(fellBack.terminal).toMatchObject({ kind: "fallback", resultType: "presumed-lost" });
    // A copy that turns up later is kept, and read for its bill before it may be deleted: the presumption may not cover it.
    const found = round(...presumedLost, foundLate);
    expect([found.batchIds, qualityBatchLateDue(found), qualityBatchCleanupDue(found, false), qualityBatchCleanupDue(found, true)]).toEqual([["msgbatch_1"], ["msgbatch_1"], false, false]);
    const read = round(...presumedLost, foundLate, late(1, "msgbatch_1", 9000));
    expect([read.billedIds, qualityBatchLateDue(read), qualityBatchDeletable(read, false)]).toEqual([["msgbatch_1"], [], ["msgbatch_1"]]);
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
    const events: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, answered("msgbatch_1", 9000, T0 + HOUR)];
    expect(step(T0 + 9 * HOUR, ...events)).toMatchObject({ step: "done", terminal: { kind: "answered" } });
  });

  it.each<[string, QualityBatchEvent[]]>([
    ["a claim with a gap", [{ kind: "claim", n: 2, at: T0 }]],
    ["an outcome of a claim never made", [{ kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }]],
    ["two recorded batches", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_2", at: T0 }]],
    ["a create both refused and recorded", [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 429, errorType: null, transient: true }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }]],
    ["a claim after the recorded batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "claim", n: 2, at: T0 }]],
    ["an answer from an unrecorded batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, answered("msgbatch_9", 1)]],
    ["an answer that settles another charge than it states", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 },
      { ...answered("msgbatch_1", 1), amountMicroUsd: 2 } as QualityBatchEvent]],
    ["an unsent fallback after a recorded batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }]],
    ["two terminal outcomes", [heldUnknown("x"), heldUnknown("y")]],
    ["a hold that states no charge", [{ kind: "claim", n: 1, at: T0 }, { kind: "held", reason: "x", at: T0 } as unknown as QualityBatchEvent]],
    ["a hold at zero without its result", [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: null, transient: false },
      { kind: "held", reason: "x", charge: "zero", at: T0 }]],
    ["a hold that read another batch than the round's", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, heldUnknown("x", "msgbatch_9")]],
    ["a deletion of another batch", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 },
      answered("msgbatch_1", 1), { kind: "deleted", n: 1, batchIds: ["msgbatch_9"], at: T0 }]],
    ["a deletion with nothing in it", [{ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: null, transient: false },
      { kind: "held", reason: "x", charge: "zero", resultType: "create-refused-400", at: T0 }, { kind: "deleted", n: 1, batchIds: [], at: T0 }]],
    ["deletions with a gap", [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 },
      answered("msgbatch_1", 1), { kind: "deleted", n: 2, batchIds: ["msgbatch_1"], at: T0 }]],
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
    ["a closed round held", [{ kind: "claim", n: 1, at: T0, closing: true }, heldUnknown("x")]],
    ["a round closed after it found a copy", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: false, at: T0 },
      { kind: "claim", n: 2, at: T0, closing: true }]],
    ["a round falling back unsent after it found a copy", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: true, at: T0 },
      { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }]],
    // (Its batch was found by a search, so only the outcome having read it refuses a second bill.)
    ["a late bill of the batch its outcome already read", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: true, at: T0 },
      { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, answered("msgbatch_1", 1), late(1, "msgbatch_1", 1)]],
    ["a late bill before the round finished", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: false, at: T0 }, late(1, "msgbatch_1", 0)]],
    ["a late bill of a copy never found", [...presumedLost, late(1, "msgbatch_1", 0)]],
    ["a late copy read twice", [...presumedLost, foundLate, late(1, "msgbatch_1", 0), late(2, "msgbatch_1", 0)]],
    ["a late bill that is no amount", [...presumedLost, foundLate, late(1, "msgbatch_1", -1)]],
    ["a late copy deleted before its bill was read", [...presumedLost, foundLate, { kind: "deleted", n: 1, batchIds: ["msgbatch_1"], at: T0 }]],
    ["a held round's copy deleted before its bill was read", [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], complete: true, at: T0 },
      heldUnknown("two"), late(1, "msgbatch_1", 0), { kind: "deleted", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], at: T0 }]],
  ])("refuses an impossible record: %s", (_name, events) => {
    expect(() => round(...events)).toThrow("QUALITY_BATCH");
  });

  it("keeps every batch a search proved for good: two copies hold the round, whatever a later search sees", () => {
    const claimed: QualityBatchEvent = { kind: "claim", n: 1, at: T0 }, later = T0 + QUALITY_BATCH_CREATE_GRACE_MS;
    const one: QualityBatchEvent = { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: false, at: later };
    // One copy proven while another might still run: the round keeps searching.
    expect(round(claimed, one)).toMatchObject({ found: ["msgbatch_1"], searches: 1, searchComplete: false });
    expect(step(later, claimed, one)).toEqual({ step: "find", sinceMs: T0, untilMs: later });
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

  it("deletes a finished round's batches only with their bills in the record: a held round's only for a deleted game", () => {
    const recorded: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }];
    // The outcome that read the round's batch is its bill.
    const answeredRound = round(...recorded, answered("msgbatch_1", 9000));
    expect([answeredRound.billedIds, qualityBatchCleanupDue(answeredRound, false), qualityBatchCleanupDue(answeredRound, true)]).toEqual([["msgbatch_1"], true, true]);
    const heldOnRead = round(...recorded, heldUnknown("unpriced", "msgbatch_1"));
    expect([qualityBatchLateDue(heldOnRead), qualityBatchCleanupDue(heldOnRead, false), qualityBatchCleanupDue(heldOnRead, true)]).toEqual([[], false, true]);
    expect(qualityBatchSearching(heldOnRead, T0 + 9 * HOUR)).toBe(false);
    // A hold that did not read the round's batch leaves it to be read, like every copy, before it may go.
    const heldUnread = round(...recorded, { kind: "found", n: 1, batchIds: ["msgbatch_2"], complete: true, at: T0 }, heldUnknown("two"));
    expect([qualityBatchLateDue(heldUnread), qualityBatchCleanupDue(heldUnread, true)]).toEqual([["msgbatch_1", "msgbatch_2"], false]);
    // Codex's seventh pass: the create's own batch recorded, one copy found by a search left undecided. Two copies hold the
    // round, and it goes on searching for any third, though only one of the two came from a search.
    const recordedAndFound = round(...recorded, { kind: "found", n: 1, batchIds: ["msgbatch_2"], complete: false, at: T0 }, heldUnknown("two"));
    expect([recordedAndFound.found, qualityBatchSearching(recordedAndFound, T0)]).toEqual([["msgbatch_2"], true]);
    // Two copies found while a third might still run: held, still searching; each is read, then deleted with its game.
    const copies: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], complete: false, at: T0 }, heldUnknown("two")];
    const searching = round(...copies);
    expect([qualityBatchSearching(searching, T0), qualityBatchLateDue(searching), qualityBatchCleanupDue(searching, true)]).toEqual([true, ["msgbatch_1", "msgbatch_2"], false]);
    const read = [...copies, late(1, "msgbatch_1", null), late(2, "msgbatch_2", null)];
    expect([qualityBatchCleanupDue(round(...read), true), qualityBatchCleanupDue(round(...read), false)]).toEqual([true, false]);
    const partly = round(...read, { kind: "deleted", n: 1, batchIds: ["msgbatch_1", "msgbatch_2"], at: T0 }, { kind: "found", n: 2, batchIds: ["msgbatch_3"], complete: true, at: T0 });
    expect(partly).toMatchObject({ batchIds: ["msgbatch_1", "msgbatch_2", "msgbatch_3"], deletedIds: ["msgbatch_1", "msgbatch_2"], deletions: 1 });
    expect([qualityBatchSearching(partly, T0), qualityBatchLateDue(partly), qualityBatchCleanupDue(partly, true)]).toEqual([false, ["msgbatch_3"], false]);
    // A copy an answered round found beside its batch (only the provider could make one) is read too.
    const extra = round({ kind: "claim", n: 1, at: T0 }, { kind: "found", n: 1, batchIds: ["msgbatch_1"], complete: true, at: T0 },
      { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, answered("msgbatch_1", 9000), { kind: "found", n: 2, batchIds: ["msgbatch_2"], complete: true, at: T0 });
    expect([qualityBatchLateDue(extra), qualityBatchDeletable(extra, false)]).toEqual([["msgbatch_2"], ["msgbatch_1"]]);
    // Nothing reached the provider; everything is already deleted; the round is still open.
    expect(qualityBatchCleanupDue(round({ kind: "claim", n: 1, at: T0 }, { kind: "refused", n: 1, at: T0, status: 400, errorType: null, transient: false },
      { kind: "held", reason: "refused", charge: "zero", resultType: "create-refused-400", errorType: null, at: T0 }), true)).toBe(false);
    expect(qualityBatchCleanupDue(round(...recorded, heldUnknown("x", "msgbatch_1"), { kind: "deleted", n: 1, batchIds: ["msgbatch_1"], at: T0 }), true)).toBe(false);
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
    const known = round({ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "msgbatch_1", at: T0 }, answered("msgbatch_1", 9000));
    expect([never, known].map(r => qualityBatchSearching(r, due + 9 * HOUR))).toEqual([false, false]);
    // Every copy found is read, each once; then each may be deleted.
    const two = round(...presumedLost, { ...foundLate, batchIds: ["msgbatch_1", "msgbatch_2"] }, late(1, "msgbatch_2", null, due));
    expect([qualityBatchLateDue(two), qualityBatchDeletable(two, true), two.lates.map(l => l.amountMicroUsd)]).toEqual([["msgbatch_1"], ["msgbatch_2"], [null]]);
  });

  it("starts a round's copies at a different one each minute, however a rotation of rounds comes back to it", () => {
    const minute = 60_000, t = Math.floor(T0 / minute) * minute;
    expect([qualityBatchCopyStart(intent.roundId, 0, t), qualityBatchCopyStart(intent.roundId, 1, t)]).toEqual([0, 0]);
    // Codex's case: a sweep that comes back to the round every second minute with two copies (and every third with three, every
    // second with four): a start tied to the minute alone would meet the same copy first each time.
    for (const [every, length] of [[2, 2], [3, 3], [2, 4]] as const) {
      const starts = new Set(Array.from({ length: 24 }, (_, visit) => qualityBatchCopyStart(intent.roundId, length, t + visit * every * minute)));
      expect(starts.size).toBe(length);
    }
    // The copies' order and a choice salted apart from it (the phases' turn) are independent: every pairing of the two comes,
    // whether the round is visited every minute or every second or third (Codex's twelfth pass: they had moved in lockstep).
    for (const every of [1, 2, 3]) {
      const pairs = new Set(Array.from({ length: 48 }, (_, visit) => t + visit * every * minute)
        .map(at => `${qualityBatchCopyStart(intent.roundId, 2, at)}${qualityBatchCopyStart(`${intent.roundId}:search`, 2, at)}`));
      expect(pairs.size).toBe(4);
    }
    // Within one minute, the same copy first.
    expect(new Set(Array.from({ length: 60 }, (_, s) => qualityBatchCopyStart(intent.roundId, 5, t + s * 1000 + 999)))).toEqual(new Set([qualityBatchCopyStart(intent.roundId, 5, t)]));
  });

  it("gives a reading one canonical text, whatever order its keys were serialised in", () => {
    const usage = { input_tokens: 2000, output_tokens: 500, service_tier: "priority", cache: { read: 1, write: 2 } };
    const reordered = { cache: { write: 2, read: 1 }, service_tier: "priority", output_tokens: 500, input_tokens: 2000 };
    expect(qualityBatchCanonicalJson([{ type: "succeeded", usage }])).toBe(qualityBatchCanonicalJson([{ usage: reordered, type: "succeeded" }]));
    expect(JSON.parse(qualityBatchCanonicalJson(usage))).toEqual(usage);
    // Arrays keep their order; a null is not a missing key; an undefined value is left out, as JSON leaves it out.
    expect(qualityBatchCanonicalJson([1, 2])).not.toBe(qualityBatchCanonicalJson([2, 1]));
    expect(qualityBatchCanonicalJson({ a: null })).not.toBe(qualityBatchCanonicalJson({}));
    expect(qualityBatchCanonicalJson({ a: undefined, b: 1 })).toBe(qualityBatchCanonicalJson({ b: 1 }));
  });

  it("records a batch's reading once, even before the batch is known, and a reread only as another reading of it (rule 6)", () => {
    const usage = { input_tokens: 2000, output_tokens: 500, service_tier: "batch" };
    const first = [{ type: "succeeded", errorType: null, requestId: "msg_1", model: "claude-opus-5-5", usage }];
    const other = [{ ...first[0]!, requestId: "msg_2" }];
    const sent: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "b", at: T0 }];
    const reading = (batchId: string, results: typeof first): QualityBatchEvent => ({ kind: "reading", batchId, results, at: T0 });
    const reread = (results: typeof first, digest = "0123456789abcdef"): QualityBatchEvent => ({ kind: "reread", batchId: "b", digest, results, at: T0 });
    expect(round(...sent, reading("b", first)).readings["b"]).toEqual(first);
    // A search records what proved a batch before it records the batch: such a reading stands on its own.
    expect(round(...sent, reading("z", first)).readings["z"]).toEqual(first);
    expect(() => round(...sent, reading("b", first), reading("b", other))).toThrow("a batch is read once");
    // Another reading of the batch, in any key order, is no reread; any other result is one, named by its digest.
    expect(() => round(...sent, reading("b", first), reread([{ usage: { service_tier: "batch", output_tokens: 500, input_tokens: 2000 }, model: "claude-opus-5-5",
      requestId: "msg_1", errorType: null, type: "succeeded" }]))).toThrow("a reread is another reading");
    expect(round(...sent, reading("b", first), reread(other)).rereads).toHaveLength(1);
    expect(() => round(...sent, reread(other))).toThrow("a reread is another reading");
    expect(() => round(...sent, reading("b", first), reread(other, "not-a-digest"))).toThrow("a reread is another reading");
  });

  it("holds an open round with a provider fault on record before anything else it could do (rule 6)", () => {
    const first = [{ type: "canceled", errorType: null, requestId: null, model: null, usage: null }];
    const other = [{ type: "succeeded", errorType: null, requestId: "msg_2", model: "claude-opus-5-5", usage: { service_tier: "standard" } }];
    const fault = (batchId: string): QualityBatchEvent[] => [{ kind: "reading", batchId, results: first, at: T0 },
      { kind: "reread", batchId, digest: "0123456789abcdef", results: other, at: T0 }];
    const sent: QualityBatchEvent[] = [{ kind: "claim", n: 1, at: T0 }, { kind: "submitted", n: 1, batchId: "b", at: T0 }];
    // Its own batch's fault: held by that batch, at its deadline too (never polled, so never cancelled).
    expect(step(T0 + 6 * HOUR, ...sent, ...fault("b"))).toEqual({ step: "fault", batchId: "b", reason: "the provider returned other results for b on another read" });
    // Another batch's, or one read by a search before any batch was the round's: held by no batch, not searched again.
    expect(step(T0 + HOUR, ...sent, ...fault("z"))).toEqual({ step: "fault", batchId: null, reason: "the provider returned other results for z on another read" });
    expect(step(T0 + HOUR, { kind: "claim", n: 1, at: T0 }, ...fault("z"))).toMatchObject({ step: "fault", batchId: null });
    // Once an outcome is recorded the round is done: the fault is counted, never decided from.
    expect(step(T0 + HOUR, ...sent, ...fault("b"), heldUnknown("x", "b"))).toMatchObject({ step: "done" });
  });

  it("takes a copy's bill from its recorded reading, and names a reading after its batch in lower-case letters and digits", () => {
    const receipt = { type: "succeeded", errorType: null, requestId: "msg_1", model: "claude-opus-5-5", usage: { input_tokens: 2000, output_tokens: 500, service_tier: "batch" } };
    const copy = [...presumedLost, { kind: "found", n: 1, batchIds: ["c"], complete: true, at: T0 + HOUR } as QualityBatchEvent,
      { kind: "reading", batchId: "c", results: [receipt], at: T0 + HOUR } as QualityBatchEvent];
    expect(round(...copy, { ...late(1, "c", 9_000), results: [receipt] } as QualityBatchEvent).lates).toHaveLength(1);
    expect(() => round(...copy, { ...late(1, "c", 9_000), results: [{ ...receipt, requestId: "msg_2" }] } as QualityBatchEvent)).toThrow("a copy's bill is its recorded reading");
    const name = qualityBatchEventName({ kind: "reading", batchId: "msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d", results: [], at: T0 });
    expect(name).toMatch(/^reading-[a-f0-9]+$/);
    expect(qualityBatchEventName({ kind: "reread", batchId: "msgbatch_01HkcTjaV5uDC8jWR4ZsDV8d", digest: "0123456789abcdef", results: [], at: T0 }))
      .toBe(`${name.replace("reading", "reread")}-0123456789abcdef`);
    expect(qualityBatchEventName({ kind: "reading", batchId: "msgbatch_A", results: [], at: T0 })).not.toBe(qualityBatchEventName({ kind: "reading", batchId: "msgbatch_a", results: [], at: T0 }));
  });

  it("reserves half of the synchronous reservation, rounded up", () => {
    expect([250_000, 66_000, 1, 3].map(qualityBatchReserveMicroUsd)).toEqual([125_000, 33_000, 1, 2]);
  });

  it("names each event so a second writer of it is refused by the store", () => {
    expect(qualityBatchEventName({ kind: "claim", n: 3, at: T0 })).toBe("claim-3");
    expect(qualityBatchEventName({ kind: "refused", n: 3, at: T0, status: 429, errorType: null, transient: true })).toBe("refused-3");
    expect(qualityBatchEventName({ kind: "found", n: 2, batchIds: [], complete: true, at: T0 })).toBe("found-2");
    expect(qualityBatchEventName({ kind: "deleted", n: 1, batchIds: ["b"], at: T0 })).toBe("deleted-1");
    expect(qualityBatchEventName(late(2, "b", null))).toBe("late-2");
    expect(qualityBatchEventName({ kind: "claim", n: 4, at: T0, closing: true })).toBe("claim-4");
    // Answered, fallback and held share one name: only one can ever be written, and only it decides the charge.
    expect(new Set([qualityBatchEventName(answered("b", 1)), qualityBatchEventName({ kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: T0 }),
      qualityBatchEventName(heldUnknown("x"))])).toEqual(new Set(["terminal"]));
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

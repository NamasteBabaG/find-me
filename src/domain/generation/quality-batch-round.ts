/**
 * One scene-quality question delivered by a discounted batch: its durable record
 * and what may happen next. Pure: no HTTP, database or clock of its own.
 *
 * A round is a list of events, each written once under its own id (a duplicate
 * write is the compare-and-set), in this order:
 *
 *   intent ─► claim 1 ─► submitted ─► [cancel] ─► answered | fallback | held
 *              │ └► refused (documented 4xx: nothing created) ─► claim 2 ...
 *              └► no answer: uncertain; after the grace only a search decides
 *
 * The rules it keeps, each a way the money or the answer can be lost:
 * 1. The intent is durable before the reservation, and every claim before its
 *    create. A create that did not answer is never "not created": it waits out
 *    the grace, and then only a search of the provider's batches that ends before
 *    the intent decides. Two batches found hold the charge at once, but the round
 *    ends, naming every copy, only when no other batch that could carry the
 *    question is still running; one batch is recorded only then too.
 * 2. A batch still running at the round's deadline is cancelled once (and again
 *    while it keeps running). What it finished is billed at the batch rate.
 * 3. Only a result the provider documents as unbilled (errored, canceled,
 *    expired) lets the question be asked again synchronously; an invalid request
 *    and every anomaly are held for a person, with the reservation counted.
 * 4. A round whose every create was refused outright never reached the provider:
 *    after its deadline it falls back without any search.
 * 5. Once a round is finished, the provider's copies of its question are deleted.
 *    A held round keeps them for the person reconciling it, unless its game was
 *    deleted: the hold is the ledger's to keep, the imagery is the child's.
 */
export const QUALITY_BATCH_VERSION = "quality-batch/v1" as const;
/** How long a claimed create is presumed in flight: no new create and no negative search before it. */
export const QUALITY_BATCH_CREATE_GRACE_MS = 15 * 60_000;
/** After a transient refusal (rate limit), the same create waits this long. */
export const QUALITY_BATCH_REFUSAL_BACKOFF_MS = 5 * 60_000;

export type QualityBatchIntent = {
  readonly version: typeof QUALITY_BATCH_VERSION; readonly roundId: string;
  readonly gameId: string; readonly worldId: string; readonly sceneId: string; readonly board: string;
  readonly hideId: string; readonly variantId: string; readonly imageSha256: string;
  /** The key the dual review buys under, and the key this round reserves. */
  readonly syncKey: string; readonly batchKey: string; readonly customId: string;
  readonly fingerprint: string; readonly model: string;
  /** The dual review's own reservation for this question, which its alias repeats. */
  readonly syncReserveMicroUsd: number;
  /** What the batch key holds: half of it, as every batch rate is half (`qualityBatchReserveMicroUsd`). */
  readonly batchReserveMicroUsd: number;
  /** The exact Messages params sent, by digest. */
  readonly paramsSha256: string;
  readonly intentAt: number; readonly deadlineAt: number;
};
export type QualityBatchEvent =
  | { readonly kind: "intent"; readonly intent: QualityBatchIntent }
  | { readonly kind: "claim"; readonly n: number; readonly at: number }
  | { readonly kind: "refused"; readonly n: number; readonly at: number; readonly status: number; readonly errorType: string | null; readonly transient: boolean }
  | { readonly kind: "submitted"; readonly n: number; readonly batchId: string; readonly at: number }
  | { readonly kind: "cancel"; readonly at: number }
  | { readonly kind: "answered"; readonly batchId: string; readonly amountMicroUsd: number; readonly servedTier: string; readonly at: number }
  | { readonly kind: "fallback"; readonly batchId: string | null; readonly resultType: string; readonly errorType: string | null; readonly at: number }
  /** `batchIds`: batches proven to carry the question that the round never recorded (more than one was found). */
  | { readonly kind: "held"; readonly reason: string; readonly at: number; readonly batchIds?: readonly string[] }
  /** Every provider batch of the round, deleted at the provider. */
  | { readonly kind: "deleted"; readonly batchIds: readonly string[]; readonly at: number };
export type QualityBatchTerminal = Extract<QualityBatchEvent, { kind: "answered" | "fallback" | "held" }>;

export type QualityBatchRound = {
  readonly intent: QualityBatchIntent;
  readonly claims: readonly Extract<QualityBatchEvent, { kind: "claim" }>[];
  readonly refusals: readonly Extract<QualityBatchEvent, { kind: "refused" }>[];
  readonly submitted: Extract<QualityBatchEvent, { kind: "submitted" }> | null;
  readonly cancelAt: number | null;
  readonly terminal: QualityBatchTerminal | null;
  /** Every provider batch proven to carry this question: the recorded one, and any a hold found. */
  readonly batchIds: readonly string[];
  readonly deleted: boolean;
};

/**
 * What a batch question reserves. The synchronous reservation covers the most
 * its exact request can be billed at the standard rates; every batch rate is half
 * of those, so half of it, rounded up, covers the most it can be billed in a
 * batch. An answer billed at any other rate is an overrun, recorded in full and
 * held: the ledger never understates.
 */
export const qualityBatchReserveMicroUsd = (syncReserveMicroUsd: number) => Math.ceil(syncReserveMicroUsd / 2);

/** The event id suffix: one row per name, so writing it twice is refused by the store. */
export function qualityBatchEventName(event: QualityBatchEvent): string {
  return event.kind === "claim" || event.kind === "refused" ? `${event.kind}-${event.n}`
    : event.kind === "answered" || event.kind === "fallback" || event.kind === "held" ? "terminal" : event.kind;
}

/** A round from its events, or an error naming what makes the record impossible. */
export function qualityBatchRoundOf(events: readonly QualityBatchEvent[]): QualityBatchRound {
  const intents = events.filter(e => e.kind === "intent");
  if (intents.length !== 1) throw Error("QUALITY_BATCH: a round has exactly one intent");
  const intent = (intents[0] as Extract<QualityBatchEvent, { kind: "intent" }>).intent;
  const claims = events.filter((e): e is Extract<QualityBatchEvent, { kind: "claim" }> => e.kind === "claim").sort((a, b) => a.n - b.n);
  const refusals = events.filter((e): e is Extract<QualityBatchEvent, { kind: "refused" }> => e.kind === "refused").sort((a, b) => a.n - b.n);
  const submitted = events.filter((e): e is Extract<QualityBatchEvent, { kind: "submitted" }> => e.kind === "submitted");
  const terminals = events.filter((e): e is QualityBatchTerminal => e.kind === "answered" || e.kind === "fallback" || e.kind === "held");
  const deleted = events.filter((e): e is Extract<QualityBatchEvent, { kind: "deleted" }> => e.kind === "deleted");
  if (claims.some((c, i) => c.n !== i + 1)) throw Error("QUALITY_BATCH: claims are numbered from one without gaps");
  if (refusals.some(r => !claims.some(c => c.n === r.n)) || submitted.some(s => !claims.some(c => c.n === s.n)))
    throw Error("QUALITY_BATCH: an outcome names a claim that was never made");
  if (submitted.length > 1 || terminals.length > 1 || deleted.length > 1 || events.filter(e => e.kind === "cancel").length > 1)
    throw Error("QUALITY_BATCH: a round records each outcome once");
  if (submitted[0] && refusals.some(r => r.n === submitted[0]!.n)) throw Error("QUALITY_BATCH: one create was both refused and submitted");
  // A claim after a refusal or a lost create is allowed; a claim after a recorded batch is not.
  if (submitted[0] && claims.some(c => c.n > submitted[0]!.n)) throw Error("QUALITY_BATCH: a claim after the batch was recorded");
  const terminal = terminals[0] ?? null;
  if (terminal?.kind === "answered" && (!submitted[0] || terminal.batchId !== submitted[0].batchId))
    throw Error("QUALITY_BATCH: an answer from a batch this round never recorded");
  if (terminal?.kind === "fallback" && (terminal.batchId === null ? !!submitted[0] : terminal.batchId !== submitted[0]?.batchId))
    throw Error("QUALITY_BATCH: a fallback from a batch this round never recorded");
  const found = terminal?.kind === "held" ? terminal.batchIds : undefined;
  if (found !== undefined && (!Array.isArray(found) || !found.length || found.some(id => typeof id !== "string" || !id) || new Set(found).size !== found.length))
    throw Error("QUALITY_BATCH: a hold names its batches as distinct ids");
  const batchIds = [...new Set([...submitted.map(s => s.batchId), ...found ?? []])];
  if (deleted[0] && (!Array.isArray(deleted[0].batchIds) || !batchIds.length
    || JSON.stringify([...deleted[0].batchIds].sort()) !== JSON.stringify([...batchIds].sort())))
    throw Error("QUALITY_BATCH: a deletion names other batches than the round's");
  const cancel = events.find((e): e is Extract<QualityBatchEvent, { kind: "cancel" }> => e.kind === "cancel");
  return { intent, claims, refusals, submitted: submitted[0] ?? null, cancelAt: cancel?.at ?? null, terminal, batchIds, deleted: !!deleted[0] };
}

export type QualityBatchStep =
  | { readonly step: "done"; readonly terminal: QualityBatchTerminal }
  | { readonly step: "create"; readonly claim: number }
  | { readonly step: "wait"; readonly reason: string }
  | { readonly step: "find"; readonly sinceMs: number; readonly nextClaim: number }
  | { readonly step: "poll"; readonly batchId: string; readonly cancelDue: boolean }
  | { readonly step: "fallback-unsent"; readonly reason: string }
  | { readonly step: "hold"; readonly reason: string };

/** What this round may do now. */
export function nextQualityBatchStep(round: QualityBatchRound, now: number): QualityBatchStep {
  if (round.terminal) return { step: "done", terminal: round.terminal };
  if (round.submitted) return { step: "poll", batchId: round.submitted.batchId, cancelDue: now >= round.intent.deadlineAt };
  const last = round.claims.at(-1);
  if (!last) return { step: "create", claim: 1 };
  const refused = round.refusals.find(r => r.n === last.n);
  if (refused) {
    if (!refused.transient) return { step: "hold", reason: `the batch create was refused (${refused.status}${refused.errorType ? ` ${refused.errorType}` : ""})` };
    // Every create so far was refused outright: nothing reached the provider.
    if (round.refusals.length === round.claims.length && now >= round.intent.deadlineAt)
      return { step: "fallback-unsent", reason: `no batch was ever created before the deadline (${round.refusals.length} refused creates)` };
    if (now - refused.at < QUALITY_BATCH_REFUSAL_BACKOFF_MS) return { step: "wait", reason: "a refused create waits out its backoff" };
    return { step: "create", claim: last.n + 1 };
  }
  if (now - last.at < QUALITY_BATCH_CREATE_GRACE_MS) return { step: "wait", reason: "a create may still be in flight" };
  return { step: "find", sinceMs: round.intent.intentAt, nextClaim: last.n + 1 };
}

/** Whether the provider's copies of a finished round are still to be deleted (rule 5). */
export function qualityBatchCleanupDue(round: QualityBatchRound, gameDeleted: boolean): boolean {
  return !!round.terminal && !round.deleted && round.batchIds.length > 0 && (round.terminal.kind !== "held" || gameDeleted);
}

/** How one result of an ended batch settles this round. */
export type QualityBatchResultDecision =
  | { readonly decision: "answer" }
  | { readonly decision: "unbilled-fallback"; readonly resultType: "errored" | "canceled" | "expired"; readonly errorType: string | null }
  | { readonly decision: "unbilled-held"; readonly resultType: "errored"; readonly errorType: string | null; readonly reason: string }
  | { readonly decision: "held"; readonly reason: string };

/** Errored, canceled and expired requests are documented as not billed; anything
 * else in an ended batch is a billed answer or an anomaly for a person. */
export function decideQualityBatchResults(results: readonly { customId: string; type: string; errorType?: string | null }[], customId: string): QualityBatchResultDecision {
  const mine = results.filter(r => r.customId === customId);
  if (mine.length === 0) return { decision: "held", reason: "the batch ended without a result for this question" };
  if (mine.length > 1) return { decision: "held", reason: `the batch returned ${mine.length} results for one question` };
  const result = mine[0]!;
  if (result.type === "succeeded") return { decision: "answer" };
  if (result.type === "canceled" || result.type === "expired") return { decision: "unbilled-fallback", resultType: result.type, errorType: null };
  if (result.type === "errored") {
    const errorType = result.errorType ?? null;
    // The question itself was refused: asking it again unchanged would be refused too.
    if (errorType === "invalid_request_error" || errorType === "invalid_request")
      return { decision: "unbilled-held", resultType: "errored", errorType, reason: `the question was refused as invalid (${errorType})` };
    return { decision: "unbilled-fallback", resultType: "errored", errorType };
  }
  return { decision: "held", reason: `an unrecognised result type ${result.type}` };
}

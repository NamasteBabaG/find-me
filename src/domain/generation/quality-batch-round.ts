/**
 * One scene-quality question delivered by a discounted batch: its durable record
 * and what may happen next. Pure: no HTTP, database or clock of its own.
 *
 * A round is a list of events, each written once under its own id (a duplicate
 * write is the compare-and-set), in this order:
 *
 *   intent ─► claim 1 ─► submitted ─► [cancel] ─► answered | fallback | held ─► late n ─► deleted n
 *              │ └► refused (documented 4xx: nothing created) ─► claim 2 ...
 *              └► no answer: uncertain; after the grace only a search decides,
 *                 and every batch it proves to carry the question is kept (found n)
 *
 * The rules it keeps, each a way the money or the answer can be lost:
 * 0. Only the round's terminal outcome decides its charge. It is written first,
 *    under one name, and says what the ledger must hold; the ledger is then made
 *    to match it by whichever pass reads it, as often as needed. A pass that
 *    decided otherwise from an older read lost the name and changes nothing.
 * 1. The intent is durable before the reservation, and every claim before its
 *    create. A create that did not answer is never "not created", and nothing
 *    is ever sent again after it: at most one create of a round can reach the
 *    provider, so at most one copy of its question can exist. After the grace,
 *    only a search of the batches created from the intent to the grace after
 *    the last claim decides. Every batch it proves to carry the question is
 *    recorded at once, for good, and so is every batch it could not decide (one
 *    still running, or one whose results it could not read), by its id, until a
 *    later search decides it (`pending`, `cleared`). One copy, with no other batch
 *    that could carry the question undecided, is the round's batch. None, after a complete
 *    search, presumes the create lost: its charge is counted at the most it
 *    could be and is never released, and the question is asked synchronously.
 *    The batch and the presumption are one decision, made once, by the search
 *    that decides, in the slot it records what it found in: no record a
 *    concurrent search made first goes unseen. A question falls back to its
 *    synchronous price only once no batch that could carry it is pending. Two copies
 *    (which only the provider could make) hold the round, unless its create was
 *    already presumed lost.
 * 2. A batch still running at the round's deadline is cancelled once (and again
 *    while it keeps running). What it finished is billed at the batch rate.
 * 3. Only a result the provider documents as unbilled (errored, canceled,
 *    expired) lets the question be asked again synchronously; an invalid request
 *    and every anomaly are held for a person, with the reservation counted.
 * 4. A round that never reached the provider ends at zero: every create refused
 *    outright until the deadline, or a game that stopped before any create got
 *    through. The close first takes the claim a create would take, so a worker
 *    that claimed it keeps its create and the close stands down.
 * 5. Once a round is finished, the provider's copies of its question are deleted,
 *    each only after its bill is in the record with its receipts: the round's own
 *    batch by the outcome that read it, every other copy afterwards (`late`). Every
 *    other copy's bill is a charge of its own in the ledger, in full; one that
 *    cannot be priced is held as unknown, which holds the world. A held round keeps its copies
 *    for the person reconciling it, unless its game was deleted: the hold is the
 *    ledger's to keep, the imagery is the child's. A finished round keeps searching
 *    while a batch a search could not decide is pending or a batch it read is
 *    unrecorded, and a round held after an unfinished search until a complete one,
 *    so every copy is found; a presumed-lost round searches once more a day later.
 * 6. A batch's results are recorded the first time they are read (`reading`),
 *    by a search that proved the batch or by any later read, before anything is
 *    decided from them, and the batch is the round's from then on, found or not.
 *    A reading binds the bill and the answer (by its digest). Every decision about
 *    that batch is taken from that reading: the outcome for the round's own batch,
 *    `late` for a copy. Every bill beyond the batch key's is counted before it is
 *    recorded: a finished round's copy before its first reading, and a later read
 *    that returns another bill (`reread`, a provider fault, never decided from)
 *    before the reread; a count refused is recorded all the same, and raised. An
 *    answer whose first reading is on record but whose content no pass kept cannot
 *    be delivered once it is read otherwise: its round is held for a person, at the
 *    bill that reading states (unknown only when it cannot be priced). A copy whose
 *    bill is the outcome's own is the outcome's bill.
 */
import type { WorldChargeEvidence } from "./world-budget";

export const QUALITY_BATCH_VERSION = "quality-batch/v1" as const;
/** How long a claimed create is presumed in flight: no new create and no negative search before it,
 * and no batch it made is created later than this after its claim. */
export const QUALITY_BATCH_CREATE_GRACE_MS = 15 * 60_000;
/** After a transient refusal (rate limit), the same create waits this long. */
export const QUALITY_BATCH_REFUSAL_BACKOFF_MS = 5 * 60_000;
/** A presumed-lost round searches once more this long after the presumption: by then any batch its
 * create made has ended (a batch expires 24 hours after it is created, and the two clocks may
 * differ by five minutes each way) and is listed. */
export const QUALITY_BATCH_LATE_SEARCH_MS = 24 * 60 * 60_000 + 15 * 60_000;

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
/** What the provider returned for this round's question in one batch: enough to reconcile its bill, never the answer;
 * an answer only by its digest (`answerSha256`, the whole message in canonical form), so a read that returns another
 * answer under the same bill is another reading. */
export type QualityBatchReceipt = {
  readonly type: string; readonly errorType: string | null;
  readonly requestId: string | null; readonly model: string | null; readonly usage: unknown;
  readonly answerSha256?: string;
};
/** A reading's bill: its receipts without the answer's digest. Two readings with one bill are one charge. */
export const qualityBatchBill = (receipts: readonly QualityBatchReceipt[]) => receipts.map(({ answerSha256: _answer, ...bill }) => bill);
export type QualityBatchEvent =
  | { readonly kind: "intent"; readonly intent: QualityBatchIntent }
  /** `closing`: taken by a pass that ends the round unsent (rule 4); no create follows it. */
  | { readonly kind: "claim"; readonly n: number; readonly at: number; readonly closing?: true }
  | { readonly kind: "refused"; readonly n: number; readonly at: number; readonly status: number; readonly errorType: string | null; readonly transient: boolean }
  | { readonly kind: "submitted"; readonly n: number; readonly batchId: string; readonly at: number }
  /** The create under claim `n` is presumed lost: it did not answer, and no complete search found its batch.
   * It takes `submitted`'s name: what the round's batch is gets decided once. */
  | { readonly kind: "presumed"; readonly n: number; readonly at: number }
  /** Batches a search proved to carry the question that were not yet recorded (possibly none);
   * `complete`: that search left no batch undecided; `at`: when it started. `pending`: batches it could not decide
   * (still running, or unreadable) that were not pending yet, by their ids; `cleared`: pending batches it decided carry
   * no copy (read without the question, or missing from a listing of the whole window). `decision`: what the round's
   * batch is, decided by this search with what it found, in its own slot: the one batch (`submitted`), or none
   * (`presumed`), for the create under claim `claim`. Read as the `submitted` or `presumed` it decides. */
  | { readonly kind: "found"; readonly n: number; readonly batchIds: readonly string[]; readonly complete: boolean; readonly at: number;
      readonly pending?: readonly string[]; readonly cleared?: readonly string[]; readonly decision?: QualityBatchDecision }
  | { readonly kind: "cancel"; readonly at: number }
  /** The round's batch answered: the charge `evidence` settles the batch key. */
  | { readonly kind: "answered"; readonly batchId: string; readonly amountMicroUsd: number; readonly servedTier: string; readonly evidence: WorldChargeEvidence; readonly at: number }
  /** Asked synchronously instead: after a result documented as unbilled (`batchId`, zero), with no batch ever
   * created (`never-created`, zero), or with the create presumed lost (`presumed-lost`, the batch reservation). */
  | { readonly kind: "fallback"; readonly batchId: string | null; readonly resultType: string; readonly errorType: string | null; readonly at: number }
  /** Held for a person. `charge`: the batch key settled at zero (a result documented as unbilled, or a create
   * refused outright: `resultType`, `errorType`), settled at the bill its reading states (`known`, `evidence`: an
   * answer that cannot be delivered), or held as unknown. `batchId` and `results`: the round's batch, when the
   * hold came from reading it. */
  | { readonly kind: "held"; readonly reason: string; readonly charge: "zero" | "unknown" | "known"; readonly batchId?: string; readonly resultType?: string;
      readonly errorType?: string | null; readonly evidence?: WorldChargeEvidence; readonly results?: readonly QualityBatchReceipt[]; readonly at: number }
  /** Another copy of a finished round, read before it may be deleted: its priced charge, 0 when the provider
   * documents it as unbilled, null when it cannot be priced; and what the provider returned. */
  | { readonly kind: "late"; readonly n: number; readonly batchId: string; readonly amountMicroUsd: number | null; readonly results: readonly QualityBatchReceipt[]; readonly at: number }
  /** What the provider returned for this question the first time a batch's results were read (rule 6): every
   * decision about that batch comes from this reading, the round's outcome for its own batch, `late` for a copy. */
  | { readonly kind: "reading"; readonly batchId: string; readonly results: readonly QualityBatchReceipt[]; readonly at: number }
  /** A later read of a batch that returned anything else: a provider fault, counted as a charge of its own before it
   * is recorded, and never decided from (rule 6). `digest` names it, so each distinct reading is recorded once. */
  | { readonly kind: "reread"; readonly batchId: string; readonly digest: string; readonly results: readonly QualityBatchReceipt[]; readonly at: number }
  /** Batches of the round deleted at the provider in one pass. */
  | { readonly kind: "deleted"; readonly n: number; readonly batchIds: readonly string[]; readonly at: number };
export type QualityBatchTerminal = Extract<QualityBatchEvent, { kind: "answered" | "fallback" | "held" }>;
/** What a deciding search records the round's batch to be (rule 1). */
export type QualityBatchDecision = { readonly kind: "submitted"; readonly claim: number; readonly batchId: string } | { readonly kind: "presumed"; readonly claim: number };

export type QualityBatchRound = {
  readonly intent: QualityBatchIntent;
  readonly claims: readonly Extract<QualityBatchEvent, { kind: "claim" }>[];
  readonly refusals: readonly Extract<QualityBatchEvent, { kind: "refused" }>[];
  readonly submitted: Extract<QualityBatchEvent, { kind: "submitted" }> | null;
  readonly presumed: Extract<QualityBatchEvent, { kind: "presumed" }> | null;
  readonly cancelAt: number | null;
  readonly terminal: QualityBatchTerminal | null;
  /** Every batch any search proved to carry this question, in the order found. */
  readonly found: readonly string[];
  /** How many `found` events the round has: the next one is numbered after them. */
  readonly searches: number;
  /** Whether the latest recorded search left no batch undecided, with no batch read that no search recorded and none pending. */
  readonly searchComplete: boolean;
  /** When the latest complete search started, if any. */
  readonly completeSearchAt: number | null;
  /** The other copies of a finished round whose bill was read, in order, and their ids. */
  readonly lates: readonly Extract<QualityBatchEvent, { kind: "late" }>[];
  readonly lateIds: readonly string[];
  /** Every batch whose bill is in the record: the one the terminal outcome read, and every late one. */
  readonly billedIds: readonly string[];
  /** Every provider batch known to carry this question: the recorded one, every one found, and every one read. */
  readonly batchIds: readonly string[];
  /** Batches read by a search that stopped before recording them (not found, not the recorded one): that search may have
   * been undecided, so the round's search counts as unfinished until a later one records them. */
  readonly unfound: readonly string[];
  /** Batches a search could not decide (rule 1), kept by their ids until a later search decides them: none of the round's. */
  readonly pending: readonly string[];
  /** Those deleted at the provider, and how many `deleted` events recorded them. */
  readonly deletedIds: readonly string[];
  readonly deletions: number;
  /** Each batch's recorded reading (rule 6), by batch id. */
  readonly readings: Readonly<Record<string, readonly QualityBatchReceipt[]>>;
  /** Later reads that returned anything else, each a charge of its own (rule 6). */
  readonly rereads: readonly Extract<QualityBatchEvent, { kind: "reread" }>[];
};

/**
 * What a batch question reserves. The synchronous reservation covers the most
 * its exact request can be billed at the standard rates; every batch rate is half
 * of those, so half of it, rounded up, covers the most it can be billed in a
 * batch. An answer billed at any other rate is an overrun, recorded in full and
 * held: the ledger never understates.
 */
export const qualityBatchReserveMicroUsd = (syncReserveMicroUsd: number) => Math.ceil(syncReserveMicroUsd / 2);

/** The event id suffix: one row per name, so writing it twice is refused by the store. A batch's
 * reading is named after the batch (its id in hex, as event names are lower-case letters and digits). */
export function qualityBatchEventName(event: QualityBatchEvent): string {
  return event.kind === "claim" || event.kind === "refused" || event.kind === "found" || event.kind === "late" || event.kind === "deleted" ? `${event.kind}-${event.n}`
    : event.kind === "answered" || event.kind === "fallback" || event.kind === "held" ? "terminal"
    : event.kind === "reading" ? `reading-${hex(event.batchId)}`
    : event.kind === "reread" ? `reread-${hex(event.batchId)}-${event.digest}`
    : event.kind === "presumed" ? "submitted" : event.kind;
}
const hex = (value: string) => Array.from(new TextEncoder().encode(value), byte => byte.toString(16).padStart(2, "0")).join("");

const numbered = (events: readonly { n: number }[]) => events.every((e, i) => e.n === i + 1);
const ids = (value: unknown, allowEmpty: boolean) => Array.isArray(value) && (allowEmpty || value.length > 0)
  && value.every(id => typeof id === "string" && id.length > 0) && new Set(value).size === value.length;

/** A round from its events, or an error naming what makes the record impossible. */
export function qualityBatchRoundOf(events: readonly QualityBatchEvent[]): QualityBatchRound {
  const intents = events.filter(e => e.kind === "intent");
  if (intents.length !== 1) throw Error("QUALITY_BATCH: a round has exactly one intent");
  const intent = (intents[0] as Extract<QualityBatchEvent, { kind: "intent" }>).intent;
  const of = <K extends QualityBatchEvent["kind"]>(kind: K) => events.filter((e): e is Extract<QualityBatchEvent, { kind: K }> => e.kind === kind);
  const claims = of("claim").sort((a, b) => a.n - b.n), refusals = of("refused").sort((a, b) => a.n - b.n);
  const finds = of("found").sort((a, b) => a.n - b.n), deletions = of("deleted").sort((a, b) => a.n - b.n);
  // Rule 1: a search that decides the round's batch records its decision with what it found, in its own slot, so no record
  // a concurrent search made first goes unseen. It reads as the `submitted` or `presumed` it decides.
  const decisions = finds.flatMap(f => f.decision ? [{ ...f.decision, at: f.at }] : []);
  const submitted = [...of("submitted"), ...decisions.flatMap(d => d.kind === "submitted" ? [{ kind: d.kind, n: d.claim, batchId: d.batchId, at: d.at }] : [])];
  const presumed = [...of("presumed"), ...decisions.flatMap(d => d.kind === "presumed" ? [{ kind: d.kind, n: d.claim, at: d.at }] : [])];
  const terminals = events.filter((e): e is QualityBatchTerminal => e.kind === "answered" || e.kind === "fallback" || e.kind === "held");
  if (!numbered(claims)) throw Error("QUALITY_BATCH: claims are numbered from one without gaps");
  if ([...refusals, ...submitted, ...presumed].some(e => !claims.some(c => c.n === e.n))) throw Error("QUALITY_BATCH: an outcome names a claim that was never made");
  // One decision per round: two records of the same decision (a search's, and a `submitted` event of an earlier revision
  // naming the same batch for the same claim) are that one decision; any two that differ make the record impossible.
  const decisionsMade = new Set([...submitted.map(s => `submitted:${s.n}:${s.batchId}`), ...presumed.map(p => `presumed:${p.n}`)]);
  if (decisionsMade.size > 1 || terminals.length > 1 || of("cancel").length > 1) throw Error("QUALITY_BATCH: a round records each outcome once");
  const decided = submitted[0] ?? presumed[0] ?? null;
  if (decided && refusals.some(r => r.n === decided.n)) throw Error("QUALITY_BATCH: one create was both refused and recorded");
  if (decided && claims.some(c => c.n > decided.n)) throw Error("QUALITY_BATCH: a claim after the round's batch was decided");
  // Rule 1: after a create that may have reached the provider, nothing is sent again.
  if (claims.slice(0, -1).some(c => !refusals.some(r => r.n === c.n))) throw Error("QUALITY_BATCH: a claim after a create that may have reached the provider");
  const closing = claims.filter(c => c.closing);
  if (closing.some(c => c !== claims.at(-1) || refusals.some(r => r.n === c.n) || decided?.n === c.n))
    throw Error("QUALITY_BATCH: only the last claim may close the round, and nothing is sent under it");
  if (!numbered(finds) || finds.some(f => !ids(f.batchIds, true) || typeof f.complete !== "boolean"
    || f.pending !== undefined && !ids(f.pending, false) || f.cleared !== undefined && !ids(f.cleared, false)))
    throw Error("QUALITY_BATCH: searches are numbered from one and name their batches once");
  const found = [...new Set(finds.flatMap(f => f.batchIds))];
  // Only a complete search decides, and only a batch the round found or read as its own.
  const decides = (decision: QualityBatchDecision, complete: boolean) => complete && Number.isSafeInteger(decision.claim)
    && (decision.kind === "presumed" || decision.kind === "submitted" && (found.includes(decision.batchId) || of("reading").some(r => r.batchId === decision.batchId)));
  if (finds.some(f => f.decision && !decides(f.decision, f.complete)))
    throw Error("QUALITY_BATCH: a search decides only when it is complete, and only a batch the round found");
  // Rule 6: a batch is read once for good; a later read that returned anything else is a charge of its own, never a decision.
  const readings: Record<string, readonly QualityBatchReceipt[]> = Object.create(null) as Record<string, readonly QualityBatchReceipt[]>;
  for (const reading of of("reading")) {
    // A search records what it read before the batch it proved, so a reading may stand before (or without) its `found`.
    if (typeof reading.batchId !== "string" || !reading.batchId || !Array.isArray(reading.results) || readings[reading.batchId])
      throw Error("QUALITY_BATCH: a batch is read once, for good");
    readings[reading.batchId] = reading.results;
  }
  const read = Object.keys(readings);
  const terminal = terminals[0] ?? null;
  if (terminal?.kind === "answered" && (!submitted[0] || terminal.batchId !== submitted[0].batchId))
    throw Error("QUALITY_BATCH: an answer from a batch this round never recorded");
  if (terminal?.kind === "fallback" && (terminal.batchId === null ? !!submitted[0] : terminal.batchId !== submitted[0]?.batchId))
    throw Error("QUALITY_BATCH: a fallback from a batch this round never recorded");
  if (terminal?.kind === "fallback" && terminal.batchId === null && (terminal.resultType === "presumed-lost") !== !!presumed[0])
    throw Error("QUALITY_BATCH: a round falls back as presumed lost exactly when it presumed its create lost");
  if (terminal?.kind === "answered" && terminal.evidence?.amountMicroUsd !== terminal.amountMicroUsd)
    throw Error("QUALITY_BATCH: an answer settles the charge it states");
  if (terminal?.kind === "held" && (!["zero", "unknown", "known"].includes(terminal.charge) || terminal.charge === "zero" && typeof terminal.resultType !== "string"
    || terminal.charge === "known" && (terminal.batchId === undefined || !Array.isArray(terminal.results)
      || !Number.isSafeInteger(terminal.evidence?.amountMicroUsd) || terminal.evidence!.amountMicroUsd < 0)
    || terminal.batchId !== undefined && terminal.batchId !== submitted[0]?.batchId))
    throw Error("QUALITY_BATCH: a hold states its charge, and reads only the round's batch");
  // Unsent means no create reached the provider, so no search ever ran: a round that found or read a copy is never closed unsent.
  if ((found.length || read.length) && (closing.length || terminal?.kind === "fallback" && terminal.batchId === null && terminal.resultType !== "presumed-lost"))
    throw Error("QUALITY_BATCH: a round that found a copy of its question never ends unsent");
  if (closing.length && terminal && (terminal.kind !== "fallback" || terminal.batchId !== null)) throw Error("QUALITY_BATCH: a closed round can only fall back unsent");
  // A batch read is a batch of the round (rule 6), even one a search read and stopped before recording.
  const batchIds = [...new Set([...submitted.map(s => s.batchId), ...found, ...read])];
  // Rule 5: every batch's bill is in the record, once, before it may be deleted: the round's own batch by the
  // outcome that read it, every other copy of a finished round afterwards.
  const own = terminal?.batchId ?? null;
  const lates = of("late").sort((a, b) => a.n - b.n), lateIds = lates.map(l => l.batchId);
  if (!numbered(lates) || new Set(lateIds).size !== lateIds.length || lates.some(l => !terminal || !batchIds.includes(l.batchId) || l.batchId === own
    || !Array.isArray(l.results) || l.amountMicroUsd !== null && !(Number.isSafeInteger(l.amountMicroUsd) && l.amountMicroUsd >= 0)))
    throw Error("QUALITY_BATCH: another copy of a finished round is read once, and only one the round knows");
  const billedIds = [...(own ? [own] : []), ...lateIds];
  if (!numbered(deletions) || deletions.some(d => !ids(d.batchIds, false) || d.batchIds.some(id => !billedIds.includes(id))))
    throw Error("QUALITY_BATCH: a deletion names a batch whose bill is not in the record");
  const rereads = of("reread");
  if (rereads.some(r => !readings[r.batchId] || !/^[a-f0-9]{16}$/.test(r.digest) || !Array.isArray(r.results)
    || qualityBatchCanonicalJson(r.results) === qualityBatchCanonicalJson(readings[r.batchId])))
    throw Error("QUALITY_BATCH: a reread is another reading of a batch already read");
  if (lates.some(l => readings[l.batchId] && qualityBatchCanonicalJson(l.results) !== qualityBatchCanonicalJson(readings[l.batchId])))
    throw Error("QUALITY_BATCH: a copy's bill is its recorded reading");
  const cancel = events.find((e): e is Extract<QualityBatchEvent, { kind: "cancel" }> => e.kind === "cancel");
  const completeAt = finds.filter(f => f.complete).map(f => f.at);
  // A batch read but never recorded was read by a search that stopped before recording what it found, maybe undecided.
  const unfound = read.filter(id => !found.includes(id) && id !== submitted[0]?.batchId);
  // Rule 1: a batch a search could not decide stays pending, in the order the searches were recorded, until one decides it:
  // proves it (it is then the round's), or clears it. Whatever order concurrent searches land in, none forgets it.
  const undecided = new Set<string>();
  for (const f of finds) { for (const id of f.pending ?? []) undecided.add(id); for (const id of f.cleared ?? []) undecided.delete(id); }
  const pending = [...undecided].filter(id => !batchIds.includes(id));
  return { intent, claims, refusals, submitted: submitted[0] ?? null, presumed: presumed[0] ?? null, cancelAt: cancel?.at ?? null, terminal, found,
    searches: finds.length, searchComplete: (finds.at(-1)?.complete ?? false) && !unfound.length && !pending.length,
    completeSearchAt: completeAt.length ? Math.max(...completeAt) : null,
    lates, lateIds, billedIds, batchIds, unfound, pending, deletedIds: [...new Set(deletions.flatMap(d => d.batchIds))], deletions: deletions.length, readings, rereads };
}

export type QualityBatchStep =
  | { readonly step: "done"; readonly terminal: QualityBatchTerminal }
  | { readonly step: "create"; readonly claim: number }
  | { readonly step: "wait"; readonly reason: string }
  | { readonly step: "find"; readonly sinceMs: number; readonly untilMs: number }
  | { readonly step: "poll"; readonly batchId: string; readonly cancelDue: boolean }
  /** End the round unsent; `claim`: the claim to take first, null when it is already taken. */
  | { readonly step: "fallback-unsent"; readonly claim: number | null; readonly reason: string }
  /** The create is presumed lost: count its charge at the most it could be, then fall back. */
  | { readonly step: "presumed"; readonly reason: string }
  | { readonly step: "duplicates"; readonly reason: string }
  | { readonly step: "hold"; readonly reason: string };

/** What this round may do now. */
export function nextQualityBatchStep(round: QualityBatchRound, now: number): QualityBatchStep {
  if (round.terminal) return { step: "done", terminal: round.terminal };
  // Once the create is presumed lost, copies found beside the presumption are read for their bills after it (rule 5).
  if (round.presumed) return { step: "presumed", reason: "the create did not answer and no complete search found its batch" };
  if (round.batchIds.length > 1) return { step: "duplicates", reason: `${round.batchIds.length} batches carry this one question` };
  if (round.submitted) return { step: "poll", batchId: round.submitted.batchId, cancelDue: now >= round.intent.deadlineAt };
  const last = round.claims.at(-1);
  if (last?.closing) return { step: "fallback-unsent", claim: null, reason: "the round was being closed unsent" };
  if (!last) return { step: "create", claim: 1 };
  const refused = round.refusals.find(r => r.n === last.n);
  if (refused) {
    if (!refused.transient) return { step: "hold", reason: `the batch create was refused (${refused.status}${refused.errorType ? ` ${refused.errorType}` : ""})` };
    // Every create so far was refused outright: nothing reached the provider.
    if (round.refusals.length === round.claims.length && now >= round.intent.deadlineAt)
      return { step: "fallback-unsent", claim: last.n + 1, reason: `no batch was ever created before the deadline (${round.refusals.length} refused creates)` };
    if (now - refused.at < QUALITY_BATCH_REFUSAL_BACKOFF_MS) return { step: "wait", reason: "a refused create waits out its backoff" };
    return { step: "create", claim: last.n + 1 };
  }
  if (now - last.at < QUALITY_BATCH_CREATE_GRACE_MS) return { step: "wait", reason: "a create may still be in flight" };
  return { step: "find", ...qualityBatchSearchWindow(round) };
}

/** When a batch carrying this round's question can have been created: from its intent to the grace after its
 * last claim, the one create that may have reached the provider (rule 1). A batch created later is not a copy. */
export function qualityBatchSearchWindow(round: QualityBatchRound): { readonly sinceMs: number; readonly untilMs: number } {
  return { sinceMs: round.intent.intentAt, untilMs: (round.claims.at(-1)?.at ?? round.intent.intentAt) + QUALITY_BATCH_CREATE_GRACE_MS };
}

/** Whether the round ended presuming its create lost. */
export const qualityBatchPresumedLost = (round: QualityBatchRound) =>
  !!round.presumed && round.terminal?.kind === "fallback" && round.terminal.resultType === "presumed-lost";

/**
 * Whether a finished round still searches for copies of its question (rule 5): any finished round while a batch a
 * search could not decide is pending, or one a search read is unrecorded; a held round while its latest search was
 * unfinished; and a presumed-lost round once, a day after the presumption, when any batch its create made has ended
 * and is listed.
 */
export function qualityBatchSearching(round: QualityBatchRound, now: number): boolean {
  if (!round.terminal) return false;
  // What a search saw and could not decide is searched for until it is decided, whatever the round's outcome: a batch it
  // could not decide, or one it read and stopped before recording (that search may have been undecided too).
  if (round.pending.length > 0 || round.unfound.length > 0) return true;
  // A hold made while a search was unfinished (over two copies, or as the twelfth round's provider fault) searches on until a
  // complete search; a hold no search came before (a refused create, an answer that could not be priced or delivered) has
  // nothing to find.
  if (round.terminal.kind === "held") return round.searches > 0 && !round.searchComplete;
  if (!qualityBatchPresumedLost(round)) return false;
  const due = round.presumed!.at + QUALITY_BATCH_LATE_SEARCH_MS;
  return now >= due && !(round.completeSearchAt !== null && round.completeSearchAt >= due);
}

/** Copies of a finished round whose bill is not yet in the record: each is read before it may be deleted (rule 5). */
export function qualityBatchLateDue(round: QualityBatchRound): readonly string[] {
  return round.terminal ? round.batchIds.filter(id => !round.billedIds.includes(id)) : [];
}

/** Batches of a finished round that may be deleted at the provider now: each with its bill in the record. */
export function qualityBatchDeletable(round: QualityBatchRound, gameDeleted: boolean): readonly string[] {
  if (!round.terminal || round.terminal.kind === "held" && !gameDeleted) return [];
  return round.batchIds.filter(id => round.billedIds.includes(id) && !round.deletedIds.includes(id));
}

/**
 * Which of a round's copies housekeeping starts with (`length` of them) at `now`: a different one each
 * minute, by a hash of the round and the minute. A rotation of rounds that visits this one every k-th
 * minute could otherwise meet the same copy first each time, and a copy whose calls keep timing out would
 * then keep the others waiting for good.
 */
export function qualityBatchCopyStart(roundId: string, length: number, now: number): number {
  if (length <= 1) return 0;
  let hash = 0x811c9dc5;
  for (const char of `${roundId}:${Math.floor(now / 60_000)}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  // A final mix, so every bit depends on every character: FNV's low bit alone follows the characters' parity, which
  // made two choices salted differently (the copies' order and the phases' turn) move in lockstep.
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13; hash = Math.imul(hash, 0xc2b2ae35); hash ^= hash >>> 16;
  return (hash >>> 0) % length;
}

/**
 * A reading's canonical text: object keys sorted at every depth (a key whose value is undefined left out, as JSON
 * leaves it out), arrays in their order. The same values read twice give the same text, whatever order the provider
 * serialised them in; a null stays distinct from a missing key.
 */
export function qualityBatchCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => qualityBatchCanonicalJson(item ?? null)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${qualityBatchCanonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Whether the provider's copies of a finished round are still to be deleted (rule 5). */
export function qualityBatchCleanupDue(round: QualityBatchRound, gameDeleted: boolean): boolean {
  return qualityBatchDeletable(round, gameDeleted).length > 0;
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

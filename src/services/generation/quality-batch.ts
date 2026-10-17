import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { anthropicVisualReviewBody, readAnthropicVisualReview } from "../../infra/generation/anthropic-visual-review";
import { visualReviewBatchCharge } from "../../infra/generation/visual-review-pricing";
import { QualityBatchRefused, type QualityBatchFound, type QualityBatchResult, type QualityBatchTransport } from "../../infra/generation/types";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import {
  QUALITY_BATCH_VERSION, decideQualityBatchResults, nextQualityBatchStep, qualityBatchBill, qualityBatchCanonicalJson, qualityBatchCleanupDue, qualityBatchCopyStart, qualityBatchDeletable,
  qualityBatchEventName, qualityBatchLateDue, qualityBatchReserveMicroUsd, qualityBatchRoundOf, qualityBatchSearchWindow, qualityBatchSearching,
  type QualityBatchDecision, type QualityBatchEvent, type QualityBatchIntent, type QualityBatchReceipt, type QualityBatchRound,
} from "../../domain/generation/quality-batch-round";
import { visualReviewPolicy } from "../../domain/generation/visual-review-policy";
import type { PreparedVisualReview } from "./visual-review";
import { canonicalChargeEvidence, sameChargeEvidence, WorldBudgetError, type BudgetJson, type WorldChargeEvidence } from "./world-budget";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import { fenceLocalPatchImages, LocalPatchDeleted, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { inventorySelfRepairRequest } from "./local-patch-self-repair";
import { RETAINED_PURCHASE_VERSION, retainedPayloadDigest, type PurchaseLedger } from "./paid-operation";
import { qualityChannelOf } from "./quality-channel";

/**
 * The Opus scene-quality question of a game pinned to Message Batches
 * (quality-channel.ts): asked in a batch, waited for across worker slices, and
 * delivered to the dual review as an answer it already paid for.
 *
 * Two ledger keys per question, so that nothing downstream changes:
 *  - the BATCH key (`self-repair:batch:<board>:<fingerprint>`) is reserved before
 *    the batch is created and settles at the price of the tier that served it;
 *  - the dual review's own key (`self-repair:board:<board>:<fingerprint>`) is then
 *    written as a LINKED alias of the batch key's charge: the identical bill,
 *    counted once, holding no capacity. `purchaseOnce` replays it like any answer
 *    already bought, and every check of a dual stage holds as it does today.
 * A batch result the provider documents as unbilled settles the batch key at zero
 * and leaves the dual review's key untouched, so the dual review asks the same
 * question synchronously, exactly as it does for every unpinned game.
 *
 * The round's record is append-only AuditLog rows (quality-batch-round.ts); a
 * row's id makes each transition happen once. No schema change.
 */
export const QUALITY_BATCH_ACTION = "generation:quality-batch";
export const qualityBatchKeyOf = (board: string, fingerprint: string) => `self-repair:batch:${board}:${fingerprint}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const roundIdOf = (worldId: string, batchKey: string) => `qb${sha(JSON.stringify([QUALITY_BATCH_VERSION, worldId, batchKey])).slice(0, 30)}`;
const customIdOf = (roundId: string, batchKey: string) => `q${sha(JSON.stringify([roundId, batchKey])).slice(0, 40)}`;
const eventId = (roundId: string, name: string) => `aud_qb_${roundId}_${name}`;
const EVENT_ID = /^aud_qb_(qb[a-f0-9]{30})_([a-z0-9-]+)$/;
/** Room a create needs in the worker's request: about 5 MB of evidence up, an id back. */
export const QUALITY_BATCH_CREATE_NEED_MS = 100_000;
/** Room one poll or reconciliation needs. */
const POLL_NEED_MS = 35_000;
/** Room for one more provider call: its 30-second timeout, and a second to keep what it returns. */
const CALL_NEED_MS = 31_000;
/** Room for the create call itself: its 90-second timeout, and a second to record its answer. */
const CREATE_CALL_NEED_MS = 91_000;
/** A sweep round's own budget for its calls, from its start: three reads of up to 30 seconds. */
export const QUALITY_BATCH_SWEEP_ROUND_MS = 95_000;
const CHANNEL = "anthropic-message-batches";
const POLICY = visualReviewPolicy("scene-quality", "high");

type Fence = (tx: Prisma.TransactionClient) => Promise<void>;
export type QualityBatchGate = { readonly kind: "proceed" } | { readonly kind: "waiting"; readonly reason: string } | { readonly kind: "held"; readonly reason: string };
const proceed: QualityBatchGate = { kind: "proceed" };
const waiting = (reason: string): QualityBatchGate => ({ kind: "waiting", reason: `Quality question in Message Batches: ${reason}` });
type Context = {
  readonly c: Container; readonly transport: QualityBatchTransport; readonly gameId: string;
  /** The slice's lease fence; null only for a game that is no longer generating. */
  readonly fence: Fence | null;
  /** The question itself, needed only to create a batch. */
  readonly question: PreparedVisualReview | null;
  /** The game is not generating: cancel now, never create, link or fall back. */
  readonly stopping: boolean;
  /** For a stopping context: whether the game is still not generating, read again before an action
   * a resumed game's own worker would not take (a cancel, closing the round). */
  readonly stillStopped?: () => Promise<boolean>;
  /** No provider call starts unless it can finish before this. */
  readonly deadlineAt?: number;
};
const roomFor = (ctx: Pick<Context, "deadlineAt">, needMs: number) => ctx.deadlineAt === undefined || ctx.deadlineAt - Date.now() >= needMs;
const stillStopped = async (ctx: Context) => !ctx.stillStopped || await ctx.stillStopped();

/** The Messages params a batch request carries: the synchronous body without its tier. */
export function qualityBatchParams(question: PreparedVisualReview): Record<string, unknown> {
  if (question.role !== "scene-quality" || question.policy.provider !== "anthropic" || question.policy.model !== POLICY.model || question.effort !== "high")
    throw Error("QUALITY_BATCH: only the Opus HIGH scene-quality question is batched");
  return anthropicVisualReviewBody({ prompt: question.prompt, images: question.images, imageLabels: question.labels, effort: question.effort,
    maxOutputTokens: question.policy.maxOutputTokens }, null);
}

type RoundRow = { readonly id: string; readonly actorType: string; readonly actorId: string | null; readonly metaJson: string | null };
/** Every round of one game, by round id, oldest event first. A record that cannot be read is refused, not skipped. */
async function gameRounds(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<Map<string, QualityBatchEvent[]>> {
  return roundsOf(await db.auditLog.findMany({ where: { action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }), gameId);
}
/** The same, from one game's rows already read (oldest first). */
function roundsOf(rows: readonly RoundRow[], gameId: string): Map<string, QualityBatchEvent[]> {
  const rounds = new Map<string, QualityBatchEvent[]>();
  for (const row of rows) {
    const match = EVENT_ID.exec(row.id);
    let event: QualityBatchEvent | null = null;
    try { event = JSON.parse(row.metaJson ?? "null"); } catch { /* refused below */ }
    if (!match || !event || typeof event !== "object" || row.actorType !== "SYSTEM" || row.actorId !== null || eventId(match[1]!, qualityBatchEventName(event)) !== row.id
      || (event.kind === "intent" && (event.intent?.roundId !== match[1] || event.intent?.gameId !== gameId)))
      throw Error("QUALITY_BATCH: a round record cannot be read; refusing to guess");
    rounds.set(match[1]!, [...rounds.get(match[1]!) ?? [], event]);
  }
  return rounds;
}

/**
 * Every write of a round takes the round's intent row first, with a write that changes nothing: the writes of one
 * round are serialized in the database, so an event built in the same transaction (`writeFromRound`) is built from
 * the round as every write committed before it left it, and no other write of the round can land between that read
 * and its own write. (The intent row has no automatic timestamp; nothing about it changes.)
 */
async function lockRound(tx: Prisma.TransactionClient, roundId: string) {
  await tx.auditLog.updateMany({ where: { id: eventId(roundId, "intent"), actorType: "SYSTEM" }, data: { actorType: "SYSTEM" } });
}

/** Written once. A second writer of the same event is refused by its id and gets the one that won. */
async function writeEvent(ctx: Pick<Context, "c" | "gameId" | "fence">, roundId: string, event: QualityBatchEvent): Promise<{ event: QualityBatchEvent; won: boolean }> {
  return (await writeFromRound(ctx, roundId, () => event, false))!;
}

/**
 * Writes the event `build` makes from the round as it stands inside the write's own transaction, the round's writes
 * serialized (`lockRound`): what it is built from cannot change before it is written. `build` returns null when there
 * is nothing to write; `read`: whether it needs the round at all. The event's name is still its compare-and-set: a
 * second writer of it gets the one that won.
 */
async function writeFromRound(ctx: Pick<Context, "c" | "gameId" | "fence">, roundId: string,
  build: (round: QualityBatchRound) => QualityBatchEvent | null, read = true): Promise<{ event: QualityBatchEvent; won: boolean } | null> {
  const built: { event: QualityBatchEvent | null } = { event: null };
  try {
    await ctx.c.db.$transaction(async tx => {
      await lockRound(tx, roundId);
      if (ctx.fence) { await fenceLocalPatchImages(tx, ctx.gameId); await ctx.fence(tx); }
      let round: QualityBatchRound | null = null;
      if (read) {
        const events = (await gameRounds(tx, ctx.gameId)).get(roundId);
        if (!events) throw Error("QUALITY_BATCH: the round disappeared");
        round = qualityBatchRoundOf(events);
      }
      const event = built.event = build(round!);
      if (event) await tx.auditLog.create({ data: { id: eventId(roundId, qualityBatchEventName(event)), actorType: "SYSTEM", action: QUALITY_BATCH_ACTION,
        entityType: "Game", entityId: ctx.gameId, metaJson: JSON.stringify(event) } });
    });
    return built.event ? { event: built.event, won: true } : null;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || !built.event) throw error;
    const existing = await ctx.c.db.auditLog.findUniqueOrThrow({ where: { id: eventId(roundId, qualityBatchEventName(built.event)) } });
    return { event: JSON.parse(existing.metaJson!) as QualityBatchEvent, won: false };
  }
}

async function readRound(ctx: Context, roundId: string): Promise<QualityBatchRound> {
  const events = (await gameRounds(ctx.c.db, ctx.gameId)).get(roundId);
  if (!events) throw Error("QUALITY_BATCH: the round disappeared");
  return qualityBatchRoundOf(events);
}

/** The reservation a create needs. A missing one proves no create was ever made for this round. */
async function ensureReserved(ctx: Context, intent: QualityBatchIntent): Promise<QualityBatchGate | null> {
  const budget = boardWizardBudgetOf(ctx.c), held = await budget.readRequest(intent.worldId, intent.batchKey);
  if (!held) {
    // In deletion's inventory before anything can be reserved, sent or kept under the key:
    // a reservation always has its entry, whatever stopped a worker before this point.
    await inventorySelfRepairRequest(ctx.c, ctx.gameId, intent.batchKey, ctx.fence ?? (async () => {}));
    await budget.reserve(intent.worldId, { requestKey: intent.batchKey, scope: "judge", operationFingerprint: intent.fingerprint, reserveMicroUsd: intent.batchReserveMicroUsd });
    return null;
  }
  if (held.state !== "pending" || held.scope !== "judge" || held.operationFingerprint !== intent.fingerprint || held.reserveMicroUsd !== intent.batchReserveMicroUsd)
    return { kind: "held", reason: `${intent.batchKey} is ${held.state} with other terms: not this round's reservation` };
  return null;
}

/** A documented-unbilled outcome, recorded as what it is: zero, from the provider's own statement. */
async function settleUnbilled(ctx: Context, intent: QualityBatchIntent, batchId: string | null, resultType: string, errorType: string | null) {
  const rawUsage = { resultType, errorType, batchId, customId: intent.customId,
    basis: batchId ? "documented unbilled batch result" : "every create was refused before a batch existed" };
  await boardWizardBudgetOf(ctx.c).settle(intent.worldId, intent.batchKey, canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace,
    providerRequestId: `${batchId ?? "unsent"}/${intent.customId}`, usageId: sha(JSON.stringify(rawUsage)), rawUsage, model: intent.model,
    amountMicroUsd: 0, costBasis: "provider-billed" }), ONLY_PENDING);
}
/** An outcome moves only a reservation still pending when its own write runs: never one another writer has settled or held. */
const ONLY_PENDING = { onlyPending: true } as const;

/**
 * A create presumed lost (rule 1): its charge counted at the most the batch rate could bill, as a
 * conservative upper estimate, and never released. A copy that turns up later is read for its bill
 * before it is deleted, and a bill above this one holds the world (`lateCharge`). The evidence is the
 * round's own, the same for every pass, so a second settlement is the same charge.
 */
async function settlePresumed(ctx: Context, round: QualityBatchRound) {
  const { intent } = round;
  const rawUsage = { basis: "a create that did not answer and that no complete search of the provider's batches found: counted at the most it could be billed",
    customId: intent.customId, claim: round.presumed!.n };
  await boardWizardBudgetOf(ctx.c).settle(intent.worldId, intent.batchKey, canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace,
    providerRequestId: `presumed/${intent.customId}`, usageId: sha(JSON.stringify(rawUsage)), rawUsage, model: intent.model,
    amountMicroUsd: intent.batchReserveMicroUsd, costBasis: "conservative-upper-estimate" }), ONLY_PENDING);
}

/**
 * The ledger as the round's terminal outcome says it must be (rule 0). Applied right after the outcome is
 * written, and again by any pass that reads it, since a worker can stop in between: a reservation that
 * committed after a close, by a worker that stopped before settling it, is settled here too. Only a pending
 * reservation is ever changed, checked in the write's own transaction (`ONLY_PENDING`; marking unknown
 * never reopens a settled charge): once settled or held, the batch key is what it was made, so a pass
 * that decided otherwise from an older read never moves money. The reads before it only save writes.
 */
async function applyTerminal(ctx: Context, round: QualityBatchRound, keys?: ReadonlySet<string>) {
  const { intent } = round, terminal = round.terminal!, budget = boardWizardBudgetOf(ctx.c);
  if (keys && !keys.has(intent.batchKey)) return;
  const bill = outcomeBill(ctx, round);
  if ((await budget.readRequest(intent.worldId, intent.batchKey))?.state === "pending") {
    // An answer's charge, or a held answer's (one that cannot be delivered): the bill its reading states, in full.
    if (bill) await budget.settle(intent.worldId, intent.batchKey, bill, ONLY_PENDING);
    else if (terminal.kind === "fallback" && terminal.resultType === "presumed-lost") await settlePresumed(ctx, round);
    else if (terminal.kind === "fallback") await settleUnbilled(ctx, intent, terminal.batchId, terminal.resultType, terminal.errorType);
    else if (terminal.kind === "held" && terminal.charge === "zero") await settleUnbilled(ctx, intent, terminal.batchId ?? null, terminal.resultType!, terminal.errorType ?? null);
    // Held with the charge unknown, in full: the world reserves nothing more until a person reconciles it.
    else if (terminal.kind === "held") await budget.markUnknown(intent.worldId, intent.batchKey, `quality batch ${intent.roundId}: ${terminal.reason}`);
  }
  // A bill the outcome states is counted in full whoever holds the key: above a hold another writer made, by its own row.
  if (bill) await countAboveHold(ctx, round, bill);
}

/** The bill a round's outcome states in full, if any: an answer's charge, or a held answer's first reading priced exactly
 * as its delivery would be (a record of the fourteenth round held such an answer as unknown; its bill is the same). */
function outcomeBill(ctx: Context, round: QualityBatchRound): WorldChargeEvidence | null {
  const terminal = round.terminal!;
  if (terminal.kind === "answered") return terminal.evidence;
  if (terminal.kind !== "held" || !terminal.results || terminal.charge === "zero") return null;
  if (terminal.charge === "known") return terminal.evidence!;
  return decideReading(terminal.results, round.intent.customId).decision === "answer" ? answerCharge(ctx, terminal.results) : null;
}

/**
 * A bill an outcome states, above what a hold another writer made on the batch key counts (rule 0): the difference is
 * recorded as an unknown row of its own, named after the bill, so the ledger never counts less than the record states,
 * and the other writer's hold stands as it was made. A person reconciles the row with the key. A key that is settled is
 * a settlement of its one batch, whoever made it, and is left as it is.
 */
async function countAboveHold(ctx: Context, round: QualityBatchRound, bill: WorldChargeEvidence) {
  const { intent } = round, budget = boardWizardBudgetOf(ctx.c);
  const key = await budget.readRequest(intent.worldId, intent.batchKey);
  if (key?.state !== "unknown" || key.reserveMicroUsd >= bill.amountMicroUsd) return;
  await budget.recordUnknown(intent.worldId, { requestKey: qualityBatchAboveHoldKeyOf(intent.batchKey, bill), scope: "judge", operationFingerprint: intent.fingerprint,
    reserveMicroUsd: bill.amountMicroUsd - key.reserveMicroUsd, reason: `quality batch ${intent.roundId}: its outcome's bill of ${bill.amountMicroUsd} micro-USD `
      + `(${bill.providerRequestId}) is above the ${key.reserveMicroUsd} its batch key holds as unknown; reconcile this row with that key` });
}
/** The ledger key of the part of an outcome's bill above an unknown hold on its batch key: one per bill. */
export const qualityBatchAboveHoldKeyOf = (batchKey: string, bill: WorldChargeEvidence) => `${batchKey}:above-hold:${sha(qualityBatchCanonicalJson(bill))}`;

/**
 * Nothing of this round ever reached the provider: zero, and the round ends (rule 4).
 * The close first takes the claim a create would take (`claim`; null when it already
 * holds it): a worker that resumed the game and claimed it keeps its create, and the
 * close stands down. Settling at zero is safe only once no create can follow.
 */
async function closeUnsent(ctx: Context, round: QualityBatchRound, claim: number | null): Promise<QualityBatchGate | "advanced"> {
  if (claim !== null) {
    const taken = await writeEvent(ctx, round.intent.roundId, { kind: "claim", n: claim, at: Date.now(), closing: true });
    if (!taken.won) return waiting("a worker claimed this question's create first; the round is not closed");
  }
  await writeEvent(ctx, round.intent.roundId, { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: Date.now() });
  return "advanced";
}

/** Keeps for good every batch a search proved to carry the question, every batch it could not decide (`pending`, by
 * its id, until a later search decides it), the pending batches it decided carry no copy (`cleared`), and whether
 * the search was complete (`complete` is recorded on its own only for a finished round still searching); `at`: when
 * the search started. A batch an earlier search read and stopped before recording is kept with it (its reading proved
 * it). `decide` (the open round's search): when the record it writes leaves one batch or none, with nothing pending
 * and the search complete, it records what the round's batch is with it (rule 1). The record, and the decision, are
 * built from the round as it stands inside their own write, the round's writes serialized: whatever any pass recorded
 * before (a batch, its reading, a candidate, another decision) is in what the decision sees, and nothing can be recorded
 * between that read and the decision. */
async function recordFound(ctx: Context, roundId: string, found: QualityBatchFound, at: number, decide = false): Promise<QualityBatchRound> {
  const complete = !found.undecided;
  const written = await writeFromRound(ctx, roundId, round => {
    const fresh = [...new Set([...found.proven, ...round.unfound])].filter(id => !round.found.includes(id));
    const pending = [...new Set(found.pending ?? [])].filter(id => !round.batchIds.includes(id) && !fresh.includes(id) && !round.pending.includes(id));
    const cleared = [...new Set(found.cleared ?? [])].filter(id => round.pending.includes(id));
    // The round as this record leaves it: its batches, and those still pending.
    const batches = [...new Set([...round.batchIds, ...fresh])];
    const undecided = [...new Set([...round.pending, ...pending])].filter(id => !cleared.includes(id) && !batches.includes(id));
    const claim = round.claims.at(-1);
    const decision: QualityBatchDecision | null = decide && complete && claim && !round.submitted && !round.presumed && !undecided.length && batches.length <= 1
      ? batches.length === 1 ? { kind: "submitted", claim: claim.n, batchId: batches[0]! } : { kind: "presumed", claim: claim.n } : null;
    if (!fresh.length && !pending.length && !cleared.length && !decision && !(complete && qualityBatchSearching(round, at))) return null;
    return { kind: "found", n: round.searches + 1, batchIds: fresh, complete, at,
      ...pending.length ? { pending } : {}, ...cleared.length ? { cleared } : {}, ...decision ? { decision } : {} };
  });
  if (written && !written.won) throw Error("QUALITY_BATCH: the batches a search found could not be recorded");
  return readRound(ctx, roundId);
}

/** Records batches deleted at the provider; the same numbering as `recordFound`. */
async function recordDeleted(ctx: Context, roundId: string, removed: readonly string[]) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const round = await readRound(ctx, roundId), fresh = removed.filter(id => !round.deletedIds.includes(id));
    if (!fresh.length) return;
    if ((await writeEvent({ ...ctx, fence: null }, roundId, { kind: "deleted", n: round.deletions + 1, batchIds: fresh, at: Date.now() })).won) return;
  }
  throw Error("QUALITY_BATCH: a deletion at the provider could not be recorded");
}

async function create(ctx: Context, round: QualityBatchRound, claim: number): Promise<QualityBatchGate | "advanced"> {
  if (ctx.stopping || !ctx.question) return waiting("the next create belongs to this question's own review");
  if (ctx.deadlineAt !== undefined && ctx.deadlineAt - Date.now() < QUALITY_BATCH_CREATE_NEED_MS) return waiting("too little of this request is left to create the batch");
  const params = qualityBatchParams(ctx.question);
  if (sha(JSON.stringify(params)) !== round.intent.paramsSha256 || ctx.question.fingerprint !== round.intent.fingerprint)
    throw Error("QUALITY_BATCH: the question differs from its round's intent");
  const blocked = await ensureReserved(ctx, round.intent);
  if (blocked) return blocked;
  // A close may have taken this create's claim while the reservation was being made, and read the ledger
  // before it committed (rule 4): nothing is ever sent under a closing claim. The round goes on to its
  // never-created outcome, which settles this reservation at zero.
  if ((await readRound(ctx, round.intent.roundId)).claims.some(c => c.closing)) return "advanced";
  // Room for the whole create, read again after the ledger's work and again after the claim.
  if (!roomFor(ctx, CREATE_CALL_NEED_MS)) return waiting("too little of this request is left to create the batch");
  // The claim before the create: of two workers only one sends it.
  const claimed = await writeEvent(ctx, round.intent.roundId, { kind: "claim", n: claim, at: Date.now() });
  if (!claimed.won) return waiting("another worker claimed this create");
  if (!roomFor(ctx, CREATE_CALL_NEED_MS)) {
    // Claimed and never sent: recorded as what it is, nothing created, so the next pass may claim again.
    await writeEvent(ctx, round.intent.roundId, { kind: "refused", n: claim, at: Date.now(), status: 0, errorType: "not-sent", transient: true });
    return waiting("too little of this request was left to send the create");
  }
  let batchId: string;
  try { ({ batchId } = await ctx.transport.create([{ customId: round.intent.customId, params }])); }
  catch (error) {
    if (!(error instanceof QualityBatchRefused)) return waiting(`the create's answer was lost (${error instanceof Error ? error.message.slice(0, 200) : "unknown"}); `
      + "after its grace, a search of the provider's batches decides");
    await writeEvent(ctx, round.intent.roundId, { kind: "refused", n: claim, at: Date.now(), status: error.status, errorType: error.errorType, transient: error.transient });
    return "advanced";
  }
  // Recorded only while nothing has decided what the round's batch is: one decision per round (rule 1), checked in the
  // write's own transaction. (A create answers within its timeout, long before any search may decide; this never skips.)
  await writeFromRound(ctx, round.intent.roundId, now => now.submitted || now.presumed ? null : { kind: "submitted", n: claim, batchId, at: Date.now() });
  return "advanced";
}

/** What the provider returned for this round's question in one batch, as kept in the record: never the answer itself. */
function receiptsOf(results: readonly QualityBatchResult[], customId: string): QualityBatchReceipt[] {
  return results.filter(r => r.customId === customId).map(r => {
    if (r.type !== "succeeded") return { type: r.type === "unrecognized" ? `unrecognized:${r.resultType ?? "none"}` : r.type,
      errorType: r.type === "errored" ? r.errorType : null, requestId: null, model: null, usage: null };
    const reading = readAnthropicVisualReview(POLICY, { ok: true, requestId: null }, r.message);
    // The answer by its digest alone: another answer under the same bill is another reading, never delivered as this one.
    return { type: r.type, errorType: null, requestId: reading.requestId, model: reading.model, usage: reading.usage ?? null,
      answerSha256: sha(qualityBatchCanonicalJson(r.message)) };
  });
}
/** How a reading of a batch settles this round's question (rule 3), from the reading alone. */
const decideReading = (receipts: readonly QualityBatchReceipt[], customId: string) =>
  decideQualityBatchResults(receipts.map(r => ({ customId, type: r.type, errorType: r.errorType })), customId);
/** Whether two readings state one bill (their answers aside): one charge, never counted twice. */
const sameBill = (a: readonly QualityBatchReceipt[], b: readonly QualityBatchReceipt[]) =>
  qualityBatchCanonicalJson(qualityBatchBill(a)) === qualityBatchCanonicalJson(qualityBatchBill(b));

/** Keeping an answer before its outcome is written: the outcome, not the store, records its charge (rule 0).
 * (For a deleted game the store would settle or hold the charge itself, before any outcome existed.) */
const OUTCOME_LEDGER: Pick<PurchaseLedger, "settle" | "markUnknown"> = { settle: async () => undefined, markUnknown: async () => undefined };

/** One ended batch's result for this round: its reading recorded first (rule 6), then, from that reading only,
 * its terminal outcome (rule 0): answered, at zero, or held. The ledger follows from the outcome; an answer is
 * retained before it is recorded. A read that returned anything else than the batch's recorded reading is a
 * provider fault, counted and recorded (`noteReading`) and never decided from: the outcome is still the recorded
 * reading's, and an answer whose content this read does not give is held for a person. */
async function reconcile(ctx: Context, round: QualityBatchRound, batchId: string, results: readonly QualityBatchResult[]): Promise<void> {
  const noted = await noteReading(ctx, round, batchId, receiptsOf(results, round.intent.customId));
  await recordOutcome(ctx, round, batchId, noted.recorded, noted.anomaly ? null : results);
}

/**
 * Records what a read of a batch returned for this question (rule 6): a batch's first reading, once and for good,
 * before anything is decided from it. A later read that returned the same is that reading. One that returned
 * anything else is a provider fault, never decided from, and recorded (`reread`). Every bill beyond the batch key's is
 * counted before it is recorded, so the record never holds a charge the ledger has not counted: a finished round's copy
 * before its first reading, and a reread with another bill (one with the same bill and another answer is the same
 * charge) before the reread. A count the ledger refuses is recorded all the same, so what was read is never lost, and
 * raised; every pass that applies the record counts it again.
 */
async function noteReading(ctx: Context, round: QualityBatchRound, batchId: string, receipts: readonly QualityBatchReceipt[]) {
  const roundId = round.intent.roundId;
  // The round as it is now, so a copy bearing an outcome recorded meanwhile is read as that outcome's bill.
  const now = await readRound(ctx, roundId), refused: unknown[] = [];
  const count = async () => {
    try { await lateCharge(ctx, now, batchId, receipts); }
    catch (error) { refused.push(error); }
  };
  if (now.terminal && batchId !== (now.terminal.batchId ?? null) && !now.readings[batchId]) await count();
  const written = await writeEvent({ ...ctx, fence: null }, roundId, { kind: "reading", batchId, results: receipts, at: Date.now() });
  const recorded = (written.event as Extract<QualityBatchEvent, { kind: "reading" }>).results;
  const anomaly = qualityBatchCanonicalJson(recorded) !== qualityBatchCanonicalJson(receipts);
  if (anomaly) {
    if (!sameBill(recorded, receipts) && !refused.length) await count();
    await writeEvent({ ...ctx, fence: null }, roundId, { kind: "reread", batchId, digest: sha(qualityBatchCanonicalJson(receipts)).slice(0, 16), results: receipts, at: Date.now() });
  }
  if (refused.length) throw refused[0];
  return { recorded, anomaly };
}

/**
 * Records what a search proved and saw (rules 1 and 6): first the reading each proven batch was proved by, then the
 * batches, and the batches it could not decide. What a search read or saw is never thrown away: a later read of the
 * batch that says otherwise is a reread, and so is this one when another pass recorded the batch's reading otherwise;
 * a batch it could not decide stays pending until a later search decides it. `decide`: the open round's search, which
 * may decide the round's batch with its record (`recordFound`). A failure is raised once every reading the search
 * holds, and its batches, are recorded.
 */
async function recordSearch(ctx: Context, roundId: string, found: QualityBatchFound, at: number, decide = false): Promise<QualityBatchRound> {
  const round = await readRound(ctx, roundId), failures: unknown[] = [];
  for (const batchId of found.proven) {
    const results = found.results?.[batchId];
    if (!results) continue;
    try { await noteReading(ctx, round, batchId, receiptsOf(results, round.intent.customId)); }
    catch (error) { failures.push(error); }
  }
  const recorded = await recordFound(ctx, roundId, found, at, decide && !failures.length);
  raise(failures);
  return recorded;
}

/**
 * The round's terminal outcome, decided from its batch's recorded reading (rule 6): `results` is this pass's read when
 * it gave that reading, null when it read otherwise. An answer is kept and delivered only from a read that gave it; one
 * whose content this pass does not hold cannot be delivered, and is held for a person at the bill its reading states,
 * in full (unknown only when that bill cannot be priced).
 */
async function recordOutcome(ctx: Context, round: QualityBatchRound, batchId: string, receipts: readonly QualityBatchReceipt[],
  results: readonly QualityBatchResult[] | null): Promise<void> {
  const { intent } = round, decision = decideReading(receipts, intent.customId);
  if (decision.decision === "unbilled-fallback") {
    await writeEvent(ctx, intent.roundId, { kind: "fallback", batchId, resultType: decision.resultType, errorType: decision.errorType, at: Date.now() });
    return;
  }
  if (decision.decision === "unbilled-held" || decision.decision === "held") {
    await writeEvent(ctx, intent.roundId, decision.decision === "held" ? { kind: "held", reason: decision.reason, charge: "unknown", batchId, results: receipts, at: Date.now() }
      : { kind: "held", reason: decision.reason, charge: "zero", batchId, resultType: decision.resultType, errorType: decision.errorType, results: receipts, at: Date.now() });
    return;
  }
  if (!results) {
    const reason = `the provider returned other results for ${batchId} on another read, and the answer of its first reading cannot be delivered from them`;
    // The answer is held; its bill is not: the one its first reading states, counted in full when it can be priced.
    const evidence = answerCharge(ctx, receipts);
    await writeEvent(ctx, intent.roundId, evidence ? { kind: "held", reason, charge: "known", evidence, batchId, results: receipts, at: Date.now() }
      : { kind: "held", reason, charge: "unknown", batchId, results: receipts, at: Date.now() });
    return;
  }
  const result = results.find(r => r.customId === intent.customId) as Extract<QualityBatchResult, { type: "succeeded" }>;
  // Read exactly as the synchronous route reads its reply; priced by the tier the answer says served it. Its usage
  // in canonical key order, so the same reading read twice is the same retained answer however it was serialised.
  const read = readAnthropicVisualReview(POLICY, { ok: true, requestId: null }, result.message);
  const reading = { ...read, usage: read.usage ? JSON.parse(qualityBatchCanonicalJson(read.usage)) as typeof read.usage : read.usage };
  const charge = visualReviewBatchCharge(POLICY, reading.model, reading.usage);
  const reply = { ...reading, costUnknown: charge.costUnknown, verdict: null };
  const bytes = Buffer.from(JSON.stringify({ ...reply, policy: POLICY, fingerprint: intent.fingerprint, channel: CHANNEL, batchId }));
  const store = new LocalPatchRetainedPurchaseStore(ctx.c, ctx.gameId, OUTCOME_LEDGER);
  const base = { version: RETAINED_PURCHASE_VERSION, worldId: intent.worldId, requestKey: intent.batchKey, scope: "judge",
    operationFingerprint: intent.fingerprint, payloadSha256: retainedPayloadDigest(bytes), bytes } as const;
  const keep = async (record: Parameters<typeof store.put>[2]) => {
    try { await store.put(intent.worldId, intent.batchKey, record); }
    // A deleted game's store records the bill (or the unknown charge) and keeps no answer.
    catch (error) { if (!(error instanceof LocalPatchDeleted)) throw error; }
  };
  if (reply.costUnknown || !reply.requestId) {
    const reason = `the answer's charge cannot be stated (tier ${String(reading.usage?.service_tier ?? "none")}, model ${reading.model ?? "none"})`;
    await keep({ ...base, evidence: null, unknownReason: reason });
    await writeEvent(ctx, intent.roundId, { kind: "held", reason, charge: "unknown", batchId, results: receipts, at: Date.now() });
    return;
  }
  const evidence: WorldChargeEvidence = canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace, providerRequestId: reply.requestId,
    usageId: sha(qualityBatchCanonicalJson(reply.usage)), rawUsage: reply.usage as BudgetJson, model: reply.model!,
    amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
  await keep({ ...base, evidence, unknownReason: null });
  await writeEvent(ctx, intent.roundId, { kind: "answered", batchId, amountMicroUsd: evidence.amountMicroUsd,
    servedTier: String(reading.usage?.service_tier), evidence, at: Date.now() });
}

/**
 * What another copy of a finished round was billed (rule 5), counted in the ledger as a charge of its own,
 * with what the provider returned for it. The round's batch key stands for its one batch, the one its
 * outcome counted; every other copy is another bill, a copy of a create presumed lost included (the
 * presumption then counts on top of it: more, never less). A priced bill is imported in full by its
 * receipt; one that cannot be stated is recorded as its own unknown charge at the synchronous reservation,
 * held for a person until reconciled, under a key bound to exactly what was read: a later read that
 * returns anything else is another charge, never one a person already reconciled. Nothing here reads or
 * changes the batch key, so no settlement of it, before or after, by a pass or a person, can change how a
 * copy is counted. It works from the reading's receipts alone (the record keeps them, never the answer).
 * Its priced charge, 0 when unbilled, or null when it cannot be priced.
 */
async function lateCharge(ctx: Context, round: QualityBatchRound, batchId: string, receipts: readonly QualityBatchReceipt[]): Promise<number | null> {
  const { intent } = round, budget = boardWizardBudgetOf(ctx.c), own = round.terminal?.batchId ?? null;
  // A copy whose bill is the outcome's own bill (the same message, the same usage) is the outcome's charge, which the
  // batch key counts: it is never imported or recorded again, so it can never pre-empt the outcome's settlement.
  const outcomes = own !== null && own !== batchId && !!round.readings[own] && sameBill(round.readings[own], receipts);
  const decision = decideReading(receipts, intent.customId);
  // Errored, canceled and expired requests are documented as unbilled.
  if (decision.decision === "unbilled-fallback" || decision.decision === "unbilled-held") return 0;
  let priced: WorldChargeEvidence | null = null, reason = decision.decision === "held" ? decision.reason : "";
  if (decision.decision === "answer") {
    const answer = receipts[0]!, usage = answer.usage as Record<string, unknown> | null;
    priced = answerCharge(ctx, receipts);
    if (!priced) reason = `the answer's charge cannot be stated (tier ${String(usage?.service_tier ?? "none")}, model ${answer.model ?? "none"})`;
  }
  if (priced) {
    // Imported in full, counted once by its receipt; a receipt already counted with other evidence is recorded as a conflict, which holds the world.
    if (!outcomes) {
      try { await budget.importSettled(intent.worldId, { scope: "judge", operationFingerprint: intent.fingerprint, evidence: priced }); }
      catch (error) { if (!(error instanceof WorldBudgetError) || error.code !== "evidence_conflict") throw error; }
    }
    return priced.amountMicroUsd;
  }
  const receipt = receipts.find(item => item.requestId)?.requestId;
  if (!outcomes) await budget.recordUnknown(intent.worldId, { requestKey: qualityBatchCopyKeyOf(intent.batchKey, batchId, receipts), scope: "judge", operationFingerprint: intent.fingerprint,
    reserveMicroUsd: intent.syncReserveMicroUsd, reason: `quality batch ${intent.roundId}: copy ${batchId}${receipt ? ` (${receipt})` : ""}: ${reason}` });
  return null;
}
/** The ledger key of a copy whose charge cannot be stated: its own unknown row beside the round's batch key, one per
 * distinct bill read of the copy (the digest of what the provider returned for the question, as `late-n` keeps it, less
 * the answer's digest, in canonical form: the same values give the same key whatever order they were serialised in, and
 * another answer under the same bill is the same charge, one row however many passes count it at once). */
export const qualityBatchCopyKeyOf = (batchKey: string, batchId: string, receipts: readonly QualityBatchReceipt[]) =>
  `${batchKey}:copy:${batchId}:${sha(qualityBatchCanonicalJson(qualityBatchBill(receipts)))}`;

/** An answer's charge from its reading alone, priced by the tier its usage states exactly as its delivery settles it;
 * null when it cannot be stated (a tier with no rate, another model, no receipt). */
function answerCharge(ctx: Context, receipts: readonly QualityBatchReceipt[]): WorldChargeEvidence | null {
  const answer = receipts[0]!, usage = answer.usage as Record<string, unknown> | null;
  const charge = visualReviewBatchCharge(POLICY, answer.model, usage);
  if (charge.costUnknown || !answer.requestId) return null;
  return canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace, providerRequestId: answer.requestId,
    usageId: sha(qualityBatchCanonicalJson(usage)), rawUsage: usage as BudgetJson, model: answer.model!,
    amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
}

/** Records a copy's bill once in the round's record (`late-n`), from the copy's recorded reading; a pass that lost
 * the number reads the round again. The reading is counted in the ledger, under its own key, before anything else. */
async function recordLate(ctx: Context, roundId: string, batchId: string, receipts: readonly QualityBatchReceipt[]) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const round = await readRound(ctx, roundId);
    const amountMicroUsd = await lateCharge(ctx, round, batchId, receipts);
    if (round.billedIds.includes(batchId)) return;
    if ((await writeEvent({ ...ctx, fence: null }, roundId, { kind: "late", n: round.lates.length + 1, batchId, amountMicroUsd, results: receipts, at: Date.now() })).won) return;
  }
  throw Error("QUALITY_BATCH: a copy's bill could not be recorded");
}

/** Each copy of a finished round whose bill is not in the record yet, read before it may be deleted (rule 5).
 * A copy is read from the provider once: its recorded reading is its bill from then on (rule 6), so a copy whose
 * bill the ledger refuses costs no provider call again. A copy that cannot be read yet (one still running) is
 * kept, and read later. */
async function reconcileLate(ctx: Context, round: QualityBatchRound) {
  const due = qualityBatchLateDue(round);
  // A different copy first each minute: one whose reads keep timing out never keeps the others from theirs.
  const start = qualityBatchCopyStart(round.intent.roundId, due.length, Date.now());
  const failures: unknown[] = [];
  for (let i = 0; i < due.length; i++) {
    const batchId = due[(start + i) % due.length]!;
    let reading = round.readings[batchId];
    if (!reading) {
      // Its record and then its results file: room for both reads before the first starts.
      if (!roomFor(ctx, 2 * CALL_NEED_MS)) continue;
      let results: QualityBatchResult[];
      try { results = await ctx.transport.results(batchId, ctx.deadlineAt); }
      catch { continue; }
      // Another pass that recorded the copy's reading otherwise meanwhile makes this one a reread, counted first.
      try { reading = (await noteReading(ctx, round, batchId, receiptsOf(results, round.intent.customId))).recorded; }
      catch (error) { failures.push(error); continue; }
    }
    // A bill the ledger or the record refuses leaves its copy unbilled (and so undeletable); the others go on,
    // and the refusal is raised once they have.
    try { await recordLate(ctx, round.intent.roundId, batchId, reading); }
    catch (error) { failures.push(error); }
  }
  raise(failures);
}

/**
 * The dual review's own key as a linked alias of the batch key's charge: counted
 * once, carrying the same retained answer under its own address, with the dual
 * review's own reservation terms so its replay finds the purchase it would make.
 *
 * The alias holds no capacity: the answer is already paid for. (It used to be
 * reserved first, which refused the answer whenever the world had less room left
 * than the synchronous reservation - for good, with nothing pending to free it.)
 * Ledger first, copy second: a copy lost in between is written by the next pass,
 * and every dual review comes through here before it buys.
 */
async function link(ctx: Context, round: QualityBatchRound) {
  const { intent } = round, budget = boardWizardBudgetOf(ctx.c), store = new LocalPatchRetainedPurchaseStore(ctx.c, ctx.gameId, budget);
  const existing = await budget.readRequest(intent.worldId, intent.syncKey);
  if (existing?.state === "settled" || existing?.state === "linked" && await store.get(intent.worldId, intent.syncKey)) return;
  const answer = await new PrismaRetainedPurchaseStore(ctx.c.db).get(intent.worldId, intent.batchKey);
  if (!answer?.evidence || answer.operationFingerprint !== intent.fingerprint) throw Error("QUALITY_BATCH: an answered round has no retained answer to deliver");
  if (existing && (existing.scope !== "judge" || existing.operationFingerprint !== intent.fingerprint || existing.reserveMicroUsd !== intent.syncReserveMicroUsd
    || (existing.state === "linked" ? !sameChargeEvidence(existing.evidence, answer.evidence) : existing.state !== "pending")))
    throw Error(`QUALITY_BATCH: ${intent.syncKey} is ${existing.state} with other terms`);
  await inventorySelfRepairRequest(ctx.c, ctx.gameId, intent.syncKey, ctx.fence ?? (async () => {}));
  // A reservation an earlier version made for the alias settles into it.
  if (!existing) await budget.link(intent.worldId, { requestKey: intent.syncKey, scope: "judge", operationFingerprint: intent.fingerprint,
    reserveMicroUsd: intent.syncReserveMicroUsd, canonicalRequestKey: intent.batchKey });
  else if (existing.state === "pending") await budget.settle(intent.worldId, intent.syncKey, answer.evidence);
  await store.put(intent.worldId, intent.syncKey, { version: RETAINED_PURCHASE_VERSION, worldId: intent.worldId, requestKey: intent.syncKey,
    scope: "judge", operationFingerprint: intent.fingerprint, payloadSha256: answer.payloadSha256, bytes: answer.bytes, evidence: answer.evidence, unknownReason: null });
}

/** Move one round as far as it can go now. Transport failures wait; ledger and record failures are raised. */
async function advance(ctx: Context, roundId: string): Promise<QualityBatchGate> {
  for (let turn = 0; turn < 6; turn++) {
    const round = await readRound(ctx, roundId), step = nextQualityBatchStep(round, Date.now());
    if (step.step === "done") {
      // Whoever wrote the outcome, the ledger is made to match the record before anything follows from it (rules 0
      // and 6): the outcome, and every reread again (each is counted before it is recorded; one the ledger refused then
      // is counted now, or the refusal raised).
      await applyRecord(ctx, round);
      if (step.terminal.kind === "held") return { kind: "held", reason: `Quality question in Message Batches: ${step.terminal.reason}` };
      if (ctx.stopping) return proceed;
      // The question is asked synchronously only once no batch that could carry it is pending (rule 1), even one a search
      // named after the round's batch was decided: the round's housekeeping searches for it meanwhile.
      if (step.terminal.kind === "fallback") return round.pending.length ? waiting("a batch another search saw could carry this question; "
        + "it is asked synchronously once that batch is decided") : proceed;
      // An answer is delivered only on the charge it settled; one another writer held instead waits for a person.
      const charge = await boardWizardBudgetOf(ctx.c).readRequest(round.intent.worldId, round.intent.batchKey);
      if (charge?.state !== "settled") return { kind: "held", reason: `Quality question in Message Batches: its answered charge is ${charge?.state ?? "missing"}, not settled` };
      await link(ctx, round);
      return proceed;
    }
    if (step.step === "wait") return waiting(step.reason);
    if (step.step === "hold") {
      // A create refused outright created nothing: zero, and the question waits for a person.
      const refusal = round.refusals.at(-1)!;
      await writeEvent(ctx, roundId, { kind: "held", reason: step.reason, charge: "zero", resultType: `create-refused-${refusal.status}`,
        errorType: refusal.errorType, at: Date.now() });
      continue;
    }
    // Held with the charge unknown: a person reconciles it; nothing is asked again automatically.
    if (step.step === "duplicates") { await writeEvent(ctx, roundId, { kind: "held", reason: step.reason, charge: "unknown", at: Date.now() }); continue; }
    if (step.step === "fallback-unsent") {
      const closed = await closeUnsent(ctx, round, step.claim);
      if (closed !== "advanced") return closed;
      continue;
    }
    if (step.step === "create") {
      // Before any create, every earlier claim was refused outright or searched and found absent:
      // nothing reached the provider. A game that is not generating sends nothing, so the round ends.
      if (ctx.stopping) {
        if (!await stillStopped(ctx)) return waiting("the game is generating again; its own review creates the batch");
        const closed = await closeUnsent(ctx, round, step.claim);
        if (closed !== "advanced") return closed;
        continue;
      }
      const created = await create(ctx, round, step.claim);
      if (created !== "advanced") return created;
      continue;
    }
    if (step.step === "find") {
      let found: Awaited<ReturnType<QualityBatchTransport["find"]>>;
      const searchedAt = Date.now();
      // The batches already known are proven already: only new ones are read; those an earlier search could not decide are watched.
      try { found = await ctx.transport.find(round.intent.customId, step.sinceMs, ctx.deadlineAt, step.untilMs, new Set(round.batchIds), new Set(round.pending)); }
      catch (error) { return waiting(`the provider could not be searched (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
      // Every batch proven to carry the question is kept, with what it was proven by, before anything is decided
      // from it, and so is every batch the search could not decide: a later search that no longer sees one cannot
      // undo it. Two copies hold the round. What the round's batch is (one batch, or none: the create presumed lost) is
      // decided with that record, in the same slot, and only once no other batch could still carry the question, by
      // this search or any other recorded first: deciding while another runs could release that one's charge on the
      // first's outcome. Nothing is sent again (rule 1).
      const known = await recordSearch(ctx, roundId, found, searchedAt, true);
      if (known.batchIds.length > 1 || known.submitted || known.presumed) continue;
      return waiting(found.failed ? `the search stopped (${found.failed}); what it proved and saw is kept, and nothing is decided meanwhile`
        : found.truncated ? "the search did not reach back to this question (too many batches, or too little of this request left); nothing is decided meanwhile"
        : "a batch that could carry this question has not ended yet");
    }
    // Its charge counted at the most it could be once the outcome is recorded; the question is then asked synchronously.
    if (step.step === "presumed") {
      await writeEvent(ctx, roundId, { kind: "fallback", batchId: null, resultType: "presumed-lost", errorType: null, at: Date.now() });
      continue;
    }
    // poll
    // A batch whose first reading is on record and gives no answer is decided from that reading alone (rule 6): its
    // outcome needs nothing more from the provider. An answer still needs the read that gives its content.
    const recorded = round.readings[step.batchId];
    if (recorded && decideReading(recorded, round.intent.customId).decision !== "answer") { await recordOutcome(ctx, round, step.batchId, recorded, null); continue; }
    if (!roomFor(ctx, POLL_NEED_MS)) return waiting("too little of this request is left to read the batch");
    let status: Awaited<ReturnType<QualityBatchTransport["status"]>>;
    try { status = await ctx.transport.status(step.batchId); }
    catch (error) { return waiting(`the batch could not be read (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
    if (status.status === "in_progress") {
      if (!step.cancelDue && !ctx.stopping) return waiting("the batch is still running");
      // A game resumed since it was read (perhaps while that status call took its time) keeps its batch.
      if (!step.cancelDue && !await stillStopped(ctx)) return waiting("the game is generating again; its batch runs on");
      if (!roomFor(ctx, CALL_NEED_MS)) return waiting("too little of this request is left to cancel the batch");
      // Cancelled once at the deadline, and again while it keeps running; cancelling is idempotent.
      try { await ctx.transport.cancel(step.batchId); }
      catch (error) { return waiting(`the cancel was not acknowledged (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
      if (round.cancelAt === null) await writeEvent(ctx, roundId, { kind: "cancel", at: Date.now() });
      return waiting(ctx.stopping ? "cancelled: the game is not generating" : "cancelled at its deadline; what it finished is settled when it ends");
    }
    if (status.status === "canceling") return waiting("the batch is being cancelled");
    let results: QualityBatchResult[];
    // The status read the ended batch's record: its counts spare the results a second read of it.
    try { results = await ctx.transport.results(step.batchId, ctx.deadlineAt, status.counts ?? undefined); }
    catch (error) { return waiting(`the results could not be read (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
    await reconcile(ctx, round, step.batchId, results);
  }
  return waiting("the round is still advancing");
}

/** The provider's copies of a finished round, each deleted once its bill is in the record. A held
 * round keeps them for the person, unless its game was deleted (rule 5 of quality-batch-round.ts). */
async function cleanup(ctx: Context, round: QualityBatchRound, gameDeleted: boolean) {
  const removed: string[] = [], deletable = qualityBatchDeletable(round, gameDeleted);
  // A different copy first each minute: deletions the provider keeps refusing slowly never keep the others for good.
  const start = qualityBatchCopyStart(round.intent.roundId, deletable.length, Date.now());
  for (let i = 0; i < deletable.length; i++) {
    const batchId = deletable[(start + i) % deletable.length]!;
    if (!roomFor(ctx, CALL_NEED_MS)) break;
    try { await ctx.transport.remove(batchId); removed.push(batchId); }
    catch { continue; } // retried on a later slice or tick, and never keeps the others from going
  }
  if (removed.length) await recordDeleted(ctx, round.intent.roundId, removed);
}

/** A finished round that could still have a copy it has not found searches again (rule 5): any round while a batch
 * a search could not decide is pending, a held round while another copy could run, a presumed-lost round once a day
 * after the presumption. It only reads the provider and records what it finds: no purchase, create, cancel or release
 * follows from it. Whether it searched. */
async function discover(ctx: Context, round: QualityBatchRound): Promise<boolean> {
  const searchedAt = Date.now();
  if (!qualityBatchSearching(round, searchedAt)) return false;
  const window = qualityBatchSearchWindow(round);
  let found: Awaited<ReturnType<QualityBatchTransport["find"]>>;
  // The copies already known are proven already: a search reads only new ones, so one that cannot be read keeps no search waiting.
  // Those an earlier search could not decide are watched until one decides them.
  try { found = await ctx.transport.find(round.intent.customId, window.sinceMs, ctx.deadlineAt, window.untilMs, new Set(round.batchIds), new Set(round.pending)); }
  catch { return true; } // the next slice or tick searches again
  await recordSearch(ctx, round.intent.roundId, found, searchedAt);
  return true;
}

/** Copies already known: each one's bill read, then those that may go deleted. */
async function settleCopies(ctx: Context, round: QualityBatchRound, gameDeleted: boolean) {
  const failures: unknown[] = [];
  if (qualityBatchLateDue(round).length) {
    // A copy whose bill cannot be recorded never keeps the billed ones from their deletion; its refusal is raised after.
    try { await reconcileLate(ctx, round); }
    catch (error) { failures.push(error); }
    try { round = await readRound(ctx, round.intent.roundId); }
    catch (error) { raise([...failures, error]); }
  }
  try { await cleanup(ctx, round, gameDeleted); }
  catch (error) { failures.push(error); }
  raise(failures);
}

/** The ledger as the round's record says it must be (rules 0, 5 and 6): its outcome applied, and every other bill on
 * record counted as a charge of its own: each copy's reading, and each reread with another bill than its batch's first
 * reading. Each was counted before it was recorded, unless the ledger refused it, or the round was not finished yet
 * when a copy was read; it is counted here before anything follows from the record. Idempotent: applied by any pass,
 * as often as needed. */
async function applyRecord(ctx: Context, round: QualityBatchRound, keys?: ReadonlySet<string>) {
  const failures: unknown[] = [];
  try { await applyTerminal(ctx, round, keys); }
  catch (error) { failures.push(error); }
  try { await countBills(ctx, round); }
  catch (error) { failures.push(error); }
  raise(failures);
}

/** A finished round's bills on record beyond its outcome's own, each counted as a charge of its own (rules 5 and 6):
 * every copy's reading, and every reread with another bill than its batch's first reading. One the ledger refuses
 * never keeps the others from being counted; the refusals are raised together. */
async function countBills(ctx: Context, round: QualityBatchRound) {
  if (!round.terminal) return;
  const failures: unknown[] = [], own = round.terminal.batchId ?? null;
  const count = async (batchId: string, bill: readonly QualityBatchReceipt[]) => {
    try { await lateCharge(ctx, round, batchId, bill); }
    catch (error) { failures.push(error); }
  };
  for (const [batchId, reading] of Object.entries(round.readings)) if (batchId !== own) await count(batchId, reading);
  for (const reread of round.rereads) if (!sameBill(reread.results, round.readings[reread.batchId]!)) await count(reread.batchId, reread.results);
  raise(failures);
}

/**
 * A finished round's housekeeping (rules 0, 5 and 6). The outcome is applied first; only once it is are copies read
 * and deleted, so a copy bearing the outcome's own bill is counted as the outcome's charge. Every other bill on record
 * is counted next, each on its own, so one the ledger refuses never keeps another copy from its bill or its deletion,
 * and nothing is deleted that the ledger has not counted. Then the copies already known (their bills, their deletion
 * where due) and the search for further copies, what it finds read and deleted in the same pass when there is room:
 * the known copies first one minute and the search first another, so however slow the provider, neither keeps the
 * other out for good. Each step runs whatever failed before it, and every failure is raised at the end.
 */
async function maintain(ctx: Context, round: QualityBatchRound, gameDeleted: boolean, keys?: ReadonlySet<string>) {
  const failures: unknown[] = [];
  const step = async (work: () => Promise<unknown>) => { try { await work(); } catch (error) { failures.push(error); } };
  let applied = false;
  await step(async () => { await applyTerminal(ctx, round, keys); applied = true; });
  await step(() => countBills(ctx, round));
  const known = async () => { if (applied) await settleCopies(ctx, await readRound(ctx, round.intent.roundId), gameDeleted); };
  const search = async () => { if (await discover(ctx, round) && applied) await settleCopies(ctx, await readRound(ctx, round.intent.roundId), gameDeleted); };
  const searchFirst = qualityBatchCopyStart(`${round.intent.roundId}:search`, 2, Date.now()) === 1;
  for (const phase of searchFirst ? [search, known] : [known, search]) await step(phase);
  raise(failures);
}

/** Raises what went wrong, with nothing lost: one failure as it is, several together, the first first. */
function raise(failures: readonly unknown[]): void {
  const messageOf = (failure: unknown) => failure instanceof Error ? failure.message : String(failure);
  const distinct = failures.filter((failure, i) => failures.findIndex(other => messageOf(other) === messageOf(failure)) === i);
  if (distinct.length === 1) throw distinct[0];
  if (distinct.length > 1) throw new AggregateError(distinct, `QUALITY_BATCH: ${distinct.map(messageOf).join("; ")}`);
}

/**
 * The gate the dual review passes before it buys a scene-quality question.
 * `proceed`: buy as usual (the answer is already settled under the question's key,
 * or the round fell back, or this game is not pinned). Otherwise the question waits
 * in its round, or is held for a person.
 */
export async function askQualityThroughBatch(c: Container, input: {
  gameId: string; worldId: string; sceneId: string; board: string; hideId: string; variantId: string; imageSha256: string;
  question: PreparedVisualReview; syncKey: string; reserveMicroUsd: number; fence: Fence; deadlineAt?: number;
}): Promise<QualityBatchGate> {
  const channel = await qualityChannelOf(c.db, input.gameId);
  if (!channel || input.question.role !== "scene-quality") return proceed;
  const transport = c.qualityBatch;
  if (!transport) throw Error("QUALITY_BATCH: this game's quality questions are pinned to Message Batches, which is not configured here");
  const batchKey = qualityBatchKeyOf(input.board, input.question.fingerprint), roundId = roundIdOf(input.worldId, batchKey);
  const ctx: Context = { c, transport, gameId: input.gameId, fence: input.fence, question: input.question, stopping: false, deadlineAt: input.deadlineAt };
  const events = (await gameRounds(c.db, input.gameId)).get(roundId);
  if (events) {
    const { intent } = qualityBatchRoundOf(events);
    if (intent.syncKey !== input.syncKey || intent.batchKey !== batchKey || intent.fingerprint !== input.question.fingerprint || intent.worldId !== input.worldId)
      throw Error("QUALITY_BATCH: a round's intent differs from its question");
    return advance(ctx, roundId);
  }
  const budget = boardWizardBudgetOf(c);
  // A question the synchronous route already owns is never also batched.
  if (await budget.readRequest(input.worldId, input.syncKey)) return proceed;
  if (await budget.readRequest(input.worldId, batchKey)) throw Error("QUALITY_BATCH: a batch reservation without its round");
  if (input.deadlineAt !== undefined && input.deadlineAt - Date.now() < QUALITY_BATCH_CREATE_NEED_MS) return waiting("too little of this request is left to start a batch");
  const now = Date.now();
  const intent: QualityBatchIntent = { version: QUALITY_BATCH_VERSION, roundId, gameId: input.gameId, worldId: input.worldId, sceneId: input.sceneId,
    board: input.board, hideId: input.hideId, variantId: input.variantId, imageSha256: input.imageSha256, syncKey: input.syncKey, batchKey,
    customId: customIdOf(roundId, batchKey), fingerprint: input.question.fingerprint, model: POLICY.model,
    syncReserveMicroUsd: input.reserveMicroUsd, batchReserveMicroUsd: qualityBatchReserveMicroUsd(input.reserveMicroUsd),
    paramsSha256: sha(JSON.stringify(qualityBatchParams(input.question))), intentAt: now, deadlineAt: now + channel.deadlineMs };
  await writeEvent(ctx, roundId, { kind: "intent", intent });
  return advance(ctx, roundId);
}

/** Every open round of one generating game, advanced once: polled, cancelled at its
 * deadline, or settled and linked when its batch has ended. It never creates. Every
 * finished round gets its housekeeping. */
export async function advanceQualityBatches(c: Container, gameId: string, fence: Fence, deadlineAt?: number): Promise<void> {
  const transport = c.qualityBatch;
  if (!transport) return;
  const rounds = [...await gameRounds(c.db, gameId)];
  // One read of the ledger for the slice: only an outcome whose reservation is still pending has anything to apply, or one
  // held as unknown (by another writer, a bill above the hold counts).
  const worldId = rounds.length ? qualityBatchRoundOf(rounds[0]![1]).intent.worldId : null;
  const audit = worldId ? await boardWizardBudgetOf(c).audit(worldId) : null;
  const keys = new Set([...audit?.pendingRequestKeys ?? [], ...audit?.unknownRequestKeys ?? []]);
  for (const [roundId, events] of rounds) {
    if (deadlineAt !== undefined && deadlineAt - Date.now() < POLL_NEED_MS) return;
    const round = qualityBatchRoundOf(events), ctx: Context = { c, transport, gameId, fence, question: null, stopping: false, deadlineAt };
    if (round.terminal) { await maintain(ctx, round, false, keys); continue; }
    try { await advance(ctx, roundId); }
    // A full world waits for capacity at the review that needs it, which parks or waits as it does today.
    catch (error) { if (!(error instanceof WorldBudgetError)) throw error; }
  }
}

/** Appearances whose question waits in an open round (`variantId:imageSha256`): their board reviews another first. */
export async function qualityBatchWaiting(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<Set<string>> {
  const waitingRows = new Set<string>();
  for (const events of (await gameRounds(db, gameId)).values()) {
    const round = qualityBatchRoundOf(events);
    if (!round.terminal) waitingRows.add(`${round.intent.variantId}:${round.intent.imageSha256}`);
  }
  return waitingRows;
}

/** The scheduled tick runs every minute; each tick starts its sweep one round further on. */
const SWEEP_ROTATION_MS = 60_000;
/** The time a tick's sweep gives provider calls, counted from the end of reading the records. */
export const QUALITY_BATCH_SWEEP_WINDOW_MS = 40_000;
type GameState = { readonly status: string; readonly deletedAt: Date | null } | null;
/** A generating game's rounds belong to its own slices. */
const generating = (game: GameState) => !!game && game.status === "TARGETS_GENERATING" && !game.deletedAt;
const deletedGame = (game: GameState) => !game || !!game.deletedAt || game.status === "DELETED";

/**
 * Rounds of games that are no longer generating (deleted, stopped, refunded,
 * finished): cancelled now, settled when their batch ends, the provider's copies
 * deleted. A deleted game's answer is not kept; its bill is. Never creates,
 * links or falls back. Also every finished round with housekeeping due, whatever
 * its game's state (a search, a copy's bill, a deletion): a held review parks its
 * job, and a parked job runs no slice.
 * For the scheduled tick: provider calls start only within `windowMs` of the
 * records being read, before `deadlineAt`, and only with room to finish.
 */
export async function sweepQualityBatches(c: Container, options: { deadlineAt: number; windowMs?: number }): Promise<{ rounds: number; failed: number }> {
  const transport = c.qualityBatch;
  if (!transport) return { rounds: 0, failed: 0 };
  // Two reads for the whole inventory, however many games: every round record, then the games' states.
  const rows = await c.db.auditLog.findMany({ where: { action: QUALITY_BATCH_ACTION, entityType: "Game" },
    orderBy: [{ entityId: "asc" }, { createdAt: "asc" }, { id: "asc" }] });
  const byGame = new Map<string, RoundRow[]>();
  for (const row of rows) {
    if (!row.entityId) continue;
    const list = byGame.get(row.entityId);
    if (list) list.push(row); else byGame.set(row.entityId, [row]);
  }
  const states = new Map((await c.db.game.findMany({ where: { id: { in: [...byGame.keys()] } }, select: { id: true, status: true, deletedAt: true } }))
    .map(game => [game.id, game]));
  const work: { gameId: string; roundId: string; terminal: boolean }[] = [];
  let rounds = 0, failed = 0;
  const readAt = Date.now();
  for (const [gameId, gameRows] of byGame) {
    const game = states.get(gameId) ?? null;
    // One game's unreadable record never stops the sweep of the others; that game's
    // rounds stay as they are, counted, for the next tick or a person.
    try {
      for (const [roundId, events] of roundsOf(gameRows, gameId)) {
        const round = qualityBatchRoundOf(events);
        if (round.terminal ? qualityBatchSearching(round, readAt) || qualityBatchLateDue(round).length > 0 || qualityBatchCleanupDue(round, deletedGame(game))
          // A provider fault on record (rule 6) keeps its round's ledger matched to the record on every tick, whatever else is
          // done: a reread the ledger refused when it was recorded is counted again.
          || round.rereads.length > 0 : !generating(game)) work.push({ gameId, roundId, terminal: !!round.terminal });
      }
    } catch { failed++; }
  }
  // The window for starting rounds opens once the records are read: reading them never takes the time
  // the provider calls need. Each round started in it has its own budget for its calls, so a slow first
  // read never leaves the next one no room, tick after tick; no call ends after `deadlineAt`.
  const windowEnd = Date.now() + (options.windowMs ?? QUALITY_BATCH_SWEEP_WINDOW_MS);
  // Rotated: a round that is slow every time (a provider that answers late, then fails)
  // took each tick's whole window, every tick, and the rounds after it were never reached.
  const start = work.length ? Math.floor(Date.now() / SWEEP_ROTATION_MS) % work.length : 0;
  for (let i = 0; i < work.length; i++) {
    if (Date.now() >= windowEnd || options.deadlineAt - Date.now() < POLL_NEED_MS) break;
    const { gameId, roundId, terminal } = work[(start + i) % work.length]!;
    // A failed write or read leaves the round as it is, for the next tick or a person.
    try {
      // The game as it is now, and again before any action its own worker would not take.
      const readGame = () => c.db.game.findUnique({ where: { id: gameId }, select: { status: true, deletedAt: true } });
      const game = await readGame(), live = generating(game);
      const deadlineAt = Math.min(options.deadlineAt, Date.now() + QUALITY_BATCH_SWEEP_ROUND_MS);
      const ctx: Context = { c, transport, gameId, fence: null, question: null, stopping: !live, deadlineAt,
        stillStopped: async () => !generating(await readGame()) };
      if (!terminal) {
        if (live) continue; // its own slices advance it
        await advance(ctx, roundId);
      // A finished round's housekeeping moves no money its outcome did not decide, so it needs no slice.
      } else await maintain(ctx, await readRound(ctx, roundId), deletedGame(game));
      rounds++;
    } catch { failed++; }
  }
  return { rounds, failed };
}

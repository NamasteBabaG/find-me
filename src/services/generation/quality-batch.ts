import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { anthropicVisualReviewBody, readAnthropicVisualReview } from "../../infra/generation/anthropic-visual-review";
import { visualReviewBatchCharge } from "../../infra/generation/visual-review-pricing";
import { QualityBatchRefused, type QualityBatchFound, type QualityBatchResult, type QualityBatchTransport } from "../../infra/generation/types";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import {
  QUALITY_BATCH_VERSION, decideQualityBatchResults, nextQualityBatchStep, qualityBatchCanonicalJson, qualityBatchCleanupDue, qualityBatchCopyStart, qualityBatchDeletable,
  qualityBatchEventName, qualityBatchLateDue, qualityBatchReserveMicroUsd, qualityBatchRoundOf, qualityBatchSearchWindow, qualityBatchSearching,
  type QualityBatchEvent, type QualityBatchIntent, type QualityBatchReceipt, type QualityBatchRound,
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

/** Written once. A second writer of the same event is refused by its id and gets the one that won. */
async function writeEvent(ctx: Pick<Context, "c" | "gameId" | "fence">, roundId: string, event: QualityBatchEvent): Promise<{ event: QualityBatchEvent; won: boolean }> {
  const id = eventId(roundId, qualityBatchEventName(event));
  try {
    await ctx.c.db.$transaction(async tx => {
      if (ctx.fence) { await fenceLocalPatchImages(tx, ctx.gameId); await ctx.fence(tx); }
      await tx.auditLog.create({ data: { id, actorType: "SYSTEM", action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: ctx.gameId, metaJson: JSON.stringify(event) } });
    });
    return { event, won: true };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existing = await ctx.c.db.auditLog.findUniqueOrThrow({ where: { id } });
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
async function applyTerminal(ctx: Context, round: QualityBatchRound, pendingKeys?: ReadonlySet<string>) {
  const { intent } = round, terminal = round.terminal!, budget = boardWizardBudgetOf(ctx.c);
  if (pendingKeys && !pendingKeys.has(intent.batchKey)) return;
  if ((await budget.readRequest(intent.worldId, intent.batchKey))?.state !== "pending") return;
  if (terminal.kind === "answered") await budget.settle(intent.worldId, intent.batchKey, terminal.evidence, ONLY_PENDING);
  else if (terminal.kind === "fallback" && terminal.resultType === "presumed-lost") await settlePresumed(ctx, round);
  else if (terminal.kind === "fallback") await settleUnbilled(ctx, intent, terminal.batchId, terminal.resultType, terminal.errorType);
  else if (terminal.charge === "zero") await settleUnbilled(ctx, intent, terminal.batchId ?? null, terminal.resultType!, terminal.errorType ?? null);
  // Held with the charge unknown, in full: the world reserves nothing more until a person reconciles it.
  else await budget.markUnknown(intent.worldId, intent.batchKey, `quality batch ${intent.roundId}: ${terminal.reason}`);
}

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

/** Keeps for good every batch a search proved to carry the question, and whether the search was
 * complete (`complete` is recorded on its own only for a finished round still searching); `at`: when
 * the search started. The next free number wins; a pass that lost it reads the round again and
 * records what is still new. */
async function recordFound(ctx: Context, roundId: string, proven: readonly string[], complete: boolean, at: number): Promise<QualityBatchRound> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const round = await readRound(ctx, roundId), fresh = proven.filter(id => !round.found.includes(id));
    if (!fresh.length && !(complete && qualityBatchSearching(round, at))) return round;
    const written = await writeEvent(ctx, roundId, { kind: "found", n: round.searches + 1, batchIds: fresh, complete, at });
    if (written.won) return readRound(ctx, roundId);
  }
  throw Error("QUALITY_BATCH: the batches a search found could not be recorded");
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
  await writeEvent(ctx, round.intent.roundId, { kind: "submitted", n: claim, batchId, at: Date.now() });
  return "advanced";
}

/** What the provider returned for this round's question in one batch, as kept in the record: never the answer itself. */
function receiptsOf(results: readonly QualityBatchResult[], customId: string): QualityBatchReceipt[] {
  return results.filter(r => r.customId === customId).map(r => {
    if (r.type !== "succeeded") return { type: r.type === "unrecognized" ? `unrecognized:${r.resultType ?? "none"}` : r.type,
      errorType: r.type === "errored" ? r.errorType : null, requestId: null, model: null, usage: null };
    const reading = readAnthropicVisualReview(POLICY, { ok: true, requestId: null }, r.message);
    return { type: r.type, errorType: null, requestId: reading.requestId, model: reading.model, usage: reading.usage ?? null };
  });
}
const decide = (results: readonly QualityBatchResult[], customId: string) =>
  decideQualityBatchResults(results.map(r => ({ customId: r.customId, type: r.type, errorType: r.type === "errored" ? r.errorType : null })), customId);

/** Keeping an answer before its outcome is written: the outcome, not the store, records its charge (rule 0).
 * (For a deleted game the store would settle or hold the charge itself, before any outcome existed.) */
const OUTCOME_LEDGER: Pick<PurchaseLedger, "settle" | "markUnknown"> = { settle: async () => undefined, markUnknown: async () => undefined };

/** One ended batch's result for this round: its reading recorded first (rule 6), then, from that reading only,
 * its terminal outcome (rule 0): answered, at zero, or held. The ledger follows from the outcome; an answer is
 * retained before it is recorded. A read that returned anything else than the batch's recorded reading is a
 * provider fault, recorded and never decided from: the round's next step holds it, and the record applied then counts it. */
async function reconcile(ctx: Context, round: QualityBatchRound, batchId: string, results: readonly QualityBatchResult[]): Promise<void> {
  if (!(await noteReading(ctx, round, batchId, receiptsOf(results, round.intent.customId))).anomaly) await recordOutcome(ctx, round, batchId, results);
}

/**
 * Records what a read of a batch returned for this question (rule 6): a batch's first reading, once and for good,
 * before anything is decided from it. A later read that returned the same is that reading. One that returned
 * anything else is a provider fault, recorded (`reread`) and never decided from: an open round is held by its next
 * step before it is counted; a finished round's caller counts it at once. Every pass that applies the record counts
 * it again, idempotently.
 */
async function noteReading(ctx: Context, round: QualityBatchRound, batchId: string, receipts: readonly QualityBatchReceipt[]) {
  const roundId = round.intent.roundId;
  const written = await writeEvent({ ...ctx, fence: null }, roundId, { kind: "reading", batchId, results: receipts, at: Date.now() });
  const recorded = (written.event as Extract<QualityBatchEvent, { kind: "reading" }>).results;
  if (qualityBatchCanonicalJson(recorded) === qualityBatchCanonicalJson(receipts)) return { recorded, anomaly: false };
  await writeEvent({ ...ctx, fence: null }, roundId, { kind: "reread", batchId, digest: sha(qualityBatchCanonicalJson(receipts)).slice(0, 16), results: receipts, at: Date.now() });
  return { recorded, anomaly: true };
}

/**
 * Records what a search proved (rules 1 and 6): first the reading each proven batch was proved by, then the batches.
 * What a search read is never thrown away: a later read of the batch that says otherwise is a reread. A reading
 * another pass recorded otherwise is a reread too: an open round's next step holds it; a finished round's is counted
 * here as a charge of its own, and a count that fails is raised once the batches are recorded (and counted again
 * when the record is applied).
 */
async function recordSearch(ctx: Context, roundId: string, found: QualityBatchFound, at: number): Promise<QualityBatchRound> {
  const round = await readRound(ctx, roundId), failures: unknown[] = [];
  for (const batchId of found.proven) {
    const results = found.results?.[batchId];
    if (!results) continue;
    const receipts = receiptsOf(results, round.intent.customId), noted = await noteReading(ctx, round, batchId, receipts);
    if (noted.anomaly && round.terminal) { try { await lateCharge(ctx, round, batchId, receipts); } catch (error) { failures.push(error); } }
  }
  const recorded = await recordFound(ctx, roundId, found.proven, !found.undecided, at);
  raise(failures);
  return recorded;
}

async function recordOutcome(ctx: Context, round: QualityBatchRound, batchId: string, results: readonly QualityBatchResult[]): Promise<void> {
  const { intent } = round, decision = decide(results, intent.customId), receipts = receiptsOf(results, intent.customId);
  if (decision.decision === "unbilled-fallback") {
    await writeEvent(ctx, intent.roundId, { kind: "fallback", batchId, resultType: decision.resultType, errorType: decision.errorType, at: Date.now() });
    return;
  }
  if (decision.decision === "unbilled-held" || decision.decision === "held") {
    await writeEvent(ctx, intent.roundId, decision.decision === "held" ? { kind: "held", reason: decision.reason, charge: "unknown", batchId, results: receipts, at: Date.now() }
      : { kind: "held", reason: decision.reason, charge: "zero", batchId, resultType: decision.resultType, errorType: decision.errorType, results: receipts, at: Date.now() });
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
  // A copy whose reading is the outcome's own reading (the same message, the same usage) is the outcome's bill, which
  // the batch key counts: it is never imported or recorded again, so it can never pre-empt the outcome's settlement.
  const outcomes = own !== null && own !== batchId && !!round.readings[own] && qualityBatchCanonicalJson(round.readings[own]) === qualityBatchCanonicalJson(receipts);
  const decision = decideQualityBatchResults(receipts.map(r => ({ customId: intent.customId, type: r.type, errorType: r.errorType })), intent.customId);
  // Errored, canceled and expired requests are documented as unbilled.
  if (decision.decision === "unbilled-fallback" || decision.decision === "unbilled-held") return 0;
  let priced: WorldChargeEvidence | null = null, reason = decision.decision === "held" ? decision.reason : "";
  if (decision.decision === "answer") {
    const answer = receipts[0]!, usage = answer.usage as Record<string, unknown> | null;
    const charge = visualReviewBatchCharge(POLICY, answer.model, usage);
    if (!charge.costUnknown && answer.requestId) priced = canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace, providerRequestId: answer.requestId,
      usageId: sha(qualityBatchCanonicalJson(usage)), rawUsage: usage as BudgetJson, model: answer.model!,
      amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
    else reason = `the answer's charge cannot be stated (tier ${String(usage?.service_tier ?? "none")}, model ${answer.model ?? "none"})`;
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
 * distinct reading of the copy's bill (the digest of what the provider returned for the question, as `late-n` keeps it,
 * in canonical form: the same values give the same key whatever order they were serialised in). */
export const qualityBatchCopyKeyOf = (batchKey: string, batchId: string, receipts: readonly QualityBatchReceipt[]) =>
  `${batchKey}:copy:${batchId}:${sha(qualityBatchCanonicalJson(receipts))}`;

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
      const receipts = receiptsOf(results, round.intent.customId);
      try {
        const noted = await noteReading(ctx, round, batchId, receipts);
        reading = noted.recorded;
        // Another pass recorded the copy's reading otherwise meanwhile: this one is a charge of its own.
        if (noted.anomaly) await lateCharge(ctx, round, batchId, receipts);
      } catch (error) { failures.push(error); if (!reading) continue; }
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
      // and 6): the outcome, and every reread counted, so no capacity is admitted ahead of a charge on record.
      await applyRecord(ctx, round);
      if (step.terminal.kind === "held") return { kind: "held", reason: `Quality question in Message Batches: ${step.terminal.reason}` };
      if (step.terminal.kind === "fallback" || ctx.stopping) return proceed;
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
    // A provider fault (rule 6) is held the same way before it is counted, so a count that fails decides nothing; the
    // round's own batch keeps its first reading as the round's bill. Every batch the record read carries the question:
    // one a search read but stopped before recording is kept first, so it is billed and deleted like any copy.
    if (step.step === "fault") {
      const unkept = Object.keys(round.readings).filter(id => !round.batchIds.includes(id));
      if (unkept.length) await recordFound(ctx, roundId, unkept, false, Date.now());
      await writeEvent(ctx, roundId, { kind: "held", reason: step.reason, charge: "unknown",
        ...step.batchId ? { batchId: step.batchId, results: round.readings[step.batchId] } : {}, at: Date.now() });
      continue;
    }
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
      // The batches already known are proven already: only new ones are read.
      try { found = await ctx.transport.find(round.intent.customId, step.sinceMs, ctx.deadlineAt, step.untilMs, new Set(round.batchIds)); }
      catch (error) { return waiting(`the provider could not be searched (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
      // Every batch proven to carry the question is kept, with what it was proven by, before anything is decided
      // from it: a later search that no longer sees a copy cannot undo it. Two copies hold the round, as does a
      // provider fault the search recorded (rule 6), whatever else the search left undecided.
      const known = await recordSearch(ctx, roundId, found, searchedAt);
      if (known.batchIds.length > 1 || known.rereads.length) continue;
      // One proven batch is the round's only when no other could still carry the question:
      // recording it while another runs could release that one's charge on the first's outcome.
      if (found.undecided) return waiting(found.truncated ? "the search did not reach back to this question (too many batches, or too little of this request left); nothing is decided meanwhile"
        : "a batch that could carry this question has not ended yet");
      // What the round's batch is gets decided once (`submitted` and `presumed` share one name):
      // a pass that read an older round and decides otherwise loses the write and reads again.
      const n = round.claims.at(-1)!.n;
      await writeEvent(ctx, roundId, known.found.length === 1 ? { kind: "submitted", n, batchId: known.found[0]!, at: Date.now() }
        // None found: the create is presumed lost (rule 1). Nothing is sent again.
        : { kind: "presumed", n, at: Date.now() });
      continue;
    }
    // Its charge counted at the most it could be once the outcome is recorded; the question is then asked synchronously.
    if (step.step === "presumed") {
      await writeEvent(ctx, roundId, { kind: "fallback", batchId: null, resultType: "presumed-lost", errorType: null, at: Date.now() });
      continue;
    }
    // poll
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

/** A finished round that could still have a copy it has not found searches again (rule 5): a held round
 * while another copy could run, a presumed-lost round once a day after the presumption. It only reads the
 * provider and records what it finds: no purchase, create, cancel or release follows from it. Whether it searched. */
async function discover(ctx: Context, round: QualityBatchRound): Promise<boolean> {
  const searchedAt = Date.now();
  if (!qualityBatchSearching(round, searchedAt)) return false;
  const window = qualityBatchSearchWindow(round);
  let found: Awaited<ReturnType<QualityBatchTransport["find"]>>;
  // The copies already known are proven already: a search reads only new ones, so one that cannot be read keeps no search waiting.
  try { found = await ctx.transport.find(round.intent.customId, window.sinceMs, ctx.deadlineAt, window.untilMs, new Set(round.batchIds)); }
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

/** The ledger as the round's record says it must be (rules 0 and 6): its outcome applied, and every reread
 * counted as a charge of its own. Idempotent: applied by any pass, as often as needed. */
async function applyRecord(ctx: Context, round: QualityBatchRound, pendingKeys?: ReadonlySet<string>) {
  const failures: unknown[] = [];
  try { await applyTerminal(ctx, round, pendingKeys); }
  catch (error) { failures.push(error); }
  for (const reread of round.rereads) {
    try { await lateCharge(ctx, round, reread.batchId, reread.results); }
    catch (error) { failures.push(error); }
  }
  raise(failures);
}

/**
 * A finished round's housekeeping (rules 0, 5 and 6). The ledger is made to match the record first; only once
 * it does are copies read and deleted, so a copy bearing the outcome's own receipt is counted as the outcome's
 * charge, and nothing is deleted that the ledger has not counted. Then the copies already known (their bills,
 * their deletion where due) and the search for further copies, what it finds read and deleted in the same pass
 * when there is room: the known copies first one minute and the search first another, so however slow the
 * provider, neither keeps the other out for good. Each step runs whatever failed before it, and every failure
 * is raised at the end.
 */
async function maintain(ctx: Context, round: QualityBatchRound, gameDeleted: boolean, pendingKeys?: ReadonlySet<string>) {
  const failures: unknown[] = [];
  const step = async (work: () => Promise<unknown>) => { try { await work(); } catch (error) { failures.push(error); } };
  let applied = false;
  await step(async () => { await applyRecord(ctx, round, pendingKeys); applied = true; });
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
  // One read of the ledger for the slice: only an outcome whose reservation is still pending has anything to apply.
  const worldId = rounds.length ? qualityBatchRoundOf(rounds[0]![1]).intent.worldId : null;
  const pendingKeys = worldId ? new Set((await boardWizardBudgetOf(c).audit(worldId)).pendingRequestKeys) : new Set<string>();
  for (const [roundId, events] of rounds) {
    if (deadlineAt !== undefined && deadlineAt - Date.now() < POLL_NEED_MS) return;
    const round = qualityBatchRoundOf(events), ctx: Context = { c, transport, gameId, fence, question: null, stopping: false, deadlineAt };
    if (round.terminal) { await maintain(ctx, round, false, pendingKeys); continue; }
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
  const work: { gameId: string; roundId: string; terminal: boolean; faulted: boolean }[] = [];
  let rounds = 0, failed = 0;
  const readAt = Date.now();
  for (const [gameId, gameRows] of byGame) {
    const game = states.get(gameId) ?? null;
    // One game's unreadable record never stops the sweep of the others; that game's
    // rounds stay as they are, counted, for the next tick or a person.
    try {
      for (const [roundId, events] of roundsOf(gameRows, gameId)) {
        const round = qualityBatchRoundOf(events), faulted = round.rereads.length > 0;
        // A provider fault on record (rule 6) keeps its round's ledger matched to the record on every tick, whatever else is
        // done, and an open round with one is held by the tick, whoever's it is.
        if (faulted || (round.terminal ? qualityBatchSearching(round, readAt) || qualityBatchLateDue(round).length > 0
          || qualityBatchCleanupDue(round, deletedGame(game)) : !generating(game))) work.push({ gameId, roundId, terminal: !!round.terminal, faulted });
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
    const { gameId, roundId, terminal, faulted } = work[(start + i) % work.length]!;
    // A failed write or read leaves the round as it is, for the next tick or a person.
    try {
      // The game as it is now, and again before any action its own worker would not take.
      const readGame = () => c.db.game.findUnique({ where: { id: gameId }, select: { status: true, deletedAt: true } });
      const game = await readGame(), live = generating(game);
      const deadlineAt = Math.min(options.deadlineAt, Date.now() + QUALITY_BATCH_SWEEP_ROUND_MS);
      const ctx: Context = { c, transport, gameId, fence: null, question: null, stopping: !live, deadlineAt,
        stillStopped: async () => !generating(await readGame()) };
      if (!terminal) {
        if (live && !faulted) continue; // its own slices advance it
        // A live game's faulted round is only held and its record applied (its first steps): as stopping, so whatever
        // another pass decided meanwhile, the tick never links, creates or cancels for a game that is generating.
        await advance(live ? { ...ctx, stopping: true } : ctx, roundId);
      // A finished round's housekeeping moves no money its outcome did not decide, so it needs no slice.
      } else await maintain(ctx, await readRound(ctx, roundId), deletedGame(game));
      rounds++;
    } catch { failed++; }
  }
  return { rounds, failed };
}

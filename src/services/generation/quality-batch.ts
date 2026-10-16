import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { anthropicVisualReviewBody, readAnthropicVisualReview } from "../../infra/generation/anthropic-visual-review";
import { visualReviewBatchCharge } from "../../infra/generation/visual-review-pricing";
import { QualityBatchRefused, type QualityBatchResult, type QualityBatchTransport } from "../../infra/generation/types";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import {
  QUALITY_BATCH_VERSION, decideQualityBatchResults, nextQualityBatchStep, qualityBatchCleanupDue, qualityBatchDeletable, qualityBatchEventName, qualityBatchLateDue,
  qualityBatchReserveMicroUsd, qualityBatchRoundOf, qualityBatchSearchWindow, qualityBatchSearching,
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
    amountMicroUsd: 0, costBasis: "provider-billed" }));
}

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
    amountMicroUsd: intent.batchReserveMicroUsd, costBasis: "conservative-upper-estimate" }));
}

/**
 * The ledger as the round's terminal outcome says it must be (rule 0). Applied right after the outcome is
 * written, and again by any pass that reads it, since a worker can stop in between: a reservation that
 * committed after a close, by a worker that stopped before settling it, is settled here too. Only a pending
 * reservation is ever changed: once settled or held, the batch key is what the outcome made it, so a pass
 * that decided otherwise from an older read never moves money.
 */
async function applyTerminal(ctx: Context, round: QualityBatchRound, pendingKeys?: ReadonlySet<string>) {
  const { intent } = round, terminal = round.terminal!, budget = boardWizardBudgetOf(ctx.c);
  if (pendingKeys && !pendingKeys.has(intent.batchKey)) return;
  if ((await budget.readRequest(intent.worldId, intent.batchKey))?.state !== "pending") return;
  if (terminal.kind === "answered") await budget.settle(intent.worldId, intent.batchKey, terminal.evidence);
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

/** One ended batch's result for this round, recorded as its terminal outcome (rule 0): answered, at zero, or
 * held. The ledger follows from the outcome; an answer is retained before it is recorded. */
async function reconcile(ctx: Context, round: QualityBatchRound, batchId: string, results: readonly QualityBatchResult[]): Promise<void> {
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
  // Read exactly as the synchronous route reads its reply; priced by the tier the answer says served it.
  const reading = readAnthropicVisualReview(POLICY, { ok: true, requestId: null }, result.message);
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
    usageId: sha(JSON.stringify(reply.usage)), rawUsage: reply.usage as BudgetJson, model: reply.model!,
    amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
  await keep({ ...base, evidence, unknownReason: null });
  await writeEvent(ctx, intent.roundId, { kind: "answered", batchId, amountMicroUsd: evidence.amountMicroUsd,
    servedTier: String(reading.usage?.service_tier), evidence, at: Date.now() });
}

/**
 * What another copy of a finished round was billed (rule 5), with what the provider returned for it.
 * The bills of the copies read must fit in what the ledger counted for the round beyond its own batch:
 * the presumption, for a create presumed lost; nothing, once the round's batch is billed. A bill above
 * it (an answer the standard tier served, or a copy the provider made), or one that cannot be stated, is
 * recorded against the settled charge as a conflict, which holds the world: the ledger never understates.
 * A charge held as unknown already holds the world; the copy's receipts are kept for the person.
 */
async function lateCharge(ctx: Context, round: QualityBatchRound, batchId: string, results: readonly QualityBatchResult[]) {
  const { intent } = round, budget = boardWizardBudgetOf(ctx.c), decision = decide(results, intent.customId), receipts = receiptsOf(results, intent.customId);
  // Errored, canceled and expired requests are documented as unbilled.
  if (decision.decision === "unbilled-fallback" || decision.decision === "unbilled-held") return { amountMicroUsd: 0, receipts };
  let priced: WorldChargeEvidence | null = null, reason = decision.decision === "held" ? decision.reason : "";
  if (decision.decision === "answer") {
    const result = results.find(r => r.customId === intent.customId) as Extract<QualityBatchResult, { type: "succeeded" }>;
    const reading = readAnthropicVisualReview(POLICY, { ok: true, requestId: null }, result.message);
    const charge = visualReviewBatchCharge(POLICY, reading.model, reading.usage);
    if (!charge.costUnknown && reading.requestId) priced = canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace, providerRequestId: reading.requestId,
      usageId: sha(JSON.stringify(reading.usage)), rawUsage: reading.usage as BudgetJson, model: reading.model!,
      amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
    else reason = `the answer's charge cannot be stated (tier ${String(reading.usage?.service_tier ?? "none")}, model ${reading.model ?? "none"})`;
  }
  const amountMicroUsd = priced?.amountMicroUsd ?? null, counted = await budget.readRequest(intent.worldId, intent.batchKey);
  if (counted?.state !== "settled" || !counted.evidence) return { amountMicroUsd, receipts };
  const allowance = counted.evidence.amountMicroUsd - (round.terminal?.kind === "answered" ? round.terminal.amountMicroUsd : 0);
  const read = round.lates.map(late => late.amountMicroUsd);
  if (amountMicroUsd !== null && !read.includes(null) && (read as number[]).reduce((sum, amount) => sum + amount, amountMicroUsd) <= allowance)
    return { amountMicroUsd, receipts };
  const rawUsage = { basis: "a copy whose bill cannot be stated: counted at the synchronous reservation for a person to reconcile",
    batchId, customId: intent.customId, reason, results: receipts } as unknown as BudgetJson;
  const evidence = priced ?? canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace,
    providerRequestId: receipts.find(receipt => receipt.requestId)?.requestId ?? `late/${batchId}/${intent.customId}`,
    usageId: sha(JSON.stringify(rawUsage)), rawUsage, model: intent.model, amountMicroUsd: intent.syncReserveMicroUsd, costBasis: "conservative-upper-estimate" });
  // The charge is settled: different evidence is recorded beside it as a conflict (committed), which holds the world.
  try { await budget.settle(intent.worldId, intent.batchKey, evidence); }
  catch (error) { if (!(error instanceof WorldBudgetError) || error.code !== "evidence_conflict") throw error; }
  return { amountMicroUsd, receipts };
}

/** Records a copy's bill once. Priced against every copy already read, so the next number is written only
 * over the bills it counted; a pass that lost it reads the round again and prices it again. */
async function recordLate(ctx: Context, roundId: string, batchId: string, results: readonly QualityBatchResult[]) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const round = await readRound(ctx, roundId);
    if (round.billedIds.includes(batchId)) return;
    const { amountMicroUsd, receipts } = await lateCharge(ctx, round, batchId, results);
    if ((await writeEvent({ ...ctx, fence: null }, roundId, { kind: "late", n: round.lates.length + 1, batchId, amountMicroUsd, results: receipts, at: Date.now() })).won) return;
  }
  throw Error("QUALITY_BATCH: a copy's bill could not be recorded");
}

/** Each copy of a finished round whose bill is not in the record yet, read before it may be deleted (rule 5).
 * It only reads the provider; a copy that cannot be read yet (one still running) is kept, and read later. */
async function reconcileLate(ctx: Context, round: QualityBatchRound) {
  for (const batchId of qualityBatchLateDue(round)) {
    // Its record and then its results file: room for both reads before the first starts.
    if (!roomFor(ctx, 2 * CALL_NEED_MS)) return;
    let results: QualityBatchResult[];
    try { results = await ctx.transport.results(batchId, ctx.deadlineAt); }
    catch { continue; }
    await recordLate(ctx, round.intent.roundId, batchId, results);
  }
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
      // Whoever wrote the outcome, the ledger is made to match it before anything follows from it (rule 0).
      await applyTerminal(ctx, round);
      if (step.terminal.kind === "held") return { kind: "held", reason: `Quality question in Message Batches: ${step.terminal.reason}` };
      if (step.terminal.kind === "fallback" || ctx.stopping) return proceed;
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
      try { found = await ctx.transport.find(round.intent.customId, step.sinceMs, ctx.deadlineAt, step.untilMs); }
      catch (error) { return waiting(`the provider could not be searched (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
      // Every batch proven to carry the question is kept before anything is decided from it: a
      // later search that no longer sees a copy cannot undo it. Two copies hold the round.
      const known = await recordFound(ctx, roundId, found.proven, !found.undecided, searchedAt);
      if (known.batchIds.length > 1) continue;
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
  const removed: string[] = [];
  for (const batchId of qualityBatchDeletable(round, gameDeleted)) {
    if (!roomFor(ctx, CALL_NEED_MS)) break;
    try { await ctx.transport.remove(batchId); removed.push(batchId); }
    catch { break; } // retried on a later slice or tick; the round itself is finished
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
  try { found = await ctx.transport.find(round.intent.customId, window.sinceMs, ctx.deadlineAt, window.untilMs); }
  catch { return true; } // the next slice or tick searches again
  await recordFound(ctx, round.intent.roundId, found.proven, !found.undecided, searchedAt);
  return true;
}

/** Copies already known: each one's bill read, then those that may go deleted. */
async function settleCopies(ctx: Context, round: QualityBatchRound, gameDeleted: boolean) {
  if (qualityBatchLateDue(round).length) { await reconcileLate(ctx, round); round = await readRound(ctx, round.intent.roundId); }
  await cleanup(ctx, round, gameDeleted);
}

/**
 * A finished round's housekeeping (rules 0 and 5), in the order the money comes first: the ledger made to
 * match its outcome, the bill of every known copy, their deletion where due, and only then the search for
 * further copies, which can take the rest of the time; what it finds is read and deleted in the same pass
 * when there is room, and on a later one otherwise.
 */
async function maintain(ctx: Context, round: QualityBatchRound, gameDeleted: boolean, pendingKeys?: ReadonlySet<string>) {
  await applyTerminal(ctx, round, pendingKeys);
  await settleCopies(ctx, round, gameDeleted);
  if (await discover(ctx, round)) await settleCopies(ctx, await readRound(ctx, round.intent.roundId), gameDeleted);
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
          : !generating(game)) work.push({ gameId, roundId, terminal: !!round.terminal });
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

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { anthropicVisualReviewBody, readAnthropicVisualReview } from "../../infra/generation/anthropic-visual-review";
import { visualReviewBatchCharge } from "../../infra/generation/visual-review-pricing";
import { QualityBatchRefused, type QualityBatchResult, type QualityBatchTransport } from "../../infra/generation/types";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import {
  QUALITY_BATCH_VERSION, decideQualityBatchResults, nextQualityBatchStep, qualityBatchEventName, qualityBatchReserveMicroUsd, qualityBatchRoundOf,
  type QualityBatchEvent, type QualityBatchIntent, type QualityBatchRound,
} from "../../domain/generation/quality-batch-round";
import { visualReviewPolicy } from "../../domain/generation/visual-review-policy";
import type { PreparedVisualReview } from "./visual-review";
import { canonicalChargeEvidence, WorldBudgetError, type BudgetJson, type WorldChargeEvidence } from "./world-budget";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import { fenceLocalPatchImages, LocalPatchDeleted, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { inventorySelfRepairRequest } from "./local-patch-self-repair";
import { RETAINED_PURCHASE_VERSION, retainedPayloadDigest } from "./paid-operation";
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
 *    settled with the identical bill, which the ledger records as a LINKED alias
 *    of the batch key's charge (counted once). `purchaseOnce` replays it like any
 *    answer already bought, and every check of a dual stage holds as it does today.
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
  readonly deadlineAt?: number;
};

/** The Messages params a batch request carries: the synchronous body without its tier. */
export function qualityBatchParams(question: PreparedVisualReview): Record<string, unknown> {
  if (question.role !== "scene-quality" || question.policy.provider !== "anthropic" || question.policy.model !== POLICY.model || question.effort !== "high")
    throw Error("QUALITY_BATCH: only the Opus HIGH scene-quality question is batched");
  return anthropicVisualReviewBody({ prompt: question.prompt, images: question.images, imageLabels: question.labels, effort: question.effort,
    maxOutputTokens: question.policy.maxOutputTokens }, null);
}

/** Every round of one game, by round id, oldest event first. A record that cannot be read is refused, not skipped. */
async function gameRounds(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<Map<string, QualityBatchEvent[]>> {
  const rows = await db.auditLog.findMany({ where: { action: QUALITY_BATCH_ACTION, entityType: "Game", entityId: gameId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const rounds = new Map<string, QualityBatchEvent[]>();
  for (const row of rows) {
    const match = EVENT_ID.exec(row.id);
    let event: QualityBatchEvent | null = null;
    try { event = JSON.parse(row.metaJson ?? "null"); } catch { /* refused below */ }
    if (!match || !event || row.actorType !== "SYSTEM" || row.actorId !== null || eventId(match[1]!, qualityBatchEventName(event)) !== row.id
      || (event.kind === "intent" && (event.intent.roundId !== match[1] || event.intent.gameId !== gameId)))
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
    await budget.reserve(intent.worldId, { requestKey: intent.batchKey, scope: "judge", operationFingerprint: intent.fingerprint, reserveMicroUsd: intent.batchReserveMicroUsd });
    return null;
  }
  if (held.state !== "pending" || held.scope !== "judge" || held.operationFingerprint !== intent.fingerprint || held.reserveMicroUsd !== intent.batchReserveMicroUsd)
    return { kind: "held", reason: `${intent.batchKey} is ${held.state} with other terms: not this round's reservation` };
  return null;
}

/** A documented-unbilled outcome, recorded as what it is: zero, from the provider's own statement. */
async function settleUnbilled(ctx: Context, intent: QualityBatchIntent, batchId: string | null, resultType: string, errorType: string | null) {
  const budget = boardWizardBudgetOf(ctx.c);
  if (!await budget.readRequest(intent.worldId, intent.batchKey)) return; // never reserved, so never sent
  const rawUsage = { resultType, errorType, batchId, customId: intent.customId,
    basis: batchId ? "documented unbilled batch result" : "every create was refused before a batch existed" };
  await budget.settle(intent.worldId, intent.batchKey, canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace,
    providerRequestId: `${batchId ?? "unsent"}/${intent.customId}`, usageId: sha(JSON.stringify(rawUsage)), rawUsage, model: intent.model,
    amountMicroUsd: 0, costBasis: "provider-billed" }));
}

/** Hold with the charge unknown: a person reconciles it; nothing is asked again automatically. */
async function holdUnknown(ctx: Context, round: QualityBatchRound, reason: string) {
  const budget = boardWizardBudgetOf(ctx.c), held = await budget.readRequest(round.intent.worldId, round.intent.batchKey);
  if (held && held.state === "pending") await budget.markUnknown(round.intent.worldId, round.intent.batchKey, `quality batch ${round.intent.roundId}: ${reason}`);
  await writeEvent(ctx, round.intent.roundId, { kind: "held", reason, at: Date.now() });
}

async function create(ctx: Context, round: QualityBatchRound, claim: number): Promise<QualityBatchGate | "advanced"> {
  if (ctx.stopping || !ctx.question) return waiting("the next create belongs to this question's own review");
  if (ctx.deadlineAt !== undefined && ctx.deadlineAt - Date.now() < QUALITY_BATCH_CREATE_NEED_MS) return waiting("too little of this request is left to create the batch");
  const params = qualityBatchParams(ctx.question);
  if (sha(JSON.stringify(params)) !== round.intent.paramsSha256 || ctx.question.fingerprint !== round.intent.fingerprint)
    throw Error("QUALITY_BATCH: the question differs from its round's intent");
  const blocked = await ensureReserved(ctx, round.intent);
  if (blocked) return blocked;
  // The claim before the create: of two workers only one sends it.
  const claimed = await writeEvent(ctx, round.intent.roundId, { kind: "claim", n: claim, at: Date.now() });
  if (!claimed.won) return waiting("another worker claimed this create");
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

/** One ended batch's result for this round: retained and settled, settled at zero, or held. */
async function reconcile(ctx: Context, round: QualityBatchRound, batchId: string, results: readonly QualityBatchResult[]): Promise<void> {
  const { intent } = round, budget = boardWizardBudgetOf(ctx.c);
  const decision = decideQualityBatchResults(results.map(r => ({ customId: r.customId, type: r.type, errorType: r.type === "errored" ? r.errorType : null })), intent.customId);
  if (decision.decision === "unbilled-fallback" || decision.decision === "unbilled-held") {
    await settleUnbilled(ctx, intent, batchId, decision.resultType, decision.errorType);
    await writeEvent(ctx, intent.roundId, decision.decision === "unbilled-held" ? { kind: "held", reason: decision.reason, at: Date.now() }
      : { kind: "fallback", batchId, resultType: decision.resultType, errorType: decision.errorType, at: Date.now() });
    return;
  }
  if (decision.decision === "held") return holdUnknown(ctx, round, decision.reason);
  const result = results.find(r => r.customId === intent.customId) as Extract<QualityBatchResult, { type: "succeeded" }>;
  // Read exactly as the synchronous route reads its reply; priced by the tier the answer says served it.
  const reading = readAnthropicVisualReview(POLICY, { ok: true, requestId: null }, result.message);
  const charge = visualReviewBatchCharge(POLICY, reading.model, reading.usage);
  const reply = { ...reading, costUnknown: charge.costUnknown, verdict: null };
  const bytes = Buffer.from(JSON.stringify({ ...reply, policy: POLICY, fingerprint: intent.fingerprint, channel: CHANNEL, batchId }));
  const store = new LocalPatchRetainedPurchaseStore(ctx.c, ctx.gameId, budget);
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
    return holdUnknown(ctx, round, reason);
  }
  const evidence: WorldChargeEvidence = canonicalChargeEvidence({ providerNamespace: ctx.transport.namespace, providerRequestId: reply.requestId,
    usageId: sha(JSON.stringify(reply.usage)), rawUsage: reply.usage as BudgetJson, model: reply.model!,
    amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
  await keep({ ...base, evidence, unknownReason: null });
  await budget.settle(intent.worldId, intent.batchKey, evidence);
  await writeEvent(ctx, intent.roundId, { kind: "answered", batchId, amountMicroUsd: evidence.amountMicroUsd,
    servedTier: String(reading.usage?.service_tier), at: Date.now() });
}

/**
 * The dual review's own key, settled with the batch key's bill: a linked alias the
 * ledger counts once, carrying the same retained answer under its own address.
 */
async function link(ctx: Context, round: QualityBatchRound) {
  const { intent } = round, budget = boardWizardBudgetOf(ctx.c);
  const existing = await budget.readRequest(intent.worldId, intent.syncKey);
  if (existing?.state === "settled" || existing?.state === "linked") return;
  const answer = await new PrismaRetainedPurchaseStore(ctx.c.db).get(intent.worldId, intent.batchKey);
  if (!answer?.evidence || answer.operationFingerprint !== intent.fingerprint) throw Error("QUALITY_BATCH: an answered round has no retained answer to deliver");
  if (existing && (existing.state !== "pending" || existing.scope !== "judge" || existing.operationFingerprint !== intent.fingerprint
    || existing.reserveMicroUsd !== intent.syncReserveMicroUsd)) throw Error(`QUALITY_BATCH: ${intent.syncKey} is ${existing.state} with other terms`);
  await inventorySelfRepairRequest(ctx.c, ctx.gameId, intent.syncKey, ctx.fence ?? (async () => {}));
  // The dual review's own reservation, so its replay finds the same terms. It is
  // checked against capacity like any reservation and settles at once, below it.
  if (!existing) await budget.reserve(intent.worldId, { requestKey: intent.syncKey, scope: "judge", operationFingerprint: intent.fingerprint, reserveMicroUsd: intent.syncReserveMicroUsd });
  await new LocalPatchRetainedPurchaseStore(ctx.c, ctx.gameId, budget).put(intent.worldId, intent.syncKey, { version: RETAINED_PURCHASE_VERSION,
    worldId: intent.worldId, requestKey: intent.syncKey, scope: "judge", operationFingerprint: intent.fingerprint, payloadSha256: answer.payloadSha256,
    bytes: answer.bytes, evidence: answer.evidence, unknownReason: null });
  await budget.settle(intent.worldId, intent.syncKey, answer.evidence);
}

/** Move one round as far as it can go now. Transport failures wait; ledger and record failures are raised. */
async function advance(ctx: Context, roundId: string): Promise<QualityBatchGate> {
  for (let turn = 0; turn < 6; turn++) {
    const round = await readRound(ctx, roundId), step = nextQualityBatchStep(round, Date.now());
    if (step.step === "done") {
      if (step.terminal.kind === "held") return { kind: "held", reason: `Quality question in Message Batches: ${step.terminal.reason}` };
      if (step.terminal.kind === "fallback" || ctx.stopping) return proceed;
      await link(ctx, round);
      return proceed;
    }
    if (step.step === "wait") return waiting(step.reason);
    if (step.step === "hold") {
      // A create refused outright created nothing: zero, and the question waits for a person.
      const refusal = round.refusals.at(-1)!;
      await settleUnbilled(ctx, round.intent, null, `create-refused-${refusal.status}`, refusal.errorType);
      await writeEvent(ctx, roundId, { kind: "held", reason: step.reason, at: Date.now() });
      continue;
    }
    if (step.step === "fallback-unsent") {
      await settleUnbilled(ctx, round.intent, null, "never-created", null);
      await writeEvent(ctx, roundId, { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: Date.now() });
      continue;
    }
    if (step.step === "create") {
      const created = await create(ctx, round, step.claim);
      if (created !== "advanced") return created;
      continue;
    }
    if (step.step === "find") {
      let found: { proven: string[]; undecided: boolean };
      try { found = await ctx.transport.find(round.intent.customId, step.sinceMs); }
      catch (error) { return waiting(`the provider could not be searched (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
      if (found.proven.length > 1) { await holdUnknown(ctx, round, `${found.proven.length} batches carry this one question`); continue; }
      if (found.proven.length === 1) {
        await writeEvent(ctx, roundId, { kind: "submitted", n: round.claims.at(-1)!.n, batchId: found.proven[0]!, at: Date.now() });
        continue;
      }
      if (found.undecided) return waiting("a batch that could carry this question has not ended yet");
      if (ctx.stopping) {
        // Proven never created, and the game is not generating: nothing to ask, nothing billed.
        await settleUnbilled(ctx, round.intent, null, "never-created", null);
        await writeEvent(ctx, roundId, { kind: "fallback", batchId: null, resultType: "never-created", errorType: null, at: Date.now() });
        continue;
      }
      const created = await create(ctx, round, step.nextClaim);
      if (created !== "advanced") return created;
      continue;
    }
    // poll
    if (ctx.deadlineAt !== undefined && ctx.deadlineAt - Date.now() < POLL_NEED_MS) return waiting("too little of this request is left to read the batch");
    let status: Awaited<ReturnType<QualityBatchTransport["status"]>>;
    try { status = await ctx.transport.status(step.batchId); }
    catch (error) { return waiting(`the batch could not be read (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
    if (status === "in_progress") {
      if (!step.cancelDue && !ctx.stopping) return waiting("the batch is still running");
      // Cancelled once at the deadline, and again while it keeps running; cancelling is idempotent.
      try { await ctx.transport.cancel(step.batchId); }
      catch (error) { return waiting(`the cancel was not acknowledged (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
      if (round.cancelAt === null) await writeEvent(ctx, roundId, { kind: "cancel", at: Date.now() });
      return waiting(ctx.stopping ? "cancelled: the game is not generating" : "cancelled at its deadline; what it finished is settled when it ends");
    }
    if (status === "canceling") return waiting("the batch is being cancelled");
    let results: QualityBatchResult[];
    try { results = await ctx.transport.results(step.batchId); }
    catch (error) { return waiting(`the results could not be read (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
    await reconcile(ctx, round, step.batchId, results);
  }
  return waiting("the round is still advancing");
}

/** The provider's copy of a finished round, deleted once its result is kept. A held round keeps its batch for the person. */
async function cleanup(ctx: Context, round: QualityBatchRound) {
  if (!round.submitted || round.deleted || !round.terminal || round.terminal.kind === "held") return;
  try { await ctx.transport.remove(round.submitted.batchId); }
  catch { return; } // retried on a later slice; the round itself is finished
  await writeEvent({ ...ctx, fence: null }, round.intent.roundId, { kind: "deleted", batchId: round.submitted.batchId, at: Date.now() });
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
  // Deletion must find whatever this key ever retains, before anything is bought under it.
  await inventorySelfRepairRequest(c, input.gameId, batchKey, input.fence);
  return advance(ctx, roundId);
}

/** Every open round of one generating game, advanced once: polled, cancelled at its
 * deadline, or settled and linked when its batch has ended. It never creates. */
export async function advanceQualityBatches(c: Container, gameId: string, fence: Fence, deadlineAt?: number): Promise<void> {
  const transport = c.qualityBatch;
  if (!transport) return;
  for (const [roundId, events] of await gameRounds(c.db, gameId)) {
    if (deadlineAt !== undefined && deadlineAt - Date.now() < POLL_NEED_MS) return;
    const round = qualityBatchRoundOf(events), ctx: Context = { c, transport, gameId, fence, question: null, stopping: false, deadlineAt };
    if (round.terminal) { await cleanup(ctx, round); continue; }
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

/**
 * Rounds of games that are no longer generating (deleted, stopped, refunded,
 * finished): cancelled now, settled when their batch ends, the provider's copy
 * deleted. A deleted game's answer is not kept; its bill is. Never creates,
 * links or falls back. For the scheduled tick, within its own deadline.
 */
export async function sweepQualityBatches(c: Container, options: { deadlineAt: number }): Promise<{ rounds: number }> {
  const transport = c.qualityBatch;
  if (!transport) return { rounds: 0 };
  const games = await c.db.auditLog.findMany({ where: { action: QUALITY_BATCH_ACTION, entityType: "Game" }, select: { entityId: true }, distinct: ["entityId"] });
  let rounds = 0;
  for (const { entityId: gameId } of games) {
    if (!gameId) continue;
    const game = await c.db.game.findUnique({ where: { id: gameId }, select: { status: true, deletedAt: true } });
    if (game && game.status === "TARGETS_GENERATING" && !game.deletedAt) continue; // its own slices advance it
    for (const [roundId, events] of await gameRounds(c.db, gameId)) {
      if (options.deadlineAt - Date.now() < POLL_NEED_MS) return { rounds };
      const round = qualityBatchRoundOf(events), ctx: Context = { c, transport, gameId, fence: null, question: null, stopping: true, deadlineAt: options.deadlineAt };
      if (round.terminal) { if (!round.deleted && round.submitted && round.terminal.kind !== "held") { await cleanup(ctx, round); rounds++; } continue; }
      await advance(ctx, roundId);
      rounds++;
    }
  }
  return { rounds };
}

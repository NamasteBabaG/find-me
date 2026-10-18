import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import {
  BACKGROUND_REVIEW_ROUND_VERSION, BACKGROUND_REVIEW_TRANSPORT, backgroundEventName, backgroundRoundOf, nextBackgroundStep,
  type BackgroundOutcomeState, type BackgroundReviewBinding, type BackgroundReviewEvent, type BackgroundReviewIntent, type BackgroundReviewRound,
} from "../../domain/generation/background-review-round";
import { isBackgroundReviewPolicy, visualReviewPolicy } from "../../domain/generation/visual-review-policy";
import { solBackgroundReviewBody } from "../../infra/generation/openai-background-review";
import { visualReviewCharge } from "../../infra/generation/visual-review-pricing";
import { BackgroundReviewRefused, type BackgroundReviewReading, type BackgroundReviewTransport } from "../../infra/generation/types";
import type { PreparedVisualReview } from "./visual-review";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { inventorySelfRepairRequest } from "./local-patch-self-repair";
import { isTheModelWeAsked, type LocalPatchJudgeResult } from "./local-patch-judge";
import { RETAINED_PURCHASE_VERSION, retainedPayloadDigest, type RetainedPurchase } from "./paid-operation";
import { canonicalChargeEvidence, WorldBudgetError, type BudgetJson } from "./world-budget";

/**
 * A new Sol continuity question of an enrolled world, asked once as an OpenAI
 * background response and polled across worker slices (background-review-round.ts).
 *
 * The round uses the dual review's own ledger key and retained store, so nothing
 * downstream changes: once the round has kept the provider's genuine result, the
 * dual review's `purchaseOnce` replays it (settling from the retained bill), and
 * an unpriced or lost result is the same unknown charge every other route holds.
 * A lost create is retained in exactly the no-response shape the interruption
 * recovery recognises, so only a separately admitted new question can follow it.
 */
export const SOL_BACKGROUND_ACTION = "generation:sol-background-review";
/** The retained no-response reason the interruption recovery requires, verbatim. */
const NO_RESPONSE_REASON = "Grouped review charge could not be verified";
const CREATE_NEED_MS = 100_000, POLL_NEED_MS = 35_000;
const KIND_ORDER: readonly BackgroundReviewEvent["kind"][] = ["intent", "claim", "submitted", "refused", "lost", "cancel", "outcome"];
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
export const backgroundRoundIdOf = (worldId: string, requestKey: string) => `sb${sha(JSON.stringify([BACKGROUND_REVIEW_ROUND_VERSION, worldId, requestKey])).slice(0, 30)}`;
const eventId = (roundId: string, name: string) => `aud_sb_${roundId}_${name}`;

export type BackgroundGate = { readonly kind: "proceed" } | { readonly kind: "waiting" | "held"; readonly reason: string };
const waiting = (reason: string): BackgroundGate => ({ kind: "waiting", reason: `Continuity question in the background: ${reason}` });
const held = (reason: string): BackgroundGate => ({ kind: "held", reason: `Continuity question in the background: ${reason}` });
type Fence = (tx: Prisma.TransactionClient) => Promise<void>;
export type BackgroundAsk = {
  readonly gameId: string; readonly worldId: string; readonly requestKey: string; readonly question: PreparedVisualReview;
  readonly reserveMicroUsd: number; readonly binding: BackgroundReviewBinding; readonly fence: Fence; readonly deadlineAt?: number;
};
type Ctx = Omit<BackgroundAsk, "question"> & {
  readonly question: Pick<PreparedVisualReview, "policy" | "fingerprint">;
  readonly c: Container; readonly roundId: string;
};
const roomFor = (ctx: Pick<Ctx, "deadlineAt">, needMs: number) => ctx.deadlineAt === undefined || ctx.deadlineAt - Date.now() >= needMs;

/** Every event of one round, in rule order. A record that cannot be read is refused, not skipped. */
async function readEvents(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string, roundId: string): Promise<BackgroundReviewEvent[]> {
  const rows = await db.auditLog.findMany({ where: { action: SOL_BACKGROUND_ACTION, entityType: "Game", entityId: gameId, id: { startsWith: `aud_sb_${roundId}_` } } });
  const events = rows.map(row => {
    let event: BackgroundReviewEvent | null = null;
    try { event = JSON.parse(row.metaJson ?? "null"); } catch { event = null; }
    if (!event || typeof event !== "object" || row.actorType !== "SYSTEM" || row.actorId !== null || row.id !== eventId(roundId, backgroundEventName(event))
      || (event.kind === "intent" && (event.intent?.roundId !== roundId || event.intent?.gameId !== gameId)))
      throw Error("BACKGROUND_REVIEW: a round record cannot be read; refusing to guess");
    return event;
  });
  return events.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

/** Written once, from the round as it stands inside the write (its intent row locked first). A loser gets nothing. */
async function writeEvent(ctx: Ctx, build: (round: BackgroundReviewRound) => BackgroundReviewEvent | null): Promise<boolean> {
  const built: { name: string | null } = { name: null };
  try {
    await ctx.c.db.$transaction(async tx => {
      await tx.auditLog.updateMany({ where: { id: eventId(ctx.roundId, "intent"), actorType: "SYSTEM" }, data: { actorType: "SYSTEM" } });
      await fenceLocalPatchImages(tx, ctx.gameId); await ctx.fence(tx);
      const event = build(backgroundRoundOf(await readEvents(tx, ctx.gameId, ctx.roundId)));
      if (!event) return;
      const name = built.name = backgroundEventName(event);
      await tx.auditLog.create({ data: { id: eventId(ctx.roundId, name), actorType: "SYSTEM", action: SOL_BACKGROUND_ACTION,
        entityType: "Game", entityId: ctx.gameId, metaJson: JSON.stringify(event) } });
    });
    return built.name !== null;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && built.name) return false;
    throw error;
  }
}

async function writeIntent(ctx: Ctx, intent: BackgroundReviewIntent) {
  const metaJson = JSON.stringify({ kind: "intent", intent } satisfies BackgroundReviewEvent);
  await ctx.c.db.$transaction(async tx => {
    const saved = await tx.auditLog.upsert({ where: { id: eventId(ctx.roundId, "intent") }, update: {}, create: { id: eventId(ctx.roundId, "intent"),
      actorType: "SYSTEM", action: SOL_BACKGROUND_ACTION, entityType: "Game", entityId: ctx.gameId, metaJson } });
    // Match every later write's lock order: intent, then game, then job.
    // A competing first caller may have observed no intent before this one committed.
    await fenceLocalPatchImages(tx, ctx.gameId); await ctx.fence(tx);
    if (saved.metaJson !== metaJson || saved.actorType !== "SYSTEM" || saved.actorId !== null
      || saved.action !== SOL_BACKGROUND_ACTION || saved.entityType !== "Game" || saved.entityId !== ctx.gameId)
      throw Error("BACKGROUND_REVIEW: this request key already has another intent");
  });
}

/** Bytes in the dual review's retained shape, so its replay and its recovery read them unchanged. */
function replyBytes(ctx: Ctx, reply: LocalPatchJudgeResult, extra: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({ ...reply, policy: ctx.question.policy, fingerprint: ctx.question.fingerprint, transport: BACKGROUND_REVIEW_TRANSPORT, ...extra }));
}
async function keep(ctx: Ctx, bytes: Buffer, outcome: Pick<RetainedPurchase, "evidence" | "unknownReason">) {
  const budget = boardWizardBudgetOf(ctx.c), store = new LocalPatchRetainedPurchaseStore(ctx.c, ctx.gameId, budget);
  await store.put(ctx.worldId, ctx.requestKey, { version: RETAINED_PURCHASE_VERSION, worldId: ctx.worldId, requestKey: ctx.requestKey, scope: "judge",
    operationFingerprint: ctx.question.fingerprint, payloadSha256: retainedPayloadDigest(bytes), bytes, ...outcome });
}
const NO_REPLY: LocalPatchJudgeResult = { verdict: null, raw: null, usage: null, requestId: null, model: null, finishReason: null, wireFault: "timeout", costUnknown: true };

/** The create's answer never arrived: an unknown charge, kept in full, in the no-response shape. */
async function recordLost(ctx: Ctx, reason: string): Promise<void> {
  // Kept first, then recorded: a restart in between finds the same bytes and records them.
  // Only the claim holder (whose own create failed) or a pass after the create's grace gets here.
  await keep(ctx, replyBytes(ctx, NO_REPLY, { backgroundState: "lost" }), { evidence: null, unknownReason: NO_RESPONSE_REASON });
  await writeEvent(ctx, round => round.terminal || round.submitted ? null : { kind: "lost", reason: reason.slice(0, 300), at: Date.now() });
  const round = backgroundRoundOf(await readEvents(ctx.c.db, ctx.gameId, ctx.roundId));
  if (round.terminal?.kind !== "lost") return;
  // One fixed reason, so a second pass changes nothing a recovery record binds.
  await boardWizardBudgetOf(ctx.c).markUnknown(ctx.worldId, ctx.requestKey, `${ctx.requestKey}: the background create's answer was lost; the charge is unknown and kept in full`);
}

async function create(ctx: Ctx, transport: BackgroundReviewTransport, body: Record<string, unknown>): Promise<BackgroundGate | null> {
  if (!roomFor(ctx, CREATE_NEED_MS)) return waiting("too little of this request is left to create the response");
  const budget = boardWizardBudgetOf(ctx.c);
  // In deletion's inventory before anything is reserved or sent under the key.
  await inventorySelfRepairRequest(ctx.c, ctx.gameId, ctx.requestKey, ctx.fence);
  try {
    await budget.reserve(ctx.worldId, { requestKey: ctx.requestKey, scope: "judge", operationFingerprint: ctx.question.fingerprint, reserveMicroUsd: ctx.reserveMicroUsd });
  } catch (error) {
    if (error instanceof WorldBudgetError && error.code === "world_held") return held("the world ledger is held; nothing was sent");
    throw error;
  }
  const reserved = await budget.readRequest(ctx.worldId, ctx.requestKey);
  if (reserved?.state !== "pending") return held(`${ctx.requestKey} is ${reserved?.state ?? "missing"}, not this round's reservation`);
  if (!roomFor(ctx, CREATE_NEED_MS)) return waiting("too little of this request is left to create the response");
  // The claim before the create: of two workers only one sends it, and only once ever.
  if (!await writeEvent(ctx, round => round.claimAt === null ? { kind: "claim", at: Date.now() } : null)) return waiting("another worker claimed this create");
  let responseId: string;
  try { ({ responseId } = await transport.create(body)); }
  catch (error) {
    if (error instanceof BackgroundReviewRefused) {
      const { status, errorType } = error;
      await writeEvent(ctx, round => round.terminal ? null : { kind: "refused", status, errorType, at: Date.now() });
      // Documented as created nothing: zero, from the provider's own refusal. The world still parks for a person.
      const rawUsage = { status, errorType, basis: "documented refusal before any response was created" };
      const evidence = canonicalChargeEvidence({ providerNamespace: transport.namespace, providerRequestId: `unsent/${ctx.roundId}`,
        usageId: sha(JSON.stringify(rawUsage)), rawUsage, model: ctx.question.policy.model, amountMicroUsd: 0, costBasis: "provider-billed" });
      await keep(ctx, replyBytes(ctx, { ...NO_REPLY, wireFault: "http", costUnknown: false }, { backgroundState: "refused", status }), { evidence, unknownReason: null });
      await budget.settle(ctx.worldId, ctx.requestKey, evidence, { onlyPending: true });
      return held(`the create was refused (${status}${errorType ? ` ${errorType}` : ""}); quota, credential and policy refusals are never asked again automatically`);
    }
    await recordLost(ctx, error instanceof Error ? error.message : String(error));
    return null;
  }
  // The id is written down at once: every later slice polls exactly this response.
  await writeEvent(ctx, round => round.terminal || round.submitted ? null : { kind: "submitted", responseId, at: Date.now() });
  return null;
}

/** What a terminal reading is: the dual review's reply, its bill when it can be stated, and the outcome it records. */
function readTerminal(ctx: Ctx, status: "completed" | "failed" | "cancelled" | "incomplete", reading: BackgroundReviewReading) {
  const { policy } = ctx.question;
  const rightModel = isTheModelWeAsked(reading.model, policy.model);
  const charge = visualReviewCharge(policy, reading.model, reading.usage);
  const tierKnown = reading.serviceTier === null || reading.serviceTier === "default";
  const wireFault: LocalPatchJudgeResult["wireFault"] = status === "failed" || status === "cancelled" ? "http" : status === "incomplete" ? "truncated"
    : !rightModel ? "wrong-model" : reading.raw === null ? "no-content" : reading.finishReason !== "stop" ? "truncated" : null;
  const reply: LocalPatchJudgeResult = { verdict: null, raw: reading.raw, usage: reading.usage, requestId: reading.responseId, model: reading.model,
    finishReason: reading.finishReason, wireFault, costUnknown: charge.costUnknown || !tierKnown };
  const evidence = reply.costUnknown || !reading.model ? null : canonicalChargeEvidence({ providerNamespace: `${policy.provider}:find-me-existing`,
    providerRequestId: reading.responseId, usageId: sha(JSON.stringify(reading.usage)), rawUsage: reading.usage as BudgetJson, model: reading.model,
    amountMicroUsd: Math.ceil(charge.costCents * 10_000), costBasis: "conservative-upper-estimate" });
  const state: BackgroundOutcomeState = !evidence ? "unpriced" : wireFault ? "unusable" : "answered";
  return { reply, evidence, state };
}

/**
 * Records the outcome of a result already kept under the key and applies it to the
 * ledger. Every reason is fixed for its response, so a repeat changes nothing a
 * recovery record binds. Only a pending reservation is ever settled.
 */
async function finishFromKept(ctx: Ctx, responseId: string, kept: RetainedPurchase): Promise<void> {
  let wire: { wireFault?: unknown; backgroundState?: unknown; providerStatus?: unknown };
  try { wire = JSON.parse(kept.bytes.toString()); } catch { throw Error("BACKGROUND_REVIEW: a kept result cannot be read"); }
  const providerStatus = typeof wire.providerStatus === "string" ? wire.providerStatus : "missing";
  const state: BackgroundOutcomeState = wire.backgroundState === "missing" ? "missing" : !kept.evidence ? "unpriced" : wire.wireFault ? "unusable" : "answered";
  await writeEvent(ctx, round => round.terminal ? null : { kind: "outcome", state, responseId, providerStatus, at: Date.now() });
  const budget = boardWizardBudgetOf(ctx.c);
  if (kept.evidence) await budget.settle(ctx.worldId, ctx.requestKey, kept.evidence, { onlyPending: true });
  else await budget.markUnknown(ctx.worldId, ctx.requestKey, state === "missing"
    ? `${ctx.requestKey}: background response ${responseId} is no longer available; the charge is unknown and kept in full`
    : `${ctx.requestKey}: background response ${responseId} ended ${providerStatus} without a charge that can be stated`);
}

async function poll(ctx: Ctx, transport: BackgroundReviewTransport, responseId: string, cancelDue: boolean): Promise<BackgroundGate | null> {
  // A result kept by a pass that stopped before recording it is that result: never read twice.
  const already = await new LocalPatchRetainedPurchaseStore(ctx.c, ctx.gameId, boardWizardBudgetOf(ctx.c)).get(ctx.worldId, ctx.requestKey);
  if (already) { await finishFromKept(ctx, responseId, already); return null; }
  if (!roomFor(ctx, POLL_NEED_MS)) return waiting("too little of this request is left to read the response");
  let state: Awaited<ReturnType<BackgroundReviewTransport["retrieve"]>>;
  // A failed read is not a failed review and never a reason to ask again: the same response is read later.
  try { state = await transport.retrieve(responseId); }
  catch (error) { return waiting(`the response could not be read (${error instanceof Error ? error.message.slice(0, 200) : "unknown"}); it is read again later`); }
  if (state.status === "queued" || state.status === "in_progress") {
    if (!cancelDue) return waiting(`the response is ${state.status}`);
    try { await transport.cancel(responseId); }
    catch (error) { return waiting(`the cancel was not acknowledged (${error instanceof Error ? error.message.slice(0, 200) : "unknown"})`); }
    await writeEvent(ctx, round => round.cancelAt === null && !round.terminal ? { kind: "cancel", at: Date.now() } : null);
    return waiting("cancelled at its deadline; whatever it ends as is recorded when it ends");
  }
  // Kept before it is recorded: a restart after this line finishes from the same bytes, never a second read.
  if (state.status === "missing") {
    // Expired or never readable: the charge is unknown and held. Never a free fallback.
    await keep(ctx, replyBytes(ctx, { ...NO_REPLY, requestId: responseId }, { backgroundState: "missing", responseId }),
      { evidence: null, unknownReason: "The background response expired before its result was read" });
  } else if ("reading" in state) {
    const { reply, evidence } = readTerminal(ctx, state.status, state.reading);
    await keep(ctx, replyBytes(ctx, reply, { responseId, providerStatus: state.status }),
      evidence ? { evidence, unknownReason: null } : { evidence: null, unknownReason: "Background review charge could not be verified" });
  } else throw Error("BACKGROUND_REVIEW: unexpected nonterminal response state");
  const kept = await new LocalPatchRetainedPurchaseStore(ctx.c, ctx.gameId, boardWizardBudgetOf(ctx.c)).get(ctx.worldId, ctx.requestKey);
  if (!kept) throw Error("BACKGROUND_REVIEW: a kept result was not found");
  await finishFromKept(ctx, responseId, kept);
  return null;
}

/**
 * Advance one round as far as it can go now. `proceed` means the round's result is
 * retained under the dual review's key (answered, unusable, unpriced, missing or
 * lost) and the dual review's ordinary replay decides it. Transport failures wait;
 * a refusal holds; ledger and record failures are raised.
 */
export async function askContinuityInBackground(c: Container, ask: BackgroundAsk): Promise<BackgroundGate> {
  const { question } = ask;
  if (!isBackgroundReviewPolicy(question.policy) || question.role !== "head-continuity") throw Error("BACKGROUND_REVIEW: only a Sol background continuity question");
  if (JSON.stringify(question.policy) !== JSON.stringify(visualReviewPolicy("head-continuity", "high", undefined, "responses-background")))
    throw Error("BACKGROUND_REVIEW: v1 records only the pinned Sol HIGH background contract");
  const ctx: Ctx = { ...ask, c, roundId: backgroundRoundIdOf(ask.worldId, ask.requestKey) };
  const body = solBackgroundReviewBody(question);
  const intent: BackgroundReviewIntent = { version: BACKGROUND_REVIEW_ROUND_VERSION, roundId: ctx.roundId, gameId: ask.gameId, worldId: ask.worldId,
    requestKey: ask.requestKey, fingerprint: question.fingerprint, bodySha256: sha(JSON.stringify(body)), reserveMicroUsd: ask.reserveMicroUsd, binding: ask.binding };
  const transport = c.backgroundReview;
  let events = await readEvents(c.db, ask.gameId, ctx.roundId);
  if (!events.length) {
    if (!transport) return held("the background transport is not configured; nothing was reserved or sent");
    const existing = await boardWizardBudgetOf(c).readRequest(ask.worldId, ask.requestKey);
    if (existing) return held(`${ask.requestKey} is already ${existing.state} outside a background round`);
    await writeIntent(ctx, intent);
    events = await readEvents(c.db, ask.gameId, ctx.roundId);
  }
  let round = backgroundRoundOf(events);
  if (JSON.stringify(round.intent) !== JSON.stringify(intent)) throw Error("BACKGROUND_REVIEW: the question differs from its round's intent");
  for (let turn = 0; turn < 4; turn++) {
    const step = nextBackgroundStep(round, Date.now());
    if (step.step === "done") return round.terminal?.kind === "refused" ? held(`the create was refused (${round.terminal.status})`) : { kind: "proceed" };
    if (step.step === "wait") return waiting(step.reason);
    if (!transport) return waiting("the background transport is not configured; the round keeps its reservation");
    let gate: BackgroundGate | null = null;
    if (step.step === "create") gate = await create(ctx, transport, body);
    else if (step.step === "lost") await recordLost(ctx, "the create was claimed and its answer never arrived within its grace");
    else gate = await poll(ctx, transport, step.responseId, step.cancelDue);
    if (gate) return gate;
    round = backgroundRoundOf(await readEvents(c.db, ask.gameId, ctx.roundId));
  }
  return waiting("the round is still advancing");
}

/**
 * Reconcile already-created responses independently of which hide the review picker
 * chooses. This sends only GET/cancel for recorded ids, never creates or reserves.
 * It also runs while the job is held, so another known bill cannot expire merely
 * because an unrelated question held generation. The v1 intent's policy is fixed
 * by askContinuityInBackground; no image or prompt needs to be invented to poll.
 */
export async function advanceContinuityInBackground(c: Container, gameId: string,
  options: { deadlineAt?: number } = {}): Promise<number> {
  if (!c.backgroundReview) return 0;
  const intents = await c.db.auditLog.findMany({ where: { action: SOL_BACKGROUND_ACTION, entityType: "Game", entityId: gameId,
    id: { endsWith: "_intent" } }, orderBy: { createdAt: "asc" } });
  const worldId = `${gameId}:board-wizard`, budget = boardWizardBudgetOf(c);
  let advanced = 0;
  for (const row of intents) {
    if (!roomFor(options, POLL_NEED_MS)) break;
    let event: Extract<BackgroundReviewEvent, { kind: "intent" }>;
    try { event = JSON.parse(row.metaJson ?? "null"); } catch { throw Error("BACKGROUND_REVIEW: unreadable sweep intent"); }
    const intent = event?.intent;
    if (event?.kind !== "intent" || !intent || intent.version !== BACKGROUND_REVIEW_ROUND_VERSION || intent.gameId !== gameId || intent.worldId !== worldId
      || intent.roundId !== backgroundRoundIdOf(worldId, intent.requestKey) || row.id !== eventId(intent.roundId, "intent")
      || row.actorType !== "SYSTEM" || row.actorId !== null || !/^[a-f0-9]{64}$/.test(intent.fingerprint)
      || !/^[a-f0-9]{64}$/.test(intent.bodySha256) || !intent.requestKey.endsWith(`:${intent.fingerprint}`))
      throw Error("BACKGROUND_REVIEW: invalid recorded sweep binding");
    const round = backgroundRoundOf(await readEvents(c.db, gameId, intent.roundId));
    const step = nextBackgroundStep(round, Date.now());
    if (step.step !== "poll" && step.step !== "lost") continue;
    const reserved = await budget.readRequest(worldId, intent.requestKey);
    if (!reserved || reserved.scope !== "judge" || reserved.operationFingerprint !== intent.fingerprint
      || reserved.reserveMicroUsd !== intent.reserveMicroUsd || reserved.conflicts.length)
      throw Error("BACKGROUND_REVIEW: recorded response has no matching reservation");
    const ctx: Ctx = { c, gameId, worldId, roundId: intent.roundId, requestKey: intent.requestKey, reserveMicroUsd: intent.reserveMicroUsd,
      binding: intent.binding, question: { fingerprint: intent.fingerprint, policy: visualReviewPolicy("head-continuity", "high", undefined, "responses-background") },
      fence: async () => {}, ...options };
    if (step.step === "lost") await recordLost(ctx, "the create was claimed and its answer never arrived within its grace");
    else await poll(ctx, c.backgroundReview, step.responseId, step.cancelDue);
    advanced++;
  }
  return advanced;
}

/** Appearances whose continuity question is a response already created and only awaiting it (`variantId:imageSha256`),
 * which advanceContinuityInBackground polls every slice. A record it cannot read names nothing: its review reads it. */
export async function backgroundReviewAwaitingProvider(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string, now = Date.now()): Promise<Set<string>> {
  const awaiting = new Set<string>();
  const intents = await db.auditLog.findMany({ where: { action: SOL_BACKGROUND_ACTION, entityType: "Game", entityId: gameId, id: { endsWith: "_intent" } } });
  for (const row of intents) {
    try {
      const intent = (JSON.parse(row.metaJson ?? "null") as Extract<BackgroundReviewEvent, { kind: "intent" }>).intent;
      if (nextBackgroundStep(backgroundRoundOf(await readEvents(db, gameId, intent.roundId)), now).step === "poll")
        awaiting.add(`${intent.binding.variantId}:${intent.binding.imageSha256}`);
    } catch { /* not named: its board is reviewed */ }
  }
  return awaiting;
}

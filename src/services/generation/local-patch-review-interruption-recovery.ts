import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { interruptedLocalPatchReviewRequest } from "../../domain/scene/local-patch-review-request";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import type { prepareLocalPatchBoardReview } from "./local-patch-board-review";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { sha256Bytes } from "./fixed-sprite";
import { WorldBudgetError, type WorldAutomaticReviewRecovery, type WorldAutomaticReviewRecoveryV2, type WorldAutomaticReviewRecoveryV3, type WorldAutomaticReviewRecoveryV4 } from "./world-budget";
import { WORLD_AUTOMATIC_REVIEW_RECOVERY_V1_LIMIT, WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT, WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT } from "../../domain/generation/world-budget";
import type { EvidenceRole, EvidenceStrategy } from "../../domain/scene/local-patch-evidence-policy";
import { dualReviewReserves } from "../../domain/generation/dual-review-reserve";
import { SUBJECT_REVIEW_RECOVERY, subjectUpgradeOf } from "./subject-enrollment";
import { BACKGROUND_REVIEW_TRANSPORT } from "../../domain/generation/background-review-round";
import { backgroundRoundOfKey, backgroundRoundsOnImage, backgroundRoundTerminal, providerEndedFailed } from "./continuity-background";
import { backgroundFailureKind } from "../../domain/generation/background-provider-error";
import { leanFailureAdmission, REVIEW_INTERRUPTION_POLICY_V3 } from "../../domain/generation/lean-review-recovery";
import { leanReviewRecoveryOf } from "./lean-review-recovery-pin";
import { leanCapacityRecoveryOf } from "./lean-capacity-recovery-pin";
import { CAPACITY_REVIEW_POLICY, capacityFailureCode } from "../../domain/generation/lean-capacity-recovery";

export const REVIEW_INTERRUPTION_POLICY = "local-patch-review-interruption/v1" as const;
/** The same rules for a world enrolled in the subject upgrade, once its two v1 records are spent. */
export const REVIEW_INTERRUPTION_POLICY_V2 = "local-patch-review-interruption/v2" as const;
/** A world pinned to local-patch-lean-review-recovery/v1, once its v1 and v2 records are spent. */
export { REVIEW_INTERRUPTION_POLICY_V3 };
type Prepared = Extract<Awaited<ReturnType<typeof prepareLocalPatchBoardReview>>, { ready: true }>;
type Question = { role: EvidenceRole; strategy: EvidenceStrategy };
/** A background response the provider itself ended `failed`, with no text and no usage (first seen 19 October, Flex). */
export const PROVIDER_FAILED_SHAPE = "background-provider-failed/v1" as const;

/**
 * The retained shapes an automatic continuation admits, and nothing else:
 *  - `timeout`: no answer at all (a synchronous transport timeout: every field empty);
 *  - `provider-failed`: a background response its provider ended `failed`, with no answer text and no usage, read once
 *    from its own response id. Whether it was billed cannot be stated, so it stays an unknown charge, counted in full.
 * A provider-failed reply that carries usage or text, another status, or another reason is not an interruption.
 */
export function interruptionShape(unknownReason: string | null, reply: Record<string, unknown> | null): "timeout" | "provider-failed" | null {
  if (!reply) return null;
  if (unknownReason === "Grouped review charge could not be verified" && reply.wireFault === "timeout" && reply.costUnknown === true
    && ["raw", "usage", "requestId", "model", "finishReason"].every(key => reply[key] === null)) return "timeout";
  if (unknownReason === "Background review charge could not be verified" && reply.transport === BACKGROUND_REVIEW_TRANSPORT
    && reply.providerStatus === "failed" && reply.wireFault === "http" && reply.costUnknown === true && reply.finishReason === "failed"
    && reply.raw === null && reply.usage === null && typeof reply.requestId === "string" && reply.requestId === reply.responseId) return "provider-failed";
  return null;
}

/**
 * The interruption a retained unknown answer records, when the automatic continuation admits it: its exact shape and,
 * for a provider-declared failure, the failed outcome its own background round recorded for that same response.
 * Reads only; never a provider. A retained payload alone never satisfies it.
 */
export async function admittedInterruption(c: Pick<Container, "db">, gameId: string, worldId: string, requestKey: string,
  retained: { readonly unknownReason: string | null; readonly bytes: Buffer }): Promise<{ shape: "timeout" | "provider-failed"; reply: Record<string, unknown> } | null> {
  let reply: Record<string, unknown> | null;
  try { reply = JSON.parse(retained.bytes.toString()); } catch { return null; }
  const shape = interruptionShape(retained.unknownReason, reply);
  if (!shape || !reply) return null;
  // A background response the provider ended `failed` is admitted only as its round recorded it: that response, unpriced.
  if (shape === "provider-failed") {
    const terminal = await backgroundRoundTerminal(c.db, gameId, worldId, requestKey);
    if (terminal?.kind !== "outcome" || terminal.state !== "unpriced" || terminal.providerStatus !== "failed"
      || terminal.responseId !== reply.requestId) return null;
  }
  return { shape, reply };
}

/**
 * Why a provider-declared failure may not be continued automatically, or null when it may (local-patch-lean-review-
 * recovery/v1). In every world, its recorded kind: a failure of the request itself, a flagged image or the account is
 * never asked again (a code is recorded only from background-provider-error/v1 on, so no earlier record reads
 * differently). In a pinned world also its image's bound: how many default-tier questions of the same role about the
 * same pixels the provider has ended `failed` (two questions of one round failing side by side count once each, per
 * role). Reads only; never a provider.
 */
export async function providerFailureRefusal(c: Pick<Container, "db">, gameId: string, worldId: string, requestKey: string,
  /** `pinned`: read as a pinned world would read it (a person's plan before the pin is written); default: the world's own pin. */
  options: { pinned?: boolean } = {}): Promise<string | null> {
  const round = await backgroundRoundOfKey(c.db, gameId, worldId, requestKey);
  if (round?.terminal?.kind !== "outcome") return `${requestKey}: its round recorded no outcome`;
  const pinned = options.pinned ?? !!await leanReviewRecoveryOf(c.db, gameId);
  const rounds = pinned ? await backgroundRoundsOnImage(c.db, gameId, round.intent.binding) : [];
  const role = rounds.find(one => one.requestKey === requestKey)?.role;
  const defaultTierFailures = rounds.filter(one => one.role === role && one.tier === "default" && providerEndedFailed(one)).length;
  const decision = leanFailureAdmission({ errorCode: round.terminal.errorCode, defaultTierFailures });
  return decision.admit ? null : `${requestKey}: ${decision.reason}`;
}

/** A new evidence question, never a re-buy or a quality approval. Only an exact
 * retained no-response transport failure, or a background response its provider
 * ended `failed` with no text and no usage, qualifies (`interruptionShape`). The full unknown charge
 * stays reserved; at most two such continuations fit the unchanged world cap,
 * and an enrolled world (subject-enrollment.ts) at most four more (v2). */
export async function recoverPreparedLocalPatchReview(c: Container, prepared: Prepared,
  fence?: (tx: Prisma.TransactionClient) => Promise<void>,
  /** The interrupted question's role and variant, for the image's evidence log. */
  question: Question = { role: "quality", strategy: "standard/v1" }): Promise<boolean> {
  return recoverPreparedLocalPatchReviews(c, prepared, [{ ...question, requestKey: prepared.requestKey, fingerprint: prepared.fingerprint }], fence);
}

/**
 * Every interrupted question about ONE image's unchanged pixels, continued together: a lean world asks its bundle and
 * its continuity question side by side, and both can be interrupted in the same round. Continuing one alone would
 * record that round on the image and make the other's question unreachable (Codex round 16).
 * Every question is checked, and the per-world limits counted (v1 while its two records last, then v2), before any
 * approval is written: an image's questions are continued together or not at all (Codex round 17). One transaction
 * then records them all on the image; its approval audit rows are the receipt that they were (`continuationRecorded`).
 * An approval written whose image never recorded it (a refused fence, a stopped worker) is reused by the next pass,
 * never counted again. `releaseParkedJob: false` leaves the job as it is, for a caller that releases only the hold it
 * observed; it never re-queues a job that is not parked.
 */
export async function recoverPreparedLocalPatchReviews(c: Container, prepared: Prepared,
  questions: readonly InterruptedQuestion[], fence?: (tx: Prisma.TransactionClient) => Promise<void>,
  /** `admitProviderFailed`: only the continuation that re-queues nothing it did not observe admits a provider-declared
   * failure (local-patch-continue-in-slice/v1); every other caller admits the no-response shape alone, as before. */
  options: { releaseParkedJob?: boolean; admitProviderFailed?: boolean; roundCandidates?: readonly InterruptedQuestion[]; why?: { reason?: string; transient?: boolean } } = {}): Promise<boolean> {
  const refuse = (reason: string) => { if (options.why) options.why.reason = reason; return false; };
  if (!questions.length || new Set(questions.map(q => q.requestKey)).size !== questions.length) return refuse("no distinct interrupted questions to continue");
  if (options.admitProviderFailed && options.releaseParkedJob !== false) return refuse("a provider-declared failure is continued only without releasing the job");
  const upgrade = await subjectUpgradeOf(c.db, prepared.game.id);
  const enrolled = upgrade?.reviewRecovery === SUBJECT_REVIEW_RECOVERY && upgrade.ownerId === prepared.game.ownerId;
  // local-patch-lean-review-recovery/v1: only a world that carries its pin continues past v2, under v3.
  const pinned = enrolled && !!await leanReviewRecoveryOf(c.db, prepared.game.id);
  const capacity = pinned ? await leanCapacityRecoveryOf(c.db, prepared.game.id) : null;
  const counts = await prepared.budget.countContinuationApprovals(prepared.worldId);
  let freeV1 = WORLD_AUTOMATIC_REVIEW_RECOVERY_V1_LIMIT - (counts[REVIEW_APPROVAL_V1] ?? 0);
  let freeV2 = enrolled ? WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT - (counts[REVIEW_APPROVAL_V2] ?? 0) : 0;
  let freeV3 = pinned ? WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT - (counts[REVIEW_APPROVAL_V3] ?? 0) : 0;
  let freeV4 = capacity ? capacity.maxContinuations - (counts[REVIEW_APPROVAL_V4] ?? 0) : 0;
  const planned: Planned[] = [];
  for (const question of questions) {
    const prior = await prepared.budget.readContinuationApproval(prepared.worldId, question.requestKey);
    if (prior && prior.version !== REVIEW_APPROVAL_V1 && !(prior.version === REVIEW_APPROVAL_V2 && enrolled) && !(prior.version === REVIEW_APPROVAL_V3 && pinned)
      && !(prior.version === REVIEW_APPROVAL_V4 && capacity && prior.grantSha256 === capacity.authorizationSha256))
      return refuse(`${question.requestKey} already carries a ${prior.version} approval that this continuation does not finish`);
    const release = prior?.version === REVIEW_APPROVAL_V1 ? "v1" : prior?.version === REVIEW_APPROVAL_V2 ? "v2" : prior?.version === REVIEW_APPROVAL_V3 ? "v3" : prior ? "v4"
      : freeV1 > 0 ? (freeV1--, "v1") : freeV2 > 0 ? (freeV2--, "v2") : freeV3 > 0 ? (freeV3--, "v3") : freeV4 > 0 ? (freeV4--, "v4") : null;
    if (!release) return refuse(`the world's automatic review continuations are spent (${counts[REVIEW_APPROVAL_V1] ?? 0}/${WORLD_AUTOMATIC_REVIEW_RECOVERY_V1_LIMIT} under v1`
      + `${enrolled ? `, ${counts[REVIEW_APPROVAL_V2] ?? 0}/${WORLD_AUTOMATIC_REVIEW_RECOVERY_V2_LIMIT} under v2` : ""}`
      + `${pinned ? `, ${counts[REVIEW_APPROVAL_V3] ?? 0}/${WORLD_AUTOMATIC_REVIEW_RECOVERY_V3_LIMIT} under v3` : ""}`
      + `${capacity ? `, ${counts[REVIEW_APPROVAL_V4] ?? 0}/${capacity.maxContinuations} under v4` : ""}); ${question.requestKey} stays reserved in full`
      + " until a person reconciles or authorizes it");
    const one = await checkInterruption(c, prepared, question, release, !!options.admitProviderFailed, options.roundCandidates ?? questions);
    if (!one) return refuse(`${question.requestKey}: its record no longer matches an interruption this continuation admits on these pixels`);
    // A failure of a kind never asked again, or past its image's bound: refused with exactly why, nothing written.
    if ("refused" in one) return refuse(one.refused);
    planned.push(one);
  }
  // Every permanent ledger refusal (over its cap, a conflict, an overrun, spent limits) was refused above, from what this
  // pass read; one here means the ledger moved under it (a concurrent continuation), so another turn decides.
  for (const one of planned) if (!await writeApproval(c, prepared, one)) {
    if (options.why) options.why.transient = true;
    return refuse(`${one.authorized.question.requestKey}: the world ledger refused its continuation`);
  }
  // An enrolled world keeps the last complete proof beside the interruption, so its paid continuity answer about
  // the same pixels can still be reused; a historical world's bytes are unchanged.
  if (await recordInterruptions(c, prepared, planned.map(one => one.authorized), fence, enrolled, options.releaseParkedJob !== false)) return true;
  // The image's row moved under this write: a concurrent pass recorded it first, or the image changed.
  if (options.why) options.why.transient = true;
  return refuse(`${questions.map(q => q.requestKey).join(", ")}: the image changed while its continuation was recorded`);
}

export type InterruptedQuestion = Question & { readonly requestKey: string; readonly fingerprint: string };
type Authorized = { question: InterruptedQuestion; policyId: string; approvalId: string; proof: Record<string, unknown>;
  reserveMicroUsd: number; shape: "timeout" | "provider-failed"; wireFault: "timeout" | "http" };
type Planned = { authorized: Authorized; recovery: WorldAutomaticReviewRecovery | WorldAutomaticReviewRecoveryV2 | WorldAutomaticReviewRecoveryV3 | WorldAutomaticReviewRecoveryV4 };
const REVIEW_APPROVAL_V1 = "world-automatic-review-recovery/v1", REVIEW_APPROVAL_V2 = "world-automatic-review-recovery/v2";
const REVIEW_APPROVAL_V3 = "world-automatic-review-recovery/v3", REVIEW_APPROVAL_V4 = "world-automatic-review-recovery/v4";

/**
 * Whether an automatic review continuation was recorded on its image: its audit row is written only inside the image's
 * own transaction (`recordInterruptions`), so an approval without it is a continuation still to finish.
 */
export async function continuationRecorded(c: Pick<Container, "db">, gameId: string, approval: { version: string; approvalId: string }): Promise<boolean> {
  if (!isAutomaticReviewApproval(approval)) return false;
  return !!await c.db.auditLog.findFirst({ where: { id: approval.approvalId, entityType: "Game", entityId: gameId }, select: { id: true } });
}
export const isAutomaticReviewApproval = (approval: { version: string }) =>
  approval.version === REVIEW_APPROVAL_V1 || approval.version === REVIEW_APPROVAL_V2 || approval.version === REVIEW_APPROVAL_V3 || approval.version === REVIEW_APPROVAL_V4;

const paidGame = (value: { ownerId: string | null; orders: { userId: string | null; paymentStatus: string; paidAt: Date | null; refundedAt: Date | null }[] }) =>
  value.orders.some(o => o.userId === value.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
  && !value.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt);

/** One question's approval, written durably before its image records it; the same record again is a no-op. */
async function writeApproval(c: Container, prepared: Prepared, { recovery }: Planned): Promise<boolean> {
  try {
    if (recovery.version === REVIEW_APPROVAL_V1)
      await boardWizardBudgetOf(c, 1, { authorizeAutomaticReviewRecovery: async captured => JSON.stringify(captured) === JSON.stringify(recovery) })
        .authorizeAutomaticReviewRecovery(prepared.worldId, recovery);
    else if (recovery.version === REVIEW_APPROVAL_V2)
      await boardWizardBudgetOf(c, 1, { authorizeAutomaticReviewRecoveryV2: async captured => JSON.stringify(captured) === JSON.stringify(recovery) })
        .authorizeAutomaticReviewRecoveryV2(prepared.worldId, recovery);
    else if (recovery.version === REVIEW_APPROVAL_V3) await boardWizardBudgetOf(c, 1, { authorizeAutomaticReviewRecoveryV3: async captured => JSON.stringify(captured) === JSON.stringify(recovery) })
      .authorizeAutomaticReviewRecoveryV3(prepared.worldId, recovery);
    else await boardWizardBudgetOf(c, 1, { authorizeAutomaticReviewRecoveryV4: async captured => JSON.stringify(captured) === JSON.stringify(recovery) })
        .authorizeAutomaticReviewRecoveryV4(prepared.worldId, recovery);
  } catch (error) {
    if (error instanceof WorldBudgetError && ["invalid_input", "invalid_snapshot", "world_held"].includes(error.code)) return false;
    throw error;
  }
  return true;
}

/** Everything one question's continuation must satisfy, and the approval it would write. Reads only. `refused`: an
 * interruption of a kind, or past a bound, that is never continued automatically, and exactly why. */
async function checkInterruption(c: Container, prepared: Prepared, question: InterruptedQuestion, release: "v1" | "v2" | "v3" | "v4",
  admitProviderFailed: boolean, roundCandidates: readonly InterruptedQuestion[]): Promise<Planned | { refused: string } | null> {
  const policyId = release === "v1" ? REVIEW_INTERRUPTION_POLICY : release === "v2" ? REVIEW_INTERRUPTION_POLICY_V2 : release === "v3" ? REVIEW_INTERRUPTION_POLICY_V3 : CAPACITY_REVIEW_POLICY;
  const { game, scene, request, worldId, budget } = prepared, { requestKey, fingerprint } = question;
  if (scene.sceneVersion !== 12 || prepared.extraPlan || request.reviewScope !== "ready-only/v1"
    || request.hides.length !== 1 || !interruptedLocalPatchReviewRequest(requestKey, fingerprint)) return null;
  const selected = prepared.entries.find(e => e.hide.id === request.hides[0]!.hideId);
  if (!selected || prepared.protectedRows.has(selected.row.id)) return null;
  const live = await c.db.game.findUnique({ where: { id: game.id }, include: { scenes: true, orders: true } });
  if (!live || live.ownerId !== game.ownerId || live.deletedAt || live.configJson || live.readyAt
    || live.status !== "TARGETS_GENERATING" || live.styleVersion !== "local-patch-world-v1"
    || live.scenes.length !== 9 || live.scenes.some(s => s.sceneVersion !== 12) || !paidGame(live)) return null;
  const audit = await budget.audit(worldId);
  if (audit.overCapMicroUsd || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length) return null;
  const held = await budget.readRequest(worldId, requestKey);
  if (!held || held.state !== "unknown" || held.origin !== "reserved" || held.scope !== "judge"
    || held.operationFingerprint !== fingerprint || !dualReviewReserves(question.role).includes(held.reserveMicroUsd) || held.conflicts.length) return null;
  const retained = await new LocalPatchRetainedPurchaseStore(c, game.id, budget).get(worldId, requestKey);
  if (!retained || retained.evidence || retained.operationFingerprint !== fingerprint) return null;
  // HTTP errors, authentication/quota refusals, unpriced usable answers, wrong
  // models and malformed successful replies are not transport interruptions.
  const admitted = await admittedInterruption(c, game.id, worldId, requestKey, retained);
  if (!admitted || admitted.shape === "provider-failed" && !admitProviderFailed) return null;
  const { shape, reply } = admitted;
  // local-patch-lean-review-recovery/v1: a provider-declared failure of a kind never asked again, or past its image's
  // bound, is refused here too, with its reason, whichever version would have continued it.
  let failureKind: string | null = null, errorCode: string | null = null;
  if (shape === "provider-failed") {
    const refusal = await providerFailureRefusal(c, game.id, worldId, requestKey);
    if (refusal) return { refused: refusal };
    const terminal = await backgroundRoundTerminal(c.db, game.id, worldId, requestKey);
    errorCode = terminal?.kind === "outcome" ? terminal.errorCode ?? null : null;
    failureKind = backgroundFailureKind(errorCode === null ? null : { code: errorCode, message: null });
  }
  const capacity = release === "v4" ? await leanCapacityRecoveryOf(c.db, game.id) : null;
  let startedFlexRound: object | undefined;
  if (release === "v4") {
    if (!capacity || shape !== "provider-failed" || !capacityFailureCode(errorCode)
      || capacity.identitySha256 !== sha256Bytes(prepared.sheet)) return null;
    const round = await backgroundRoundOfKey(c.db, game.id, worldId, requestKey);
    if (!round || round.intent.binding.variantId !== selected.row.id || round.intent.binding.imageSha256 !== selected.imageSha256
      || round.intent.binding.geometrySha256 !== selected.geometrySha256 || round.intent.binding.identitySha256 !== capacity.identitySha256) return null;
    const { capacityReviewRoundAdmission } = await import("./lean-capacity-started-round");
    const admission = await capacityReviewRoundAdmission(c.db, capacity, round, roundCandidates);
    if (!admission) return null;
    if (admission.kind === "started-flex") startedFlexRound = admission.anchor;
  }
  const wireFault = shape === "timeout" ? "timeout" as const : "http" as const;
  const proof = { policyId, gameId: game.id, ownerId: game.ownerId, sceneId: scene.id,
    variantId: selected.row.id, hideId: selected.hide.id, assetId: selected.asset.id, imageSha256: selected.imageSha256,
    geometrySha256: selected.geometrySha256, identitySha256: sha256Bytes(prepared.sheet), attempts: selected.row.attempts,
    evidenceReviewAttempt: prepared.evidenceReviewAttempt, requestKey, operationFingerprint: fingerprint,
    unknownReasons: held.unknownReasons, retainedPayloadSha256: retained.payloadSha256, wireFault,
    ...(shape === "provider-failed" ? { providerFailed: PROVIDER_FAILED_SHAPE, responseId: reply.requestId } : {}),
    // Only a v3 proof names what the provider's own record said; every v1 and v2 proof is built exactly as before.
    ...((release === "v3" || release === "v4") && failureKind ? { failureKind, ...(errorCode ? { errorCode } : {}) } : {}),
    ...(capacity ? { grantSha256: capacity.authorizationSha256 } : {}),
    ...(startedFlexRound ? { startedFlexRound } : {}) };
  const proofHash = sha256Bytes(Buffer.from(JSON.stringify(proof)));
  const approvalId = release === "v1" ? `auto-review-${proofHash}` : `auto-review-${release}-${proofHash}`;
  const prior = await budget.readContinuationApproval(worldId, requestKey);
  const base = { worldId, approvalId, requestKey, scope: "judge" as const, operationFingerprint: fingerprint, reserveMicroUsd: held.reserveMicroUsd,
    unknownReasons: held.unknownReasons, authorizationSha256: proofHash };
  const recovery: Planned["recovery"] = release === "v1"
    ? { version: "world-automatic-review-recovery/v1", ...base, policyId: REVIEW_INTERRUPTION_POLICY,
      authorizedAt: prior?.version === "world-automatic-review-recovery/v1" ? prior.authorizedAt : selected.row.updatedAt.toISOString() }
    : release === "v2" ? { version: "world-automatic-review-recovery/v2", ...base, policyId: REVIEW_INTERRUPTION_POLICY_V2,
      authorizedAt: prior?.version === "world-automatic-review-recovery/v2" ? prior.authorizedAt : selected.row.updatedAt.toISOString() }
    : release === "v3" ? { version: "world-automatic-review-recovery/v3", ...base, policyId: REVIEW_INTERRUPTION_POLICY_V3,
      authorizedAt: prior?.version === "world-automatic-review-recovery/v3" ? prior.authorizedAt : selected.row.updatedAt.toISOString() }
    : { version: "world-automatic-review-recovery/v4", ...base, policyId: CAPACITY_REVIEW_POLICY, grantSha256: capacity!.authorizationSha256,
      authorizedAt: prior?.version === "world-automatic-review-recovery/v4" ? prior.authorizedAt : selected.row.updatedAt.toISOString() };
  return { authorized: { question, policyId, approvalId, proof, reserveMicroUsd: held.reserveMicroUsd, shape, wireFault }, recovery };
}

/** One transaction: every authorized question recorded on its image, which goes back to its evidence questions. */
async function recordInterruptions(c: Container, prepared: Prepared, authorized: readonly Authorized[],
  fence: ((tx: Prisma.TransactionClient) => Promise<void>) | undefined, keepProof: boolean, releaseParkedJob: boolean): Promise<boolean> {
  const { game, request } = prepared, selected = prepared.entries.find(e => e.hide.id === request.hides[0]!.hideId)!, first = authorized[0]!;
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, game.id); await fence?.(tx);
    const currentGame = await tx.game.findUniqueOrThrow({ where: { id: game.id }, include: { scenes: true, orders: true } });
    if (currentGame.status !== "TARGETS_GENERATING" || currentGame.ownerId !== game.ownerId || currentGame.configJson
      || currentGame.deletedAt || currentGame.readyAt || !paidGame(currentGame)
      || currentGame.scenes.length !== 9 || currentGame.scenes.some(s => s.sceneVersion !== 12))
      throw Error("Interrupted review game changed before recovery");
    const prior = JSON.parse(selected.row.judgeJson!), at = new Date().toISOString();
    // The interrupted round counts against this image's fixed evidence total, once: questions interrupted side by side in
    // one round are one failed round, not an outage of two (two consecutive transport entries wait an hour). Every
    // interrupted question is kept in `reviewInterruptions`, with its own continuation. The round is logged under the
    // question the policy had escalated, if any (at most one role per round), so its next question keeps that strategy.
    const logged = authorized.find(one => one.question.strategy !== "standard/v1") ?? first;
    const evidenceAttempts = [...(Array.isArray(prior.evidenceAttempts) ? prior.evidenceAttempts : []), { attempt: prepared.evidenceReviewAttempt,
      role: logged.question.role, kind: "transport", code: logged.wireFault, path: null, strategy: logged.question.strategy, at, imageSha256: selected.imageSha256 }];
    const changed = await tx.targetVariantAsset.updateMany({ where: { id: selected.row.id, status: selected.row.status,
      assetId: selected.asset.id, attempts: selected.row.attempts, judgeJson: selected.row.judgeJson,
      rectJson: selected.row.rectJson, hitRectJson: selected.row.hitRectJson, headAnchorJson: selected.row.headAnchorJson },
      data: { status: "FAILED", lastError: authorized.every(one => one.shape === "timeout") ? "quality-unresolved: review transport interrupted; inspect the same pixels again"
          : "quality-unresolved: the provider ended the review failed; inspect the same pixels again",
        judgeJson: JSON.stringify({ ...prior, reviewState: "board-review-complete", verdict: null, evidenceAttempts,
          wireFault: first.wireFault, reviewInterruption: { ...first.proof, recoveryId: first.approvalId, reservedMicroUsd: first.reserveMicroUsd },
          ...(authorized.length > 1 ? { reviewInterruptions: authorized.map(one => ({ ...one.proof, recoveryId: one.approvalId, reservedMicroUsd: one.reserveMicroUsd })) } : {}),
          boardReview: { version: prepared.reviewVersion, fingerprint: first.question.fingerprint, requestKey: first.question.requestKey, reviewScope: "ready-only/v1",
            ...(request.assessmentMode ? { assessmentMode: request.assessmentMode } : {}),
            reviewedHideIds: [selected.hide.id], evidenceReviewAttempt: prepared.evidenceReviewAttempt,
            evidenceReviewedAt: at, raw: null, model: null, costUnknown: true,
            ...(keepProof && prior.boardReview?.dual ? { dual: prior.boardReview.dual } : {}) } }) } });
    if (changed.count !== 1) return false;
    await tx.targetInstance.update({ where: { id: selected.row.targetInstanceId }, data: { status: "FAILED" } });
    for (const one of authorized) await tx.auditLog.upsert({ where: { id: one.approvalId }, update: {}, create: { id: one.approvalId, actorType: "SYSTEM",
      action: one.policyId, entityType: "Game", entityId: game.id, metaJson: JSON.stringify(one.proof) } });
    if (releaseParkedJob) await tx.generationJob.updateMany({ where: { id: `job_${game.id}`, status: "FAILED", currentStep: "local-patch:needs-release" },
      data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    return true;
  }, { timeout: 30_000 });
}

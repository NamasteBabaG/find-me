import { Prisma, type TargetVariantAsset } from "@prisma/client";
import { z } from "zod";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import { SYSTEM } from "../audit.service";
import { transitionGame } from "../game-status";
import { isLocalPatchAgeVersion, localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { LOCAL_PATCH_MAX_ATTEMPTS } from "../../domain/scene/local-patch-attempts";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { sha256Bytes } from "./fixed-sprite";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { localPatchBoardReviewKey } from "./local-patch-board-review";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, runLocalPatchHide, type LocalPatchHideDeps } from "./local-patch-hide";
import { LOCAL_PATCH_RESERVE } from "./local-patch-render";
import { LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { sameChargeEvidence } from "./world-budget";

export const LOCAL_PATCH_QUALITY_PILOT_ACTION = "local-patch:quality-pilot";
const STYLE = "local-patch-world-v1", TERMINAL = "local-patch:quality-failed", PARKED = "local-patch:needs-release";
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
const idOf = (gameId: string) => `aud_lpqp_${hash(gameId).slice(0, 32)}`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const planSchema = z.object({ version: z.literal(1), gameId: z.string(), hideId: z.string(), boardId: z.string(), rowId: z.string(),
  targetInstanceId: z.string(), sceneId: z.string(), requestedBy: z.string(), reviewer: z.literal("codex-visual-inspection"),
  concern: z.literal("faceLikeness"), reason: z.string(), identityAssetId: z.string(), identitySha256: digest, ageYears: z.number().int(),
  originalAssetId: z.string(), originalSha256: digest, originalAttempt: z.number().int(), authorizedAttempt: z.number().int().min(2).max(3),
  previousJudgeJson: z.string(), others: z.array(z.object({ id: z.string(), sha256: digest })),
  state: z.enum(["queued", "candidate", "rejected", "resumed"]), candidateAssetId: z.string().nullable(), candidateSha256: digest.nullable(),
  outcomeReason: z.string().nullable(), resumeReason: z.string().nullable(),
}).strict();
type Plan = z.infer<typeof planSchema>;
type OperatorInput = { gameId: string; operatorId: string; reason: string };
function demand(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`LOCAL_PATCH_QUALITY_PILOT: ${reason}`); }
const tcOf = (c: Container, tx: Prisma.TransactionClient): Container => ({ ...c, db: tx as Container["db"], storage: new DbStorage(tx as Container["db"]) });
const rowsOf = (c: Container, gameId: string) => c.db.targetVariantAsset.findMany({ where: {
  variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } },
}, orderBy: { id: "asc" } });

async function operator(c: Container, input: OperatorInput) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only durable QA storage is eligible");
  demand(/^[A-Za-z0-9_-]{1,160}$/.test(input.gameId) && input.reason.trim().length >= 10 && input.reason.length <= 1000, "Explicit game and authorization reason required");
  const user = await c.db.user.findUnique({ where: { id: input.operatorId } });
  demand(user && c.adminEmails?.some(email => email.trim().toLowerCase() === user.email.toLowerCase()), "Authenticated administrator required");
}
async function identity(c: Container, gameId: string) {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: true, orders: true, jobs: true } });
  const child = game.childProfile;
  demand(game.styleVersion === STYLE && !game.deletedAt && !game.configJson && !game.readyAt && !game.deliveredAt
    && game.ownerId && game.paidAt && game.packageTier === "ONE_WORLD" && child && !child.deletedAt && child.ownerId === game.ownerId
    && child.identityAssetId && child.ageYears && game.scenes.length === 9 && new Set(game.scenes.map(s => s.sceneSlug)).size === 9
    && game.scenes.every(s => isLocalPatchAgeVersion(s.sceneVersion)), "Live paid unpublished v9 identity required");
  demand(game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "Paid nonrefunded order required");
  const asset = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  demand(asset.ownerId === game.ownerId && asset.status === "READY" && !asset.deletedAt && asset.type === "IDENTITY_SHEET" && asset.visibility === "PRIVATE", "Owned canonical identity required");
  const identitySha256 = sha256Bytes(await c.storage.get(asset.storagePath)), budget = boardWizardBudgetOf(c);
  await requireBoardWizardIdentityApproval(c, budget, { gameId, identityAssetId: asset.id, sheetSha256: identitySha256,
    catalogSha256: (await readBoardConditionedCatalog()).sha256, photoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears,
    crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null, contentVersion: 9 });
  return { game, child, identityAssetId: asset.id, identitySha256, budget };
}
async function settled(c: Container, gameId: string) {
  const cost = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
  demand(cost.capMicroUsd === 4_000_000 && !cost.held && cost.reservedMicroUsd === 0 && !cost.pendingRequestKeys.length
    && !cost.unknownRequestKeys.length, "The unchanged inclusive4-dollar ledger must be settled");
  return cost;
}
async function image(c: Container, gameId: string, ownerId: string, row: TargetVariantAsset, hideId: string) {
  demand(row.provider === LOCAL_PATCH_PROVIDER && row.assetId && row.rectJson && row.hitRectJson && row.headAnchorJson, "Usable render-completion metadata required");
  const receipt = JSON.parse(row.judgeJson ?? "null");
  const asset = await c.db.asset.findUniqueOrThrow({ where: { id: row.assetId } });
  demand(asset.ownerId === ownerId && asset.status === "READY" && !asset.deletedAt && asset.type === "TARGET_SPRITE"
    && asset.visibility === "GAME" && asset.provider === LOCAL_PATCH_PROVIDER && asset.providerRequestId === gameId, "Owned retained shipping image required");
  const sha256 = sha256Bytes(await c.storage.get(asset.storagePath));
  demand(receipt?.hide === hideId && receipt.judgedSha256 === sha256 && receipt.geometrySha256 === localPatchPublicationGeometryHash(row)
    && receipt.compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION && !receipt.renderFault
    && ["pending-board-review", "board-review-complete"].includes(receipt.reviewState), "Candidate pixels/geometry no longer match the completed render");
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
  const key = receipt.renderPurchase?.requestKey ?? `${hideId}:${receipt.pose}:render:${row.attempts}`;
  demand(typeof key === "string" && key.startsWith(`${hideId}:${receipt.pose}:render:`), "Candidate belongs to another paid render");
  const bill = await budget.readRequest(worldId, key), retained = await new LocalPatchRetainedPurchaseStore(c, gameId, budget).get(worldId, key);
  demand(bill && (bill.state === "settled" || bill.state === "linked") && bill.scope === "image" && !bill.conflicts.length
    && bill.reserveMicroUsd === LOCAL_PATCH_RESERVE.renderMicroUsd && retained && retained.scope === "image"
    && retained.worldId === worldId && retained.requestKey === key && retained.operationFingerprint === bill.operationFingerprint
    && retained.evidence && sameChargeEvidence(retained.evidence, bill.evidence), "Candidate original paid render is not authenticated");
  return { asset, sha256, receipt };
}
async function readPlan(c: Pick<Container, "db">, gameId: string): Promise<Plan | null> {
  const row = await c.db.auditLog.findUnique({ where: { id: idOf(gameId) } });
  if (!row) return null;
  demand(row.actorType === "SYSTEM" && row.action === LOCAL_PATCH_QUALITY_PILOT_ACTION && row.entityType === "Game" && row.entityId === gameId, "Pilot authority changed");
  const plan = planSchema.parse(JSON.parse(row.metaJson ?? "null")); demand(plan.gameId === gameId, "Pilot belongs to another game");
  return plan;
}
export async function readLocalPatchQualityPilot(c: Pick<Container, "db">, gameId: string) {
  const plan = await readPlan(c, gameId);
  return plan ? { ...plan, pilotId: idOf(gameId) } : null;
}
async function sameOthers(c: Container, plan: Plan) {
  const other = (await rowsOf(c, plan.gameId)).filter(row => row.id !== plan.rowId);
  demand(other.length === plan.others.length && other.every(row => plan.others.some(x => x.id === row.id && x.sha256 === hash(row))), "An unselected appearance changed during the one-hide pilot");
}
async function savePlan(tx: Prisma.TransactionClient, old: Plan, next: Plan) {
  const current = await tx.auditLog.findUniqueOrThrow({ where: { id: idOf(old.gameId) } });
  // Zod normalizes property order. Compare parsed authority, but fence against
  // the exact persisted bytes rather than a reserialized JSON property order.
  demand(JSON.stringify(planSchema.parse(JSON.parse(current.metaJson ?? "null"))) === JSON.stringify(old), "Pilot changed under this worker");
  const wrote = await tx.auditLog.updateMany({ where: { id: current.id, metaJson: current.metaJson }, data: { metaJson: JSON.stringify(next) } });
  demand(wrote.count === 1, "Pilot changed under this worker");
}

/** One SYSTEM visual-QA concern, not a human/provider approval. Only the next
 * image attempt is authorized; no judge or ordinary world continuation follows. */
export async function stageLocalPatchQualityPilot(c: Container, input: OperatorInput & { hideId: string; expectedAssetId: string; expectedSha256: string }) {
  await operator(c, input);
  return c.db.$transaction(async tx => {
    const tc = tcOf(c, tx), previous = await readPlan(tc, input.gameId);
    if (previous) {
      await identity(tc, input.gameId);
      demand(previous.hideId === input.hideId && previous.originalAssetId === input.expectedAssetId && previous.originalSha256 === input.expectedSha256
        && previous.requestedBy === input.operatorId && previous.reason === input.reason.trim(), "This game already has a different pilot");
      return { gameId: input.gameId, pilotId: idOf(input.gameId), hideId: previous.hideId, authorizedAttempt: previous.authorizedAttempt };
    }
    const locked = await tx.game.updateMany({ where: { id: input.gameId, status: "GENERATION_FAILED", deletedAt: null, styleVersion: STYLE }, data: { status: "GENERATION_FAILED" } });
    demand(locked.count === 1, "Only a terminal quality-failed game may enter a pilot");
    const proof = await identity(tc, input.gameId);
    const job = proof.game.jobs.find(j => j.id === `job_${input.gameId}`);
    demand(job && proof.game.jobs.every(j => j.status === "DONE" && j.currentStep === TERMINAL), "Original worker must be terminal and inactive");
    const cost = await settled(tc, input.gameId);
    demand(cost.committedMicroUsd + LOCAL_PATCH_RESERVE.renderMicroUsd <= 4_000_000, "The one-image reservation must fit the existing4-dollar ceiling");
    const scene = proof.game.scenes.find(s => localPatchBoardForVersion(s.sceneSlug, 9)?.hides.some(h => h.id === input.hideId));
    const board = scene && localPatchBoardForVersion(scene.sceneSlug, 9), hide = board?.hides.find(h => h.id === input.hideId);
    demand(scene && board && hide, "Selected authored hide is not in this game");
    const target = await tx.targetInstance.findUniqueOrThrow({ where: { gameSceneId_targetId: { gameSceneId: scene.id, targetId: hide.targetId } } });
    const rows = await rowsOf(tc, input.gameId), row = rows.find(r => r.targetInstanceId === target.id);
    demand(row && ["GENERATED", "FAILED"].includes(row.status) && row.attempts >= 1 && row.attempts < LOCAL_PATCH_MAX_ATTEMPTS, "One remaining concluded image attempt is required");
    const current = await image(tc, input.gameId, proof.game.ownerId!, row, hide.id);
    demand(current.asset.id === input.expectedAssetId && current.sha256 === input.expectedSha256, "Selected current image changed");
    const authorizedAttempt = row.attempts + 1;
    demand(!await proof.budget.readRequest(boardWizardWorldId(input.gameId), `${hide.id}:${hide.pose}:render:${authorizedAttempt}`), "Next image key already exists; never rebind a paid question");
    const plan: Plan = { version: 1, gameId: input.gameId, hideId: hide.id, boardId: board.board, sceneId: scene.id,
      rowId: row.id, targetInstanceId: target.id, requestedBy: input.operatorId, reviewer: "codex-visual-inspection", concern: "faceLikeness", reason: input.reason.trim(),
      identityAssetId: proof.identityAssetId, identitySha256: proof.identitySha256, ageYears: proof.child.ageYears!,
      originalAssetId: row.assetId!, originalSha256: current.sha256, originalAttempt: row.attempts, authorizedAttempt,
      previousJudgeJson: row.judgeJson!, others: rows.filter(r => r.id !== row.id).map(r => ({ id: r.id, sha256: hash(r) })),
      state: "queued", candidateAssetId: null, candidateSha256: null, outcomeReason: null, resumeReason: null };
    await tx.auditLog.create({ data: { id: idOf(input.gameId), actorType: "SYSTEM", action: LOCAL_PATCH_QUALITY_PILOT_ACTION,
      entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(plan) } });
    // Preserve the actual prior grade verbatim; a separate observation opens one retry.
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: "FAILED", lastError: "quality-pilot: SYSTEM visual inspection requests identity correction" } });
    await tx.targetInstance.update({ where: { id: target.id }, data: { status: "FAILED" } });
    await transitionGame(tc, input.gameId, "TARGETS_GENERATING", SYSTEM, { source: LOCAL_PATCH_QUALITY_PILOT_ACTION, pilotId: idOf(input.gameId), maximumAttempt: authorizedAttempt });
    await tx.generationJob.update({ where: { id: job.id }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    return { gameId: input.gameId, pilotId: idOf(input.gameId), hideId: hide.id, authorizedAttempt };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** Called before any ordinary work. A concluded row after a lost acknowledgment
 * is parked, not interpreted as permission to buy the next numbered image. */
export async function runLocalPatchQualityPilot(c: Container, gameId: string, deps: LocalPatchHideDeps & { fence(tx: Prisma.TransactionClient): Promise<void> }, deadlineAt?: number) {
  const plan = await readPlan(c, gameId);
  if (!plan || plan.state === "resumed") return null;
  const proof = await identity(c, gameId);
  demand(proof.identityAssetId === plan.identityAssetId && proof.identitySha256 === plan.identitySha256 && proof.child.ageYears === plan.ageYears, "Pilot canonical identity changed");
  await sameOthers(c, plan);
  let row = await c.db.targetVariantAsset.findUniqueOrThrow({ where: { id: plan.rowId } });
  demand(row.attempts === plan.originalAttempt && row.status === "FAILED" || row.attempts === plan.authorizedAttempt
    && ["PENDING", "GENERATED", "FAILED"].includes(row.status), "Pilot attempt high-water changed");
  let outcome: Awaited<ReturnType<typeof runLocalPatchHide>> | undefined;
  if (plan.state === "queued" && (row.attempts === plan.originalAttempt || row.status === "PENDING")) {
    const board = localPatchBoardForVersion(plan.boardId, 9)!, hide = board.hides.find(h => h.id === plan.hideId)!;
    outcome = await runLocalPatchHide(c, deps, { gameId, board, hide, finalRepair: plan.authorizedAttempt === 3, repairChecks: [plan.concern],
      ...(deadlineAt === undefined ? {} : { deadlineAt }) });
    row = await c.db.targetVariantAsset.findUniqueOrThrow({ where: { id: plan.rowId } });
    if (row.status === "PENDING" && outcome.state !== "held") return { pending: true, attention: null, outcomes: [outcome] };
  }
  let candidateAssetId: string | null = null, candidateSha256: string | null = null;
  if (row.status === "GENERATED" && row.attempts === plan.authorizedAttempt) {
    const candidate = await image(c, gameId, proof.game.ownerId!, row, plan.hideId);
    candidateAssetId = candidate.asset.id; candidateSha256 = candidate.sha256;
  }
  const reason = candidateAssetId ? "One-hide pilot candidate retained; explicit inspection and resume required. No visual approval was granted."
    : outcome?.reason ?? row.lastError ?? "One-hide pilot did not yield a usable candidate; no further attempt authorized";
  await c.db.$transaction(async tx => {
    await deps.fence(tx); await sameOthers(tcOf(c, tx), plan);
    const fresh = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
    demand(hash(fresh) === hash(row), "Pilot result changed before parking");
    await savePlan(tx, plan, { ...plan, state: candidateAssetId ? "candidate" : "rejected", candidateAssetId, candidateSha256, outcomeReason: reason });
    await tx.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "FAILED", currentStep: PARKED, lastError: reason } });
  }, { timeout: 30_000 });
  return { pending: false, attention: reason, outcomes: outcome ? [outcome] : [] };
}

/** Explicit world continuation, NOT approval. Only pixel-bound grouped-review
 * failures become candidates again; actual image failures remain FAILED. */
export async function resumeLocalPatchAfterQualityPilot(c: Container, input: OperatorInput & { pilotId: string; expectedCandidateSha256: string }) {
  await operator(c, input);
  return c.db.$transaction(async tx => {
    const locked = await tx.game.updateMany({ where: { id: input.gameId, status: "TARGETS_GENERATING", deletedAt: null, styleVersion: STYLE }, data: { styleVersion: STYLE } });
    demand(locked.count === 1, "Pilot game is no longer awaiting continuation");
    const tc = tcOf(c, tx), plan = await readPlan(tc, input.gameId);
    demand(plan && input.pilotId === idOf(input.gameId) && ["candidate", "resumed"].includes(plan.state) && plan.candidateSha256 === input.expectedCandidateSha256, "Exact inspected pilot candidate required");
    const proof = await identity(tc, input.gameId), job = proof.game.jobs.find(j => j.id === `job_${input.gameId}`);
    if (plan.state === "resumed") {
      demand(plan.resumeReason === input.reason.trim(), "Continuation was already authorized with another reason");
      return { gameId: input.gameId, status: "TARGETS_GENERATING" as const, requeuedHideIds: [] as string[] };
    }
    demand(job && job.status === "FAILED" && job.currentStep === PARKED && proof.game.jobs.every(j => j.status !== "RUNNING"), "Pilot must be parked without an active worker");
    demand(proof.identityAssetId === plan.identityAssetId && proof.identitySha256 === plan.identitySha256 && proof.child.ageYears === plan.ageYears, "Pilot identity changed");
    await settled(tc, input.gameId); await sameOthers(tc, plan);
    const chosen = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: plan.rowId } });
    const checked = await image(tc, input.gameId, proof.game.ownerId!, chosen, plan.hideId);
    demand(chosen.status === "GENERATED" && chosen.attempts === plan.authorizedAttempt && checked.sha256 === input.expectedCandidateSha256, "Pilot candidate changed after inspection");
    const requeuedHideIds: string[] = [];
    for (const scene of proof.game.scenes) {
      const board = localPatchBoardForVersion(scene.sceneSlug, 9)!;
      const mine = await tx.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameSceneId: scene.id } }, include: { targetInstance: true } });
      let refresh = scene.id === plan.sceneId;
      for (const row of mine) {
        if (row.status !== "FAILED" || !/^quality-(unresolved|retry):/.test(row.lastError ?? "") || !row.assetId) continue;
        const hide = board.hides.find(h => h.targetId === row.targetInstance.targetId); demand(hide, "Failed candidate is not authored");
        const candidate = await image(tc, input.gameId, proof.game.ownerId!, row, hide.id);
        demand(candidate.receipt.reviewState === "board-review-complete", "Only an existing grouped-review result may be requeued");
        const vector = board.hides.map(h => mine.find(r => r.targetInstance.targetId === h.targetId)?.attempts ?? 0);
        demand(localPatchBoardReviewKey(board.board, vector, LOCAL_PATCH_COMPOSITION_VERSION, 9) !== candidate.receipt.boardReview?.requestKey,
          "The corrected review needs its own key; an old paid question cannot be replaced");
        await tx.auditLog.create({ data: { id: `${idOf(input.gameId)}_${hash(row.id).slice(0, 12)}`, actorType: "SYSTEM",
          action: `${LOCAL_PATCH_QUALITY_PILOT_ACTION}:review-requeued`, entityType: "Game", entityId: input.gameId,
          metaJson: JSON.stringify({ rowId: row.id, hideId: hide.id, assetId: row.assetId, imageSha256: candidate.sha256,
            previousJudgeJson: row.judgeJson, reason: input.reason.trim(), requestedBy: input.operatorId, approvalGranted: false }) } });
        await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: "GENERATED", lastError: null,
          judgeJson: JSON.stringify({ ...candidate.receipt, reviewState: "pending-board-review" }) } });
        await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "GENERATED" } });
        requeuedHideIds.push(hide.id); refresh = true;
      }
      if (refresh) await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: "NEEDS_REGENERATION" } });
    }
    await savePlan(tx, plan, { ...plan, state: "resumed", resumeReason: input.reason.trim() });
    await tx.generationJob.update({ where: { id: job.id }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    await tx.game.update({ where: { id: input.gameId }, data: { lastError: null } });
    return { gameId: input.gameId, status: "TARGETS_GENERATING" as const, requeuedHideIds };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

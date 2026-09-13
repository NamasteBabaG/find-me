import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { SYSTEM } from "../audit.service";
import { transitionGame } from "../game-status";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { requireLocalPatchRecoveryIdentity, requireLocalPatchRecoveryBudget, readLocalPatchQualityPilot } from "./local-patch-quality-pilot";
import { prepareLocalPatchBoardReview, LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION, type LocalPatchBoardReviewDeps } from "./local-patch-board-review";
import { localPatchExplicitUncertaintyChecks, localPatchQualityDisposition, parseLocalPatchBoardVerdicts,
  localPatchBoardJudgeImages, localPatchBoardEvidenceIds, localPatchBoardJudgeImageLabels, isTheModelWeAsked } from "./local-patch-judge";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { LOCAL_PATCH_RESERVE } from "./local-patch-render";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT } from "./local-patch-hide";
import { LOCAL_PATCH_MAX_ATTEMPTS } from "../../domain/scene/local-patch-attempts";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { boardWizardWorldId } from "./board-conditioned-wizard";
import { sameChargeEvidence } from "./world-budget";
import { sha256Bytes } from "./fixed-sprite";

/** Covered by the existing local-patch:quality-pilot privacy redaction. */
export const LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION = "local-patch:quality-pilot:uncertainty-retry";
const TERMINAL = "local-patch:quality-failed";
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function demand(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`LOCAL_PATCH_UNCERTAINTY_RESUME: ${reason}`); }

/** Reclassify an already-paid, correctly labeled uncertain answer as a bounded
 * retry, never approval. No render/judge callback, reserve, settle or enqueue
 * provider operation exists here; the ordinary queue owns the next attempt. */
export async function resumeLocalPatchUncertainty(c: Container, gameId: string, actor: Actor,
  deps: Pick<LocalPatchBoardReviewDeps, "readBoardArt"> = {}) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db" && actor.type === "ADMIN", "Authenticated durable QA administrator required");
  const admin = await c.db.user.findUnique({ where: { id: actor.id } });
  demand(admin && c.adminEmails?.some(email => email.trim().toLowerCase() === admin.email.toLowerCase()), "Authenticated administrator required");
  const proof = await requireLocalPatchRecoveryIdentity(c, gameId), worldId = boardWizardWorldId(gameId);
  const pilot = await readLocalPatchQualityPilot(c, gameId);
  demand(!pilot || pilot.state === "resumed", "An unfinished one-hide pilot cannot become a whole-world retry");
  if (proof.game.status === "TARGETS_GENERATING") {
    const previous = await c.db.auditLog.findFirst({ where: { entityType: "Game", entityId: gameId, action: LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION } });
    demand(previous, "No prior uncertainty continuation exists");
    return { gameId, resumedHideIds: [] as string[], alreadyResumed: true };
  }
  demand(proof.game.status === "GENERATION_FAILED" && proof.game.jobs.length > 0
    && proof.game.jobs.every(j => j.status === "DONE" && j.currentStep === TERMINAL)
    && proof.game.jobs.some(j => j.id === `job_${gameId}`), "The original quality-failed job must be terminal and inactive");
  const cost = await requireLocalPatchRecoveryBudget(c, gameId);
  demand(cost.committedMicroUsd + LOCAL_PATCH_RESERVE.renderMicroUsd <= 4_000_000, "A next image must fit the unchanged inclusive4-dollar ceiling");
  const all = await c.db.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { select: { gameSceneId: true, targetId: true } } }, orderBy: { id: "asc" } });
  demand(!all.some(row => row.status === "FAILED" && row.attempts >= LOCAL_PATCH_MAX_ATTEMPTS), "No exhausted appearance may be resumed");
  const retainedStore = new PrismaRetainedPurchaseStore(c.db);
  // Preparation writes PENDING before a time-window check, even when nothing
  // was bought. Preserve that exact attempt; it is not an in-flight charge.
  const preparedKeys: string[] = [];
  for (const row of all.filter(r => r.status === "PENDING")) {
    const scene = proof.game.scenes.find(s => s.id === row.targetInstance.gameSceneId);
    const hide = scene && localPatchBoardForVersion(scene.sceneSlug, 9)?.hides.find(h => h.targetId === row.targetInstance.targetId);
    demand(hide && row.provider === LOCAL_PATCH_PROVIDER && !row.assetId && row.attempts >= 1 && row.attempts <= LOCAL_PATCH_MAX_ATTEMPTS,
      "Only an authored, asset-free prepared attempt may remain pending");
    const key = `${hide.id}:${hide.pose}:render:${row.attempts}`;
    demand(!await proof.budget.readRequest(worldId, key) && !await retainedStore.get(worldId, key), "Pending appearance has paid or retained evidence");
    preparedKeys.push(key);
  }
  const failed = all.filter(row => row.status === "FAILED" && row.lastError?.startsWith("quality-unresolved:"));
  demand(failed.length > 0, "No unresolved paid quality review is eligible");
  const changes: { rowId: string; hideId: string; oldJudgeJson: string; oldLastError: string | null; checks: string[];
    requestKey: string; fingerprint: string; payloadSha256: string; sceneId: string }[] = [];
  const preparedBoards: Extract<Awaited<ReturnType<typeof prepareLocalPatchBoardReview>>, { ready: true }>[] = [];
  for (const sceneId of new Set(failed.map(row => row.targetInstance.gameSceneId))) {
    const prepared = await prepareLocalPatchBoardReview(c, { gameId, sceneId }, deps, { recovery: true });
    demand(prepared.ready && prepared.reviewVersion === LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION, "The exact current five-hide review cannot be reconstructed");
    const { requestKey, fingerprint, entries, request, settings } = prepared;
    const bill = await proof.budget.readRequest(worldId, requestKey), retained = await retainedStore.get(worldId, requestKey);
    demand(bill && (bill.state === "settled" || bill.state === "linked") && bill.scope === "judge" && bill.conflicts.length === 0
      && bill.reserveMicroUsd === 30000 && bill.operationFingerprint === fingerprint
      && retained && retained.scope === "judge" && retained.operationFingerprint === fingerprint && retained.evidence
      && sameChargeEvidence(retained.evidence, bill.evidence), "Current art, identity, geometry or paid review fingerprint changed");
    const wire = JSON.parse(retained.bytes.toString());
    demand(wire.wireFault === null && wire.costUnknown === false && wire.finishReason === "stop" && typeof wire.raw === "string"
      && isTheModelWeAsked(wire.model, settings.model) && wire.model === bill.evidence.model
      && wire.requestId === bill.evidence.providerRequestId && sameChargeEvidence({ ...bill.evidence, rawUsage: wire.usage }, bill.evidence),
    "The paid review has unresolved transport, model or usage evidence");
    const verdicts = parseLocalPatchBoardVerdicts(wire.raw, entries.map(e => e.hide.id), 9);
    demand(Object.keys(verdicts).length === 5, "Five correctly labeled results are required");
    for (const e of entries) {
      const receipt = JSON.parse(e.row.judgeJson ?? "null"), review = receipt?.boardReview;
      demand(receipt?.reviewState === "board-review-complete" && receipt.wireFault === null && !receipt.renderFault
        && review?.version === LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION && review.compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION
        && review.requestKey === requestKey && review.fingerprint === fingerprint && review.raw === wire.raw
        && review.model === wire.model && review.effort === settings.effort && review.costMicroUsd === bill.evidence.amountMicroUsd
        && review.composedSha256 === sha256Bytes(prepared.composed)
        && same(review.wireHashes, localPatchBoardJudgeImages(request).map(sha256Bytes))
        && same(review.evidenceIds, localPatchBoardEvidenceIds(request)) && same(review.imageLabels, localPatchBoardJudgeImageLabels(request))
        && same(receipt.verdict, verdicts[e.hide.id]), "Existing row no longer matches its exact paid labeled review");
      if (!failed.some(row => row.id === e.row.id)) continue;
      const checks = localPatchExplicitUncertaintyChecks(verdicts[e.hide.id], 9, { hideId: e.hide.id });
      demand(checks.length > 0 && localPatchQualityDisposition(verdicts[e.hide.id] ?? null, 9, { hideId: e.hide.id }).state === "retry"
        && e.row.attempts >= 1 && e.row.attempts < LOCAL_PATCH_MAX_ATTEMPTS, "Malformed, contradictory or exhausted uncertainty cannot authorize a retry");
      const nextKey = `${e.hide.id}:${e.hide.pose}:render:${e.row.attempts + 1}`;
      demand(!await proof.budget.readRequest(worldId, nextKey), "Next image question already exists; never replace a paid fingerprint");
      changes.push({ rowId: e.row.id, hideId: e.hide.id, oldJudgeJson: e.row.judgeJson!, oldLastError: e.row.lastError,
        checks, requestKey, fingerprint, payloadSha256: retained.payloadSha256, sceneId });
    }
    preparedBoards.push(prepared);
  }
  demand(changes.length === failed.length, "Every unresolved appearance must have authentic explicit uncertainty");
  const id = `aud_lpur_${hash([gameId, changes]).slice(0, 32)}`;
  return c.db.$transaction(async tx => {
    const locked = await tx.game.updateMany({ where: { id: gameId, status: "GENERATION_FAILED", deletedAt: null, updatedAt: proof.game.updatedAt }, data: { status: "GENERATION_FAILED" } });
    demand(locked.count === 1, "Game changed before continuation");
    const tc: Container = { ...c, db: tx as Container["db"], storage: new DbStorage(tx as Container["db"]) };
    const current = await requireLocalPatchRecoveryIdentity(tc, gameId);
    demand(current.identityAssetId === proof.identityAssetId && current.identitySha256 === proof.identitySha256
      && same(current.child, proof.child) && same(current.game.orders, proof.game.orders) && same(current.game.scenes, proof.game.scenes)
      && same(current.game.jobs, proof.game.jobs), "Identity, ownership, order or job changed before continuation");
    const currentCost = await requireLocalPatchRecoveryBudget(tc, gameId);
    demand(currentCost.committedMicroUsd + LOCAL_PATCH_RESERVE.renderMicroUsd <= 4_000_000, "Budget changed before continuation");
    for (const key of preparedKeys) demand(!await current.budget.readRequest(worldId, key) && !await new PrismaRetainedPurchaseStore(tx).get(worldId, key),
      "Prepared appearance acquired evidence before continuation");
    for (const change of changes) {
      const retained = await new PrismaRetainedPurchaseStore(tx).get(worldId, change.requestKey);
      const bill = await current.budget.readRequest(worldId, change.requestKey);
      demand(retained && retained.payloadSha256 === change.payloadSha256 && retained.operationFingerprint === change.fingerprint
        && retained.evidence && bill && (bill.state === "settled" || bill.state === "linked") && !bill.conflicts.length
        && bill.operationFingerprint === change.fingerprint && sameChargeEvidence(retained.evidence, bill.evidence), "Paid evidence changed before continuation");
    }
    const fresh = await tx.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
      include: { targetInstance: { select: { gameSceneId: true, targetId: true } } }, orderBy: { id: "asc" } });
    demand(same(fresh, all), "An appearance changed before continuation");
    for (const prepared of preparedBoards) for (const entry of prepared.entries) {
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: entry.asset.id } });
      demand(same(asset, entry.asset) && sha256Bytes(await tc.storage.get(asset.storagePath)) === entry.imageSha256,
        "Reviewed pixels or ownership changed before continuation");
    }
    await tx.auditLog.create({ data: { id, actorType: "SYSTEM", action: LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ version: 1, requestedBy: actor.id, reason: "Authenticated admin Retry: genuine uncertainty uses an existing bounded image attempt",
        approvalGranted: false, identityAssetId: proof.identityAssetId, identitySha256: proof.identitySha256, ageYears: proof.child.ageYears,
        previousGameError: proof.game.lastError, previousJobs: proof.game.jobs, changes }) } });
    for (const change of changes) {
      // Original raw, verdict, attempts, image/geometry and paid receipts stay byte-exact.
      await tx.targetVariantAsset.update({ where: { id: change.rowId }, data: { lastError: `quality-retry: ${change.checks.join("; ")}` } });
      await tx.gameScene.update({ where: { id: change.sceneId }, data: { generationStatus: "NEEDS_REGENERATION" } });
    }
    await transitionGame(tc, gameId, "TARGETS_GENERATING", SYSTEM, { source: LOCAL_PATCH_UNCERTAINTY_RESUME_ACTION, auditId: id });
    await tx.game.update({ where: { id: gameId }, data: { lastError: null } });
    await tx.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    return { gameId, resumedHideIds: changes.map(change => change.hideId), alreadyResumed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

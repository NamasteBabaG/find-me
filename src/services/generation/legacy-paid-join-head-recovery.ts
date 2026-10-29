import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { DbStorage } from "../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { LEGACY_PAID_JOIN_HEAD_VERSION, legacyHeadCorrectionCandidate } from "../../domain/generation/legacy-paid-join-head";
import { QA_COMPLETION_CAP, qaCompletionCapacityId, qaCompletionReceiptSchema } from "../../domain/generation/qa-completion-capacity";
import { qaCompletionUnknownsPreserved } from "../../domain/generation/qa-completion-recovery";
import { cropOf, maskForHide } from "../../domain/scene/local-patch-hides";
import { localPatchReturnRegion } from "../../domain/scene/local-patch-return-region";
import { readQaCompletionCapacity } from "./qa-completion-capacity";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import { singleReviewHeadEvidence } from "./single-review-head-evidence";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { auditWorldBudget } from "./world-budget";
import { sha256Bytes } from "./fixed-sprite";

export const LEGACY_HEAD_RECOVERY_ACTION = "local-patch:legacy-head-source-corrected";
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
type Candidate = { id: string; status: string; assetId: string | null; attempts: number; judgeJson: string | null };

/** No purchase or visual approval: correct ONE proven input mismatch on the
 * same candidate. Its ordinary new MEDIUM question still has to pass every role.
 * Old questions/receipts remain immutable; all prior row data is archived. */
export async function reconcileLegacyPaidJoinHead(c: Container, gameId: string, rows: readonly Candidate[],
  fence: (tx: Prisma.TransactionClient) => Promise<void>) {
  const result = { changed: false, continuePaidRows: [] as string[] };
  const candidates = rows.filter(legacyHeadCorrectionCandidate); if (!candidates.length) return result;
  const worldId = gameId + ":board-wizard", grant = await readQaCompletionCapacity(c, worldId); if (!grant) return result;
  const authorityRow = await c.db.auditLog.findUniqueOrThrow({ where: { id: qaCompletionCapacityId(gameId) } });
  const authority = qaCompletionReceiptSchema.parse(JSON.parse(authorityRow.metaJson!));
  if (authority.authorizationSha256 !== grant.authorizationSha256) return result;
  const stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldId); if (!stored) return result;
  // Existing paid diagnosis dispatches retain their exact inputs even while
  // another request is pending. The ordinary purchase-once path owns recovery.
  for (const row of candidates) {
    const j = JSON.parse(row.judgeJson!), state = j.selfRepair;
    if (state.phase === "diagnosing" && stored.snapshot.requests.some(r => r.requestKey === `self-repair:${j.hide}:diagnosis:${state.cycle}`))
      result.continuePaidRows.push(row.id);
  }
  const audit = auditWorldBudget(stored.snapshot, QA_COMPLETION_CAP);
  if (audit.held || audit.overCapMicroUsd || audit.pendingRequestKeys.length || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length
    || !qaCompletionUnknownsPreserved(stored.snapshot.requests, authority.unknowns)) return result;
  const context = await resolveLocalPatchBoardsForGame(c.db, gameId, authority.state.sceneVersion);
  for (const candidate of candidates) {
    const row = await c.db.targetVariantAsset.findUniqueOrThrow({ where: { id: candidate.id }, include: { targetInstance: { include: { gameScene: true } } } });
    if (!legacyHeadCorrectionCandidate(row) || row.targetInstance.gameScene.gameId !== gameId) continue;
    const j = JSON.parse(row.judgeJson!), state = j.selfRepair, scene = row.targetInstance.gameScene;
    // A retained paid diagnosis must finish through its existing exact question;
    // do not change the evidence behind an already dispatched diagnosis.
    if (state.phase === "diagnosing") {
      const paid = stored.snapshot.requests.find(r => r.requestKey === `self-repair:${j.hide}:diagnosis:${state.cycle}`);
      if (paid) { if (!result.continuePaidRows.includes(row.id)) result.continuePaidRows.push(row.id); continue; }
    }
    const board = context.boards.find(b => b.board === scene.sceneSlug), hide = board?.hides.find(h => h.targetId === row.targetInstance.targetId);
    if (!board || !hide || hide.id !== j.hide || scene.sceneVersion !== authority.state.sceneVersion) continue;
    const asset = await c.db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
    if (asset.deletedAt || asset.ownerId !== authority.state.ownerId || asset.providerRequestId !== gameId
      || asset.type !== "TARGET_SPRITE" || asset.visibility !== "GAME" || j.geometrySha256 !== localPatchPublicationGeometryHash(row)) continue;
    const shipping = await c.storage.get(asset.storagePath); if (sha256Bytes(shipping) !== j.judgedSha256) continue;
    const corrected = await singleReviewHeadEvidence(c.db, { gameId, hide, attempt: row.attempts,
      receipt: { ...j, headSourceVersion: LEGACY_PAID_JOIN_HEAD_VERSION }, shipping,
      geometrySha256: j.geometrySha256, identitySha256: authority.state.identitySha256 });
    const oldHead = j.boardReview?.dual?.quality?.headEvidence;
    const oldKey = oldHead?.sourceRequestKey ?? `${hide.id}:${hide.pose}:render:${row.attempts}`;
    const oldReturn = oldHead?.returned ?? localPatchReturnRegion(cropOf(hide), maskForHide(hide), hide.returnRect).local;
    if (oldKey === corrected.evidence.sourceRequestKey && hash(oldReturn) === hash(corrected.evidence.returned)) continue;
    const id = "aud_legacy_head_" + hash([grant.authorizationSha256, row.id, row.judgeJson, LEGACY_PAID_JOIN_HEAD_VERSION]).slice(0, 40);
    result.changed = await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await fence(tx);
      const scoped = { ...c, db: tx as Container["db"], storage: new DbStorage(tx) };
      const active = await readQaCompletionCapacity(scoped, worldId), current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
      const liveGame = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
      const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId);
      const blob = await tx.fileBlob.findUnique({ where: { key: asset.storagePath } });
      const currentAsset = await tx.asset.findUniqueOrThrow({ where: { id: asset.id } });
      if (!active || active.authorizationSha256 !== grant.authorizationSha256 || liveGame.status !== "TARGETS_GENERATING" || liveGame.configJson || liveGame.readyAt
        || current.judgeJson !== row.judgeJson || current.assetId !== row.assetId || current.status !== row.status || current.attempts !== row.attempts
        || current.costCents !== row.costCents || !ledger || ledger.revision !== stored.revision || hash(ledger.snapshot) !== hash(stored.snapshot)
        || !blob || sha256Bytes(Buffer.from(blob.data)) !== j.judgedSha256 || currentAsset.deletedAt || currentAsset.storagePath !== asset.storagePath
        || currentAsset.ownerId !== asset.ownerId || currentAsset.providerRequestId !== gameId || currentAsset.visibility !== "GAME") return false;
      const changed = await tx.worldBudgetLedger.updateMany({ where: { worldId, revision: stored.revision }, data: { revision: { increment: 1 } } });
      if (changed.count !== 1) return false;
      await tx.auditLog.create({ data: { id, actorType: "SYSTEM", action: LEGACY_HEAD_RECOVERY_ACTION, entityType: "Game", entityId: gameId,
        metaJson: JSON.stringify({ version: LEGACY_PAID_JOIN_HEAD_VERSION, authorizationSha256: grant.authorizationSha256, variantId: row.id,
          previousJudgeJson: row.judgeJson, previousAssetId: row.assetId, previousCostCents: row.costCents, previousHead: oldHead ?? null,
          correctedHead: corrected.evidence, attemptsPreserved: true, cyclesPreserved: true, requestsPreserved: true, providerCalls: 0 }) } });
      const receipt = { ...j, headSourceVersion: LEGACY_PAID_JOIN_HEAD_VERSION,
        legacyHeadRecovery: { version: LEGACY_PAID_JOIN_HEAD_VERSION, previousReceiptSha256: hash(row.judgeJson), authorizationSha256: grant.authorizationSha256 },
        boardReview: undefined, dualContinuityCheckpoint: undefined, verdict: null, wireFault: null, qualityDisposition: undefined, reviewState: "pending-board-review" };
      await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: "GENERATED", lastError: null, judgeJson: JSON.stringify(receipt) } });
      await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "GENERATED", spriteKind: "image", spriteAssetId: row.assetId } });
      await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: "NEEDS_REGENERATION", configJson: null } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    if (result.changed) return result;
  }
  return result;
}

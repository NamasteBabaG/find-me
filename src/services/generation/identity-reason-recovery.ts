import { Prisma } from "@prisma/client";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { boardWizardBudget } from "./board-wizard-budget";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DETECTIVES_SCENE_VERSION } from "../../domain/scene/local-patch-versions";
import { DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256 } from "../../../content/detectives/identity-style-release";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { sourcePlacementReleaseOf } from "./source-placement-release";
import { IDENTITY_GATE_ACTION, identityGateReceiptSchema, identityReceiptReadyForPublication,
  reconciledIdentityReason, retainIdentityReasonReconciliation, IDENTITY_REASON_RECONCILIATION_VERSION } from "./board-wizard-identity-gate";

const STYLE = "local-patch-world-v1";
const HOLD = "board-wizard: unresolved-identity; retained evidence requires reconciliation; no automatic repurchase";
const JOB_HOLD = "board-wizard: unresolved-identity";
function demand(ok: unknown): asserts ok { if (!ok) throw Error("IDENTITY_REASON: retained source or hold changed"); }

/** The cron can wake only a Detective identity held for its explanation length.
 * All seven original checks, owned pixels, the real bill and the unchanged
 * hold must agree. Historical worlds and every other hold remain untouched. */
export async function resumeIdentityReasonHold(c: Container, requestedGameId: string | null): Promise<string | null> {
  if (env().APP_ENV !== "qa" || env().GENERATION_ENABLED === "off" || c.storage?.id !== "db") return null;
  const candidates = await c.db.game.findMany({ where: {
    ...(requestedGameId ? { id: requestedGameId } : {}), status: "MANUAL_REVIEW", lastError: HOLD,
    styleVersion: STYLE, searchLevel: "detectives", deletedAt: null, configJson: null, readyAt: null, paidAt: { not: null },
    scenes: { some: { sceneVersion: DETECTIVES_SCENE_VERSION }, every: { sceneVersion: DETECTIVES_SCENE_VERSION } },
    jobs: { some: { status: "DONE", currentStep: null, lastError: JOB_HOLD } },
  }, include: { childProfile: true, scenes: { select: { sceneVersion: true } }, jobs: true },
  orderBy: { updatedAt: "asc" }, take: requestedGameId ? 1 : 3 });
  for (const game of candidates) {
    try {
      const child = game.childProfile, job = game.jobs.find(j => j.id === `job_${game.id}`);
      if (!child || !game.ownerId || child.ownerId !== game.ownerId || child.deletedAt
        || !child.identityAssetId || !child.avatarAssetId || !child.originalPhotoAssetId || !child.ageYears
        || game.scenes.length !== 9 || !job || job.status !== "DONE" || job.currentStep !== null || job.lastError !== JOB_HOLD) continue;
      const steps = JSON.parse(job.stepsJson), held = steps.boardWizardIdentity, checkpoint = steps.identityBestOfTwo;
      if (held?.version !== "board-wizard-identity-lifecycle/v1" || held.state !== "held" || held.reason !== "unresolved-identity"
        || checkpoint?.policy !== "identity-best-of-two/v1" || checkpoint.selected || checkpoint.second || checkpoint.recovery
        || checkpoint.first?.identityAssetId !== child.identityAssetId || checkpoint.first?.avatarAssetId !== child.avatarAssetId) continue;
      const row = await c.db.auditLog.findFirst({ where: { action: IDENTITY_GATE_ACTION, entityType: "Asset",
        entityId: child.identityAssetId }, orderBy: { createdAt: "desc" } });
      if (!row?.metaJson) continue;
      const original = identityGateReceiptSchema.parse(JSON.parse(row.metaJson));
      const decoded = reconciledIdentityReason(original);
      if (!decoded || !identityReceiptReadyForPublication(decoded, DETECTIVES_SCENE_VERSION)
        || original.provenance.photoAssetId !== child.originalPhotoAssetId
        || original.provenance.ageYears !== child.ageYears || hash(original.provenance.crop) !== hash(JSON.parse(child.photoCropJson ?? "null"))
        || original.provenance.style.catalogSha256 !== DETECTIVE_IDENTITY_STYLE_CATALOG_SHA256) continue;
      const sourcePin = await sourcePlacementReleaseOf(c.db, game.id);
      if (!sourcePin || sourcePin.baseSceneVersion !== DETECTIVES_SCENE_VERSION) continue;
      const budget = boardWizardBudgetOf(c), audit = await budget.audit(boardWizardWorldId(game.id));
      if (audit.capMicroUsd !== 4_000_000 || audit.held || audit.pendingRequestKeys.length || audit.unknownRequestKeys.length) continue;
      const restored = await c.db.$transaction(async tx => {
        // Game -> Job -> Child, the same order used by deletion and identity claims.
        const fencedGame = await tx.game.updateMany({ where: { id: game.id, ownerId: game.ownerId,
          childProfileId: child.id, status: game.status, lastError: HOLD, styleVersion: STYLE,
          updatedAt: game.updatedAt, deletedAt: null, configJson: null, readyAt: null, paidAt: game.paidAt },
          data: { status: "AVATAR_GENERATING", lastError: null } });
        const fencedJob = await tx.generationJob.updateMany({ where: { id: job.id, gameId: game.id,
          status: "DONE", currentStep: null, attempts: job.attempts, updatedAt: job.updatedAt,
          lastError: JOB_HOLD, stepsJson: job.stepsJson },
          data: { status: "QUEUED", currentStep: "avatar", lastError: null,
            stepsJson: JSON.stringify({ ...steps, boardWizardIdentity: { ...held, state: "reconciled",
              reconciliation: IDENTITY_REASON_RECONCILIATION_VERSION, retainedHoldSha256: hash({ game, job, child }) } }) } });
        const fencedChild = await tx.childProfile.updateMany({ where: { id: child.id, ownerId: game.ownerId,
          deletedAt: null, identityAssetId: child.identityAssetId, avatarAssetId: child.avatarAssetId,
          originalPhotoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears, photoCropJson: child.photoCropJson },
          data: { identityAssetId: child.identityAssetId } });
        demand(fencedGame.count === 1 && fencedJob.count === 1 && fencedChild.count === 1);
        for (const [id, type, digest] of [
          [child.originalPhotoAssetId, "ORIGINAL_PHOTO", original.provenance.photoSha256],
          [child.identityAssetId, "IDENTITY_SHEET", original.sheetSha256],
          [child.avatarAssetId, "AVATAR", null],
        ] as const) {
          demand(id);
          const asset = await tx.asset.findUnique({ where: { id } });
          demand(asset?.ownerId === game.ownerId && asset.type === type && asset.status === "READY" && !asset.deletedAt
            && (asset.visibility === "PRIVATE" || (type === "AVATAR" && asset.visibility === "GAME")));
          const blob = await tx.fileBlob.findUnique({ where: { key: asset.storagePath } });
          demand(blob && (!digest || sha256Bytes(Buffer.from(blob.data)) === digest));
        }
        const pin = await sourcePlacementReleaseOf(tx, game.id);
        demand(pin && hash(pin) === hash(sourcePin));
        // Bill reads must use this transaction connection, including in a one-connection runtime.
        const transactionBudget = boardWizardBudget(new CasWorldBudgetRepository(PrismaWorldBudgetStore.forReadOnlyTransaction(tx)));
        const resolved = await retainIdentityReasonReconciliation(tx, row, game.id, transactionBudget);
        demand(identityReceiptReadyForPublication(resolved, DETECTIVES_SCENE_VERSION));
        await tx.auditLog.create({ data: { id: `aud_identity_reason_resume_${game.id}`, actorType: "SYSTEM",
          action: "generation:identity-reason-resumed", entityType: "Game", entityId: game.id,
          metaJson: JSON.stringify({ version: IDENTITY_REASON_RECONCILIATION_VERSION, originalAuditId: row.id,
            originalReceiptSha256: sha256Bytes(Buffer.from(row.metaJson!)), retainedJob: job,
            retainedGameStatus: game.status, questionFingerprint: original.fingerprint,
            identityAssetId: child.identityAssetId, photoAssetId: child.originalPhotoAssetId,
            providerCallsAdded: 0, attemptsReset: false, capMicroUsd: audit.capMicroUsd }) } });
        return game.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
      return restored;
    } catch {
      // A changed/deleted source, bill, hold or concurrent winner stays closed.
      // No exception text or private provider output is logged or retried here.
    }
  }
  return null;
}

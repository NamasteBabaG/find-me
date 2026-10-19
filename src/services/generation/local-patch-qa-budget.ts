import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { NEW_QA_WORLD_BUDGET_POLICY, NEW_QA_WORLD_CAP_MICRO_USD, NEW_QA_WORLD_BUDGET_AUTHORIZATION, QA_PILOT_COMPLETION_AUTHORIZATION, QA_PILOT_COMPLETION_CAP_MICRO_USD,
  QA_PILOT_COMPLETION_POLICY, QA_PILOT_COMPLETION_WORLDS, newQaWorldBudgetEnabled } from "../../domain/generation/qa-world-budget-policy";
import { boardConditioningHash } from "./board-conditioned-source";
import { DUAL_VISUAL_REVIEW_V3, dualVisualReviewVersion, type DualVisualReviewVersion } from "./visual-review-release";
import type { BoardWizardBudgetGrant } from "./board-wizard-budget";

export const newQaWorldBudgetAuditId = (worldId: string) => "aud_lp6_" + boardConditioningHash(worldId);
const worldOf = (gameId: string) => gameId + ":board-wizard";
const receiptOf = (gameId: string) => ({ version: NEW_QA_WORLD_BUDGET_POLICY, gameId, worldId: worldOf(gameId),
  appEnv: "qa", styleVersion: "local-patch-world-v1", promptRelease: "v19", visualReviewRelease: DUAL_VISUAL_REVIEW_V3,
  capMicroUsd: NEW_QA_WORLD_CAP_MICRO_USD, authorizationEvidenceSha256: boardConditioningHash(NEW_QA_WORLD_BUDGET_AUTHORIZATION),
  automaticRelease: false });

/** Called ONLY in the transaction creating a fresh draft, after its review pin.
 * Flags on a later deployment cannot enroll an older draft or paid world. */
export async function pinNewQaWorldBudget(tx: Prisma.TransactionClient, gameId: string, storageId: string,
  reviewRelease: DualVisualReviewVersion | undefined) {
  if (!newQaWorldBudgetEnabled({ appEnv: env().APP_ENV, storageId, promptRelease: env().LOCAL_PATCH_PROMPT_RELEASE, reviewRelease })) return;
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== "DRAFT" || game.styleVersion !== "local-patch-world-v1" || game.deletedAt || game.readyAt || game.configJson || game.paidAt
    || await dualVisualReviewVersion(tx, gameId) !== DUAL_VISUAL_REVIEW_V3
    || await tx.order.findFirst({ where: { gameId } })
    || await tx.generationJob.findFirst({ where: { gameId } })
    || await tx.worldBudgetLedger.findUnique({ where: { worldId: worldOf(gameId) } })) throw Error("Only an unstarted new QA draft may receive the six-dollar policy");
  await tx.auditLog.create({ data: { id: newQaWorldBudgetAuditId(worldOf(gameId)), actorType: "SYSTEM", action: NEW_QA_WORLD_BUDGET_POLICY,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receiptOf(gameId)) } });
}

/** Exact immutable pin + current QA/payment/ownership lifecycle. A caller's cap,
 * job capsule, deployment flag or another world's pin is never an authorization. */
export async function readNewQaWorldBudget(c: Container, worldId: string): Promise<BoardWizardBudgetGrant | null> {
  if (env().APP_ENV !== "qa" || c.storage?.id !== "db" || !worldId.endsWith(":board-wizard")) return null;
  const row = await c.db.auditLog.findUnique({ where: { id: newQaWorldBudgetAuditId(worldId) } });
  if (!row) return null;
  const gameId = worldId.slice(0, -":board-wizard".length), expected = receiptOf(gameId);
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== NEW_QA_WORLD_BUDGET_POLICY || row.entityType !== "Game"
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(expected)) throw Error("Invalid new-QA world budget policy; refusing a fallback");
  if (await dualVisualReviewVersion(c.db, gameId) !== DUAL_VISUAL_REVIEW_V3) throw Error("New QA budget no longer matches its review pin");
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, scenes: true, orders: true } });
  if (!game || game.deletedAt || game.status === "DELETED" || game.styleVersion !== expected.styleVersion || !game.ownerId || !game.childProfileId
    || !game.childProfile || game.childProfile.deletedAt || game.childProfile.ownerId !== game.ownerId
    || game.scenes.length !== 9 || game.scenes.some(s => s.sceneVersion !== 12)
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) return null;
  // The named pilot world's completion frame (QA_PILOT_COMPLETION_POLICY), on top of this verified pin only.
  if (QA_PILOT_COMPLETION_WORLDS.has(worldId)) return { worldId, capMicroUsd: QA_PILOT_COMPLETION_CAP_MICRO_USD,
    authorizationSha256: boardConditioningHash({ policy: QA_PILOT_COMPLETION_POLICY, worldId, authorization: QA_PILOT_COMPLETION_AUTHORIZATION, pin: expected }) };
  return { worldId, capMicroUsd: NEW_QA_WORLD_CAP_MICRO_USD, authorizationSha256: boardConditioningHash(expected) };
}

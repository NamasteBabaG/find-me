import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { PrismaWorldBudgetStore, WORLD_BUDGET_LEDGER_MAX_REVISION } from "../../infra/db/prisma-world-budget-store";
import { boardConditioningHash } from "./board-conditioned-source";
import type { BoardWizardBudgetExtension } from "./board-wizard-budget";
import { auditWorldBudget, WorldBudgetError } from "./world-budget";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";

/** Owner approved a standing five-dollar per-world ceiling on 2026-09-30.
 * The policy is deployed code, not an editable browser grant or a per-game ask. */
export const LOCAL_PATCH_EMERGENCY_BUDGET_POLICY = "local-patch:automatic-five-dollar-recovery/v1";
const policy = { version: LOCAL_PATCH_EMERGENCY_BUDGET_POLICY, baseCapMicroUsd: 4_000_000, capMicroUsd: 5_000_000,
  contentVersion: 12, authorizationEvidenceSha256: boardConditioningHash("2026-09-30: תאשר 5 לעולם\nיש אישור") } as const;
const policySha256 = boardConditioningHash(policy);
const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_:.@/-]{1,250}$/);
const money = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const bodySchema = z.object({ version: z.literal(LOCAL_PATCH_EMERGENCY_BUDGET_POLICY), policySha256: digest,
  worldId: id, gameId: id, ownerId: id, childProfileId: id, contentVersion: z.literal(12),
  baseCapMicroUsd: z.literal(4_000_000), capMicroUsd: z.literal(5_000_000),
  ledgerRevision: money, ledgerSha256: digest, committedMicroUsd: money,
  refusedReservation: z.object({ worldId: id, requestKey: id, scope: z.enum(["identity", "sheet", "image", "judge", "repair"]),
    operationFingerprint: z.string().min(1).max(500), reserveMicroUsd: money.positive() }).strict(),
  retainedUnknownRequests: z.array(z.object({ requestKey: id, reserveMicroUsd: money }).strict()),
  activatedAt: z.string().datetime(), automaticRelease: z.literal(false),
}).strict();
const receiptSchema = bodySchema.extend({ authorizationSha256: digest }).strict();
export const localPatchEmergencyBudgetAuditId = (worldId: string) => `aud_lp5_${boardConditioningHash(worldId)}`;
const eligible = (game: { status: string; styleVersion: string | null; deletedAt: Date | null; configJson: string | null;
  readyAt: Date | null; ownerId: string | null; childProfileId: string | null; scenes: { sceneVersion: number }[];
  childProfile: { ownerId: string | null; deletedAt: Date | null } | null;
  orders: { userId: string | null; paymentStatus: string; paidAt: Date | null; refundedAt: Date | null }[] }) =>
  game.styleVersion === "local-patch-world-v1" && !game.deletedAt && game.ownerId && game.childProfileId && game.childProfile
  && !game.childProfile.deletedAt && game.childProfile.ownerId === game.ownerId && game.scenes.length === 9
  && game.scenes.every(s => s.sceneVersion === 12)
  && game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
  && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt);

/** Reads only an immutable policy receipt. Accounting reads after delivery keep
 * showing the same ceiling; deletion, refund and ownership changes revoke it. */
export async function readLocalPatchEmergencyBudget(c: Container, worldId: string): Promise<BoardWizardBudgetExtension | null> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return null;
  const row = await c.db.auditLog.findUnique({ where: { id: localPatchEmergencyBudgetAuditId(worldId) } });
  if (!row) return null;
  const receipt = receiptSchema.parse(JSON.parse(row.metaJson ?? "null")), { authorizationSha256, ...body } = receipt;
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== LOCAL_PATCH_EMERGENCY_BUDGET_POLICY
    || row.entityType !== "Game" || row.entityId !== receipt.gameId || receipt.worldId !== worldId
    || worldId !== `${receipt.gameId}:board-wizard` || receipt.policySha256 !== policySha256
    || boardConditioningHash(body) !== authorizationSha256) throw Error("Invalid automatic world budget policy receipt");
  const game = await c.db.game.findUnique({ where: { id: receipt.gameId }, include: { childProfile: true, scenes: true, orders: true } });
  if (!game || !eligible(game) || game.ownerId !== receipt.ownerId || game.childProfileId !== receipt.childProfileId) return null;
  return { worldId, capMicroUsd: receipt.capMicroUsd, authorizationSha256 };
}

/** Activated only by the real transactional four-dollar refusal. The exact
 * refused purchase must fit five dollars; conflicts, pending purchases and
 * unapproved UNKNOWNs cannot be bypassed. No request/asset/approval is edited. */
export async function activateLocalPatchEmergencyBudget(c: Container, gameId: string, error: unknown,
  fence: (tx: Prisma.TransactionClient) => Promise<void>): Promise<boolean> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db" || !(error instanceof WorldBudgetError)
    || error.code !== "cap_exceeded" || !error.refusedReservation || error.refusedReservation.worldId !== `${gameId}:board-wizard`) return false;
  const worldId = error.refusedReservation.worldId, auditId = localPatchEmergencyBudgetAuditId(worldId);
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId); await fence(tx);
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: true, orders: true } });
    if (!eligible(game) || game.status !== "TARGETS_GENERATING" || game.configJson || game.readyAt) return false;
    const previous = await tx.auditLog.findUnique({ where: { id: auditId } });
    // A single immutable grant is never stacked. A concurrent acknowledgement
    // uses the existing receipt, with no second dollar or new reservation.
    if (previous) return false;
    const store = PrismaWorldBudgetStore.forContinuationApprovalTransaction(tx), stored = await store.read(worldId);
    if (!stored || stored.revision >= WORLD_BUDGET_LEDGER_MAX_REVISION) return false;
    const audit = auditWorldBudget(stored.snapshot), refused = error.refusedReservation!;
    if (audit.held || audit.pendingRequestKeys.length || audit.overCapMicroUsd || audit.conflictRequestKeys.length || audit.overrunRequestKeys.length
      || stored.snapshot.requests.some(r => r.requestKey === refused.requestKey)
      || audit.committedMicroUsd + refused.reserveMicroUsd <= policy.baseCapMicroUsd
      || audit.committedMicroUsd + refused.reserveMicroUsd > policy.capMicroUsd) return false;
    const body = bodySchema.parse({ version: policy.version, policySha256, worldId, gameId,
      ownerId: game.ownerId, childProfileId: game.childProfileId, contentVersion: 12,
      baseCapMicroUsd: policy.baseCapMicroUsd, capMicroUsd: policy.capMicroUsd, ledgerRevision: stored.revision,
      ledgerSha256: boardConditioningHash(stored.snapshot), committedMicroUsd: audit.committedMicroUsd, refusedReservation: refused,
      retainedUnknownRequests: stored.snapshot.requests.filter(r => r.state === "unknown").map(r => ({ requestKey: r.requestKey, reserveMicroUsd: r.reserveMicroUsd })),
      activatedAt: new Date().toISOString(), automaticRelease: false });
    const receipt = receiptSchema.parse({ ...body, authorizationSha256: boardConditioningHash(body) });
    const locked = await tx.worldBudgetLedger.updateMany({ where: { worldId, revision: stored.revision }, data: { revision: { increment: 1 } } });
    if (locked.count !== 1) throw Error("World ledger changed during emergency budget activation");
    await tx.auditLog.create({ data: { id: auditId, actorType: "SYSTEM", action: policy.version,
      entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receipt) } });
    await tx.generationJob.update({ where: { id: `job_${gameId}` }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    return true;
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}

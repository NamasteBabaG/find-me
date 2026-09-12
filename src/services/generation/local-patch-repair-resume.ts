import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import type { Container } from "../container";
import { audit, SYSTEM } from "../audit.service";
import { transitionGame } from "../game-status";
import { WORLD_LOCAL_PATCH_HIDES } from "../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_SCENE_VERSION } from "../../../content/scenes/local-patch-release";
import { LOCAL_PATCH_STYLE } from "./local-patch-world";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT } from "./local-patch-hide";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { sha256Bytes } from "./fixed-sprite";

export const LOCAL_PATCH_REPAIR_RESUME_ACTION = "local-patch:repair-resume-authorized";
export const LOCAL_PATCH_REPAIR_RESUME_CONFIRMATION = "authorize-one-post-normal-repair-per-failed-hide";
export interface LocalPatchRepairResumeInput {
  readonly gameId: string;
  readonly operatorId: string;
  /** An explicit user authorization reference/reason, never credentials or image data. */
  readonly authorizationReason: string;
}
function demand(ok: unknown, reason: string): asserts ok { if (!ok) throw new Error(`LOCAL_PATCH_REPAIR_RESUME: ${reason}`); }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

/** Shared read-only qualification; the mutation repeats it under the game lock. */
async function inspectRepairResume(c: Container, gameId: string) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only durable QA games may be resumed");
  demand(/^[A-Za-z0-9_-]{1,160}$/.test(gameId), "An explicit game is required");
  const auditId = `aud_lprr_${digest(gameId)}`, tx = c.db, tc = c;
    demand(!await tx.auditLog.findUnique({ where: { id: auditId } }), "This game's one repair resume was already authorized");
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { owner: true, childProfile: true, orders: true, jobs: true,
      scenes: { include: { targets: { include: { variants: true } } } } } });
    demand(game.status === "MANUAL_REVIEW" && !game.deletedAt && game.styleVersion === LOCAL_PATCH_STYLE, "The exact game must still be live and in MANUAL_REVIEW");
    const child = game.childProfile;
    demand(game.owner && game.ownerId && game.paidAt && game.packageTier === "ONE_WORLD" && game.sceneCount === 9 && !game.readyAt && !game.configJson
      && child && !child.deletedAt && child.ownerId === game.ownerId && child.ageYears && child.identityAssetId && child.originalPhotoAssetId && child.avatarAssetId,
    "An owned, paid, unpublished game with a live child identity is required");
    demand(game.orders.some(order => order.userId === game.ownerId && order.paymentStatus === "PAID" && order.paidAt && !order.refundedAt)
      && !game.orders.some(order => order.paymentStatus === "REFUNDED" || order.refundedAt), "A paid, nonrefunded order is required");
    const job = game.jobs.find(item => item.id === `job_${game.id}`);
    demand(job && game.jobs.every(item => item.status === "DONE" && item.currentStep === null), "Every job must be done, unparked and inactive");
    demand(game.scenes.length === 9 && new Set(game.scenes.map(scene => scene.sceneSlug)).size === 9, "The complete nine-board normal pass is required");
    const repairHideIds: string[] = [];
    const states: { hideId: string; rowId: string; status: string; attempts: number; costCents: number }[] = [];
    for (const board of WORLD_LOCAL_PATCH_HIDES) {
      const scene = game.scenes.find(item => item.sceneSlug === board.board);
      demand(scene && scene.sceneVersion === LOCAL_PATCH_SCENE_VERSION && scene.targets.length === 3, "Every pinned board needs its three normal outcomes");
      for (const hide of board.hides) {
        const target = scene.targets.find(item => item.targetId === hide.targetId);
        const row = target?.variants.find(item => item.variant === LOCAL_PATCH_VARIANT);
        demand(row && row.provider === LOCAL_PATCH_PROVIDER && row.attempts >= 1 && row.attempts <= 2,
          `${hide.id}: no incomplete or already-repaired attempt may receive a fresh allowance`);
        demand(["GENERATED", "APPROVED"].includes(row.status) || row.status === "FAILED" && row.attempts === 2,
          `${hide.id}: normal creation has not finished`);
        if (row.status === "FAILED") repairHideIds.push(hide.id);
        states.push({ hideId: hide.id, rowId: row.id, status: row.status, attempts: row.attempts, costCents: row.costCents });
      }
    }
    demand(states.length === 27 && repairHideIds.length > 0, "At least one exhausted normal hide must need its single repair");
    const budget = boardWizardBudgetOf(tc), worldId = boardWizardWorldId(game.id);
    const spending = await budget.audit(worldId);
    demand(!spending.held && spending.reservedMicroUsd === 0 && !spending.pendingRequestKeys.length && !spending.unknownRequestKeys.length,
      "Pending or unknown charges must be reconciled before resuming");
    for (const [id, type, visibility] of [[child.identityAssetId, "IDENTITY_SHEET", "PRIVATE"], [child.originalPhotoAssetId, "ORIGINAL_PHOTO", "PRIVATE"],
      [child.avatarAssetId, "AVATAR", "GAME"]] as const) {
      const asset = await tx.asset.findUnique({ where: { id } });
      demand(asset && asset.ownerId === game.ownerId && asset.type === type && asset.visibility === visibility && asset.status === "READY" && !asset.deletedAt
        && await tc.storage.exists(asset.storagePath), `The live owned ${type} is required`);
    }
    const sheet = await tx.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
    await requireBoardWizardIdentityApproval(tc, budget, { gameId: game.id, identityAssetId: sheet.id,
      sheetSha256: sha256Bytes(await tc.storage.get(sheet.storagePath)), catalogSha256: (await readBoardConditionedCatalog()).sha256,
      photoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears, crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null });
  return { game, job, states, repairHideIds, spending, auditId };
}

/** Opening the admin page only inspects eligibility; it cannot authorize work. */
export async function localPatchRepairResumeForm(c: Container, gameId: string): Promise<{ failedHides: number } | null> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return null;
  const game = await c.db.game.findUnique({ where: { id: gameId }, select: { status: true, styleVersion: true, deletedAt: true,
    jobs: { select: { id: true, status: true, currentStep: true } },
    scenes: { select: { targets: { select: { variants: { where: { variant: LOCAL_PATCH_VARIANT }, select: { status: true, attempts: true, provider: true } } } } } } } });
  if (!game || game.deletedAt || game.styleVersion !== LOCAL_PATCH_STYLE || game.status !== "MANUAL_REVIEW"
    || !game.jobs.some(job => job.id === `job_${gameId}`) || !game.jobs.every(job => job.status === "DONE" && job.currentStep === null)) return null;
  const rows = game.scenes.flatMap(scene => scene.targets.flatMap(target => target.variants));
  if (game.scenes.length !== 9 || rows.length !== 27 || rows.some(row => row.provider !== LOCAL_PATCH_PROVIDER || row.attempts < 1 || row.attempts > 2
    || !(["GENERATED", "APPROVED"].includes(row.status) || row.status === "FAILED" && row.attempts === 2))) return null;
  const failedHides = rows.filter(row => row.status === "FAILED").length;
  if (!failedHides || await c.db.auditLog.findUnique({ where: { id: `aud_lprr_${digest(gameId)}` }, select: { id: true } })) return null;
  // Full ledger, ownership and byte-bound identity qualification belongs to the
  // explicit POST, not each admin page refresh.
  return { failedHides };
}

/** Internal operator entrypoint, not an HTTP authorization mechanism. The caller
 * must possess explicit authority for this one game. This only queues work;
 * the normal worker still enforces its attempt ceiling and spending gates. */
export async function resumeLocalPatchRepairs(c: Container, input: LocalPatchRepairResumeInput) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only durable QA games may be resumed");
  demand(/^[A-Za-z0-9_-]{1,160}$/.test(input.gameId) && /^[A-Za-z0-9_:@.-]{1,160}$/.test(input.operatorId), "An explicit game and operator are required");
  demand(input.authorizationReason.trim().length >= 10 && input.authorizationReason.length <= 1000, "Record the explicit user authorization");
  return c.db.$transaction(async tx => {
    // Lock in the same Game -> Job order as deletion; concurrent resumes cannot
    // both pass the old MANUAL_REVIEW snapshot and each grant a new allowance.
    const locked = await tx.game.updateMany({ where: { id: input.gameId, styleVersion: LOCAL_PATCH_STYLE,
      status: "MANUAL_REVIEW", deletedAt: null }, data: { status: "MANUAL_REVIEW" } });
    demand(locked.count === 1, "The exact game must still be live and in MANUAL_REVIEW");
    const tc = { ...c, db: tx as unknown as Container["db"], storage: new DbStorage(tx as unknown as Container["db"]) };
    const { game, job, states, repairHideIds, spending, auditId } = await inspectRepairResume(tc, input.gameId);
    const meta = { operatorId: input.operatorId, authorizationReason: input.authorizationReason.trim(), repairHideIds,
      maximumAttempt: 3, normalOutcomesSha256: digest(states), previousJobAttempts: job.attempts, previousGameError: game.lastError,
      settledMicroUsd: spending.settledMicroUsd, budgetChanged: false };
    await transitionGame(tc, game.id, "NEEDS_REGENERATION", SYSTEM, meta);
    await transitionGame(tc, game.id, "TARGETS_GENERATING", SYSTEM, meta);
    const queued = await tx.generationJob.updateMany({ where: { id: job.id, gameId: game.id, status: "DONE", currentStep: null, attempts: job.attempts },
      data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    demand(queued.count === 1, "The completed job changed before it could be queued");
    await tx.game.update({ where: { id: game.id }, data: { lastError: null } });
    await audit(tc, SYSTEM, LOCAL_PATCH_REPAIR_RESUME_ACTION, "Game", game.id, meta);
    // A stable one-shot marker prevents another repair grant even if somebody
    // later puts the game back into review. It stores metadata only.
    await tx.auditLog.create({ data: { id: auditId, actorType: "SYSTEM", action: `${LOCAL_PATCH_REPAIR_RESUME_ACTION}:once`, entityType: "Game", entityId: game.id,
      metaJson: JSON.stringify(meta) } });
    return { gameId: game.id, status: "TARGETS_GENERATING" as const, repairHideIds, auditId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 });
}

import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import type { CharacterOutput } from "../../infra/generation/types";
import { env } from "../../lib/env";
import { newId } from "../../lib/ids";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { boardWizardBudget } from "./board-wizard-budget";
import { boardConditioningHash } from "./board-conditioned-source";
import type { BudgetJson } from "./world-budget";
import type { IdentityProvenance } from "./board-wizard-identity-gate";

export interface BoardWizardIdentityClaim {
  gameId: string; jobId: string; jobAttempt: number; styleVersion: string;
  ownerId: string; childId: string; photoAssetId: string;
  avatarAssetId: string | null; identityAssetId: string | null;
  childName: string; ageYears: number | null;
}
const scope = (id: string) => `${id}:board-wizard`;
const requestKey = "wizard:identity:1";
function demand(ok: unknown): asserts ok { if (!ok) throw new Error("BOARD_IDENTITY: stale or deleted identity claim"); }
const budgetFor = (c: Container) => boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(c.db)));
const enabled = () => env().APP_ENV === "qa" && process.env.QA_BOARD_CONDITIONED_WIZARD === "true";
const usageKeys = new Set(["totalTokens", "inputTokens", "outputTokens", "textInputTokens", "imageInputTokens",
  "total_tokens", "input_tokens", "output_tokens", "text_input_tokens", "image_input_tokens"]);

/** Game -> Job -> Child matches identity deletion's lock order. */
async function fence(tx: Prisma.TransactionClient, claim: BoardWizardIdentityClaim) {
  const game = await tx.game.updateMany({ where: { id: claim.gameId, ownerId: claim.ownerId, childProfileId: claim.childId,
    styleVersion: claim.styleVersion, deletedAt: null, status: { in: ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"] } }, data: { styleVersion: claim.styleVersion } });
  const job = await tx.generationJob.updateMany({ where: { id: claim.jobId, gameId: claim.gameId, attempts: claim.jobAttempt, status: "RUNNING", currentStep: "avatar" }, data: { currentStep: "avatar" } });
  const child = await tx.childProfile.updateMany({ where: { id: claim.childId, ownerId: claim.ownerId, deletedAt: null,
    originalPhotoAssetId: claim.photoAssetId, displayName: claim.childName, ageYears: claim.ageYears,
    avatarAssetId: claim.avatarAssetId, identityAssetId: claim.identityAssetId }, data: { displayName: claim.childName } });
  demand(game.count === 1 && job.count === 1 && child.count === 1);
}

export async function withBoardWizardIdentityClaim<T>(c: Container, claim: BoardWizardIdentityClaim, work: (tx: Prisma.TransactionClient) => Promise<T>) {
  demand(enabled() && c.storage.id === "db");
  return c.db.$transaction(async tx => { await fence(tx, claim); return work(tx); },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** A classified stop is consumed by the QA branch; never put it back into the legacy retry queue. */
export async function holdBoardWizardIdentity(c: Container, claim: BoardWizardIdentityClaim, reason: "unresolved-identity" | "identity-enrollment-failed" | "identity-style-review-required") {
  try {
    await c.db.$transaction(async tx => {
      // References may have been atomically published already. Deletion, owner
      // and lease must still match; another runner's state is never overwritten.
      const game = await tx.game.updateMany({ where: { id: claim.gameId, ownerId: claim.ownerId, childProfileId: claim.childId,
        styleVersion: claim.styleVersion, deletedAt: null, status: { in: ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"] } }, data: { status: "MANUAL_REVIEW", lastError: `board-wizard: ${reason}; retained evidence requires reconciliation; no automatic repurchase` } });
      const job = await tx.generationJob.findUnique({ where: { id: claim.jobId } });
      demand(game.count === 1 && job && job.attempts === claim.jobAttempt && job.status === "RUNNING");
      const changed = await tx.generationJob.updateMany({ where: { id: claim.jobId, attempts: claim.jobAttempt, status: "RUNNING" }, data: {
        status: "DONE", currentStep: null, lastError: `board-wizard: ${reason}`,
        stepsJson: JSON.stringify({ ...JSON.parse(job.stepsJson), boardWizardIdentity: { version: "board-wizard-identity-lifecycle/v1", state: "held", reason } }),
      } });
      demand(changed.count === 1);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch {
    // Deletion or a replacement lease wins. Never rewrite that game/child or
    // rethrow into the legacy catch, which would resurrect a resumable failure.
    console.warn("[board-identity] hold could not acquire the live claim; retained reservation remains fail-closed");
  }
}

/** One paid call at most. Billing survives a lost/deleted image publication. */
export async function generateBoardWizardIdentity(c: Container, claim: BoardWizardIdentityClaim, deps: {
  reserve(): Promise<void>; generate(): Promise<CharacterOutput>; provenance?: IdentityProvenance;
}): Promise<boolean> {
  const budget = budgetFor(c);
  try {
    demand(enabled() && c.storage.id === "db");
    await c.db.$transaction(tx => fence(tx, claim), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await deps.reserve();
    const character = await deps.generate();
    const providerRequestId = /^req[-_][A-Za-z0-9_-]{1,160}$/.test(character.providerRequestId ?? "") && !character.providerRequestId?.includes("sk-") ? character.providerRequestId : null;
    const usage = character.usage && Object.keys(character.usage).length > 0 && Object.keys(character.usage).length <= 30
      && Object.entries(character.usage).every(([key, value]) => usageKeys.has(key) && Number.isSafeInteger(value) && value >= 0) ? character.usage : null;
    const known = !character.costUnknown && Number.isFinite(character.costCents) && character.costCents > 0
      && character.model === "gpt-image-2" && providerRequestId && usage;
    // Billing-only receipt intentionally survives deletion/lost publication.
    // Unknown is explicit; a returned zero quote is never a free-call claim.
    await c.db.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: "board-wizard:identity-response", entityType: "Game", entityId: claim.gameId,
      metaJson: JSON.stringify({ providerRequestId, modelMatches: character.model === "gpt-image-2", costUnknown: !known,
        quotedCostCents: Number.isFinite(character.costCents) && character.costCents >= 0 ? character.costCents : null, usage }) } });
    if (known) await budget.settle(scope(claim.gameId), requestKey, { providerNamespace: "openai:find-me-existing",
      providerRequestId: character.providerRequestId!, usageId: boardConditioningHash(character.usage), rawUsage: character.usage as BudgetJson,
      model: character.model, amountMicroUsd: Math.ceil(character.costCents * 10_000), costBasis: "conservative-upper-estimate" });
    else await budget.markUnknown(scope(claim.gameId), requestKey, "Identity response lacks trustworthy request-level billing evidence");

    await c.db.$transaction(async tx => {
      await fence(tx, claim);
      const sheetId = newId("ast"), avatarId = newId("ast");
      for (const asset of [
        { id: sheetId, type: "IDENTITY_SHEET", visibility: "PRIVATE", png: character.sheetPng, width: character.sheetWidth, height: character.sheetHeight },
        { id: avatarId, type: "AVATAR", visibility: "GAME", png: character.avatarPng, width: character.avatarWidth, height: character.avatarHeight },
      ]) {
        const key = `${asset.visibility.toLowerCase()}/${asset.id}.png`;
        await tx.fileBlob.create({ data: { key, contentType: "image/png", data: new Uint8Array(asset.png) } });
        await tx.asset.create({ data: { id: asset.id, ownerId: claim.ownerId, type: asset.type, visibility: asset.visibility, mimeType: "image/png",
          storagePath: key, bytes: asset.png.length, width: asset.width, height: asset.height, provider: "openai",
          providerRequestId: known ? character.providerRequestId : null, costCents: asset.id === sheetId && known ? Math.round(character.costCents) : 0 } });
      }
      await tx.auditLog.create({ data: { id: newId("aud"), actorType: "SYSTEM", action: "sheet:painted", entityType: "Asset", entityId: sheetId,
        metaJson: JSON.stringify({ gameId: claim.gameId, costCents: known ? character.costCents : 0, costUnknown: !known,
          requestId: known ? character.providerRequestId : null, model: "gpt-image-2", usage: known ? character.usage : null,
          identityProvenance: deps.provenance ?? null }) } });
      await tx.childProfile.update({ where: { id: claim.childId }, data: { identityAssetId: sheetId, avatarAssetId: avatarId } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    if (!known) { await holdBoardWizardIdentity(c, claim, "unresolved-identity"); return false; }
    return true;
  } catch {
    // A response may have been billed even if transport or postprocessing failed.
    // Known settled evidence is never downgraded. No raw exception is persisted.
    try {
      const request = await budget.readRequest(scope(claim.gameId), requestKey);
      if (request?.state === "pending") await budget.markUnknown(scope(claim.gameId), requestKey, "Identity dispatch has no retained complete output; operator reconciliation required");
    } catch { /* Existing ledger is still the authoritative unresolved reservation. */ }
    await holdBoardWizardIdentity(c, claim, "unresolved-identity");
    return false;
  }
}

/** A fixed-engine transition is a reroute, NEVER permission for legacy cleanup.
 * Fixed deleters revalidate that engine under their own Game -> Job fence. */
export type IdentityDeletionResult = boolean | null | { rerouteFixedStyle: string };
/** Return null for legacy/nonidentity routes. Lock before reading the identity
 * IDs: a pre-call snapshot would miss an identity committed meanwhile. */
export async function deleteBoardWizardIdentityGame(c: Container, gameId: string, actor: Actor, userId?: string): Promise<IdentityDeletionResult> {
  if (env().APP_ENV !== "qa" || c.storage.id !== "db") return null;
  // Turning off generation must not switch an in-flight identity's deletion
  // back to the unfenced legacy path. The durable reservation pins its engine.
  if (!enabled() && !await c.db.worldBudgetLedger.findUnique({ where: { worldId: scope(gameId) }, select: { worldId: true } })) return null;
  return c.db.$transaction(async tx => {
    const game = await tx.game.findUnique({ where: { id: gameId } });
    if (game?.styleVersion.startsWith("fixed-sprite-")) return { rerouteFixedStyle: game.styleVersion };
    if (!game || game.packageTier !== "ONE_WORLD" ||
      !["PAID", "AVATAR_GENERATING", "GENERATION_FAILED", "MANUAL_REVIEW"].includes(game.status)) return null;
    // Already painted legacy games keep the existing full-target cleanup path.
    if (await tx.targetInstance.count({ where: { gameScene: { gameId }, OR: [{ spriteAssetId: { not: null } }, { variants: { some: {} } }] } })) return null;
    if (game.deletedAt || userId && userId !== game.ownerId) return false;
    if (actor.type === "ADMIN") {
      const administrator = await tx.user.findUnique({ where: { id: actor.id } });
      demand(administrator && (c.adminEmails ?? []).some(email => email.toLowerCase() === administrator.email.toLowerCase()));
    } else demand(actor.type === "USER" && actor.id === game.ownerId && userId === game.ownerId);
    const now = new Date();
    const changed = await tx.game.updateMany({ where: { id: gameId, updatedAt: game.updatedAt, deletedAt: null, styleVersion: game.styleVersion },
      data: { status: "DELETED", deletedAt: now, configJson: null, title: null, giftJson: null } });
    demand(changed.count === 1);
    await tx.generationJob.updateMany({ where: { gameId }, data: { status: "DONE", stepsJson: "{}", currentStep: null, lastError: null } });
    const child = game.childProfileId ? await tx.childProfile.findUnique({ where: { id: game.childProfileId } }) : null;
    if (child && await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0) {
      for (const id of [child.originalPhotoAssetId, child.identityAssetId, child.avatarAssetId].filter((id): id is string => !!id)) {
        const asset = await tx.asset.findUniqueOrThrow({ where: { id } }); demand(asset.ownerId === game.ownerId);
        const aliases = await tx.asset.findMany({ where: { storagePath: asset.storagePath }, select: { id: true } });
        const elsewhere = await tx.childProfile.count({ where: { NOT: { id: child.id }, OR: [
          { originalPhotoAssetId: { in: aliases.map(a => a.id) } }, { identityAssetId: { in: aliases.map(a => a.id) } }, { avatarAssetId: { in: aliases.map(a => a.id) } },
        ] } });
        if (aliases.length === 1 && !elsewhere) {
          await tx.fileBlob.deleteMany({ where: { key: asset.storagePath } });
          await tx.asset.update({ where: { id }, data: { status: "DELETED", deletedAt: now } });
        }
      }
      await tx.childProfile.update({ where: { id: child.id }, data: { originalPhotoAssetId: null, identityAssetId: null, avatarAssetId: null, photoCropJson: null, deletedAt: now } });
    }
    await tx.gameScene.updateMany({ where: { gameId }, data: { configJson: null } });
    await tx.shareLink.updateMany({ where: { gameId }, data: { active: false, revokedAt: now } });
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: actor.type, actorId: "id" in actor ? actor.id : null,
      action: "game:deleted-qa-identity", entityType: "Game", entityId: gameId } });
    return true; // Metadata-only identity budget survives deletion.
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

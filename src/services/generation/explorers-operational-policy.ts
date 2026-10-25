import type { Prisma } from "@prisma/client";
import { env } from "../../lib/env";
import { IDENTITY_SOURCE_RELEASE, identitySourceReleaseOf } from "./identity-source-release";
import { storedSearchLevel } from "../../domain/search-level";
import { detectivesOperationalQualified } from "../../domain/generation/detectives-operational-policy";
import { EXPLORERS_OPERATIONAL_RELEASE, explorersOperationalReceiptSchema, type ExplorersOperationalRelease, type ExplorersOperationalReceipt } from "../../domain/generation/explorers-operational-policy";
import { SINGLE_VISUAL_REVIEW_VERSION } from "../../domain/generation/single-visual-review";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sourcePlacementReleaseOf, sourcePlacementReleaseAuditId } from "./source-placement-release";
import { leanReleaseOf } from "./lean-release";
import { dualVisualReviewVersion } from "./visual-review-release";

type Reader = Pick<Prisma.TransactionClient, "auditLog">;
export const EXPLORERS_OPERATIONAL_ACTION = "generation:explorers-operational-policy/v1";
export const explorersOperationalId = (gameId: string) => "aud_explorers_operational_" + gameId;
function demand(ok: unknown, reason: string): asserts ok { if (!ok) throw Error("EXPLORERS_OPERATIONAL: " + reason); }
async function expected(db: Reader, gameId: string): Promise<ExplorersOperationalReceipt> {
  demand(await identitySourceReleaseOf(db, gameId) === IDENTITY_SOURCE_RELEASE, "The original full-source identity pin is required");
  const family = await sourcePlacementReleaseOf(db, gameId);
  const record = await db.auditLog.findUnique({ where: { id: sourcePlacementReleaseAuditId(gameId) } });
  demand(family?.baseSceneVersion === 12 && record, "The exact original Explorer source placement is required");
  const body = { version: EXPLORERS_OPERATIONAL_RELEASE, gameId, worldId: gameId + ":board-wizard",
    sourceFamilySha256: hash(record.metaJson), sourcePlacementManifestSha256: family.manifestSha256,
    reviewMode: SINGLE_VISUAL_REVIEW_VERSION, model: "gpt-6.1-sol", effort: "low", initialTier: "flex",
    oneUsableAssessmentPerImage: true, normalImageAttemptLimit: 3, worldCapMicroUsd: 4000000, automaticBudgetExtension: false };
  return explorersOperationalReceiptSchema.parse({ ...body, authorizationSha256: hash(body) });
}

/** Called inside normal draft creation, before photo, orders, jobs or reservations. */
export async function pinExplorersOperationalPolicy(tx: Prisma.TransactionClient, gameId: string, release: ExplorersOperationalRelease | undefined, storageId: string) {
  if (release === undefined) return;
  demand(release === EXPLORERS_OPERATIONAL_RELEASE && storageId === "db", "Unsupported release or storage");
  const e = env();
  demand(detectivesOperationalQualified({ appEnv: e.APP_ENV, promptRelease: e.LOCAL_PATCH_PROMPT_RELEASE,
    identitySource: e.LOCAL_PATCH_IDENTITY_SOURCE, reviewRelease: await dualVisualReviewVersion(tx, gameId) ?? undefined,
    leanRelease: await leanReleaseOf(tx, gameId) ?? undefined }), "Only the qualified QA configuration can select this release");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
  demand(game.status === "DRAFT" && game.styleVersion === "local-patch-world-v1" && storedSearchLevel(game.searchLevel) === "explorers"
    && !game.deletedAt && !game.paidAt && !game.readyAt && !game.configJson && !game.childProfile?.originalPhotoAssetId,
    "Only an unstarted Explorer draft before its photo may select this policy");
  demand(!await tx.order.findFirst({ where: { gameId } }) && !await tx.generationJob.findFirst({ where: { gameId } })
    && !await tx.targetVariantAsset.findFirst({ where: { targetInstance: { gameScene: { gameId } }, attempts: { gt: 0 } } })
    && !await tx.worldBudgetLedger.findUnique({ where: { worldId: gameId + ":board-wizard" } }), "Existing work cannot gain a new default");
  const pin = await expected(tx, gameId), old = await tx.auditLog.findUnique({ where: { id: explorersOperationalId(gameId) } });
  if (old) { demand(await explorersOperationalPolicyOf(tx, gameId), "Existing policy is invalid"); return; }
  await tx.auditLog.create({ data: { id: explorersOperationalId(gameId), actorType: "SYSTEM", action: EXPLORERS_OPERATIONAL_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(pin) } });
}

/** Corrupt or foreign pins refuse a fallback to two HIGH questions. Source purge preserves this receipt. */
export async function explorersOperationalPolicyOf(db: Reader, gameId: string): Promise<ExplorersOperationalReceipt | null> {
  const row = await db.auditLog.findUnique({ where: { id: explorersOperationalId(gameId) } });
  if (!row) return null;
  const pin = explorersOperationalReceiptSchema.parse(JSON.parse(row.metaJson ?? "null"));
  demand(row.actorType === "SYSTEM" && row.actorId === null && row.action === EXPLORERS_OPERATIONAL_ACTION
    && row.entityType === "Game" && row.entityId === gameId && row.metaJson === JSON.stringify(pin)
    && JSON.stringify(pin) === JSON.stringify(await expected(db, gameId)), "Invalid or foreign from-birth policy");
  return pin;
}

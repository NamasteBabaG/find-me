import type { Prisma } from "@prisma/client";
import { env } from "../../lib/env";

/** Prospective source contract. Never inferred from a flag for an existing paid identity. */
export const IDENTITY_SOURCE_RELEASE = "full-source-identity/v1" as const;
export const IDENTITY_SOURCE_ACTION = "generation:identity-source-release";
export const identitySourceAuditId = (gameId: string) => `aud_identity_source_${gameId}`;
export const identitySourceReceipt = (gameId: string) => ({ version: IDENTITY_SOURCE_RELEASE, gameId,
  styleVersion: "board-matched-identity/v6", promptVersion: "character-v8-full-source-volume-identity",
  reviewVersion: "board-wizard-identity-source-sol-high/v5", source: "selection-and-full-photo",
  mandatoryChecks: ["identity", "age", "paintedStyle", "sheetLayout", "sourceFaceVisible", "facialVolume", "viewConsistency"] });

/** Called inside fresh-draft creation, never by an identity retry or an operator release. */
export async function pinIdentitySourceRelease(tx: Prisma.TransactionClient, gameId: string) {
  if (env().LOCAL_PATCH_IDENTITY_SOURCE !== "full-source-v1") return;
  if (env().APP_ENV !== "qa") throw Error("Full-source identity enrollment is QA only");
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== "DRAFT" || game.styleVersion !== "local-patch-world-v1" || game.deletedAt || game.readyAt || game.configJson || game.paidAt
    || await tx.order.findFirst({ where: { gameId } }) || await tx.generationJob.findFirst({ where: { gameId } }))
    throw Error("Only an unstarted local-patch draft may receive the full-source identity contract");
  await tx.auditLog.create({ data: { id: identitySourceAuditId(gameId), actorType: "SYSTEM", action: IDENTITY_SOURCE_ACTION,
    entityType: "Game", entityId: gameId, metaJson: JSON.stringify(identitySourceReceipt(gameId)) } });
}

export async function identitySourceReleaseOf(db: Pick<Prisma.TransactionClient, "auditLog">, gameId: string): Promise<typeof IDENTITY_SOURCE_RELEASE | null> {
  const row = await db.auditLog.findUnique({ where: { id: identitySourceAuditId(gameId) } });
  if (!row) return null;
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== IDENTITY_SOURCE_ACTION || row.entityType !== "Game"
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(identitySourceReceipt(gameId)))
    throw Error("Pinned identity source release is invalid; refusing a fallback");
  return IDENTITY_SOURCE_RELEASE;
}

import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from "../../domain/generation/single-visual-review";
import type { Container } from "../container";
import { boardWizardBudgetOf } from "./board-conditioned-wizard";
import { singleLowReviewAuthorization } from "./single-low-policy";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";

const VERSION = "single-medium-policy/v1" as const, ACTION = "generation:single-medium-policy";
const keyOf = (gameId: string) => "aud_single_medium_" + gameId;
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({ version: z.literal(VERSION), gameId: z.string(), worldId: z.string(), sceneVersion: z.union([z.literal(12),z.literal(13)]),
  priorAuthorizationSha256: hex, identitySha256: hex, reviewMode: z.literal(SINGLE_MEDIUM_VISUAL_REVIEW_VERSION),
  model: z.literal("gpt-6.1-sol"), effort: z.literal("medium"), initialTier: z.literal("flex"),
  oneUsableAssessmentPerImage: z.literal(true), worldCapMicroUsd: z.literal(4000000), automaticBudgetExtension: z.literal(false), authorizationSha256: hex }).strict();
type Reader = Pick<Prisma.TransactionClient, "auditLog">;
async function expected(db: Reader, gameId: string) {
  const prior = await singleLowReviewAuthorization(db, gameId);
  if (prior?.kind !== "from-birth") throw Error("SINGLE_MEDIUM: exact from-birth four-dollar authority required");
  const body = { version: VERSION, gameId, worldId: gameId + ":board-wizard", sceneVersion: prior.sceneVersion,
    priorAuthorizationSha256: prior.authorizationSha256, identitySha256: prior.identitySha256,
    reviewMode: SINGLE_MEDIUM_VISUAL_REVIEW_VERSION, model: "gpt-6.1-sol", effort: "medium", initialTier: "flex",
    oneUsableAssessmentPerImage: true, worldCapMicroUsd: 4000000, automaticBudgetExtension: false };
  return schema.parse({ ...body, authorizationSha256: hash(body) });
}
/** Original LOW birth receipts are immutable. The new on-demand SYSTEM pin
 * records a prospective review policy; it grants no image, retry or money. */
export async function singleMediumReviewPolicyOf(db: Reader, gameId: string) {
  const row = await db.auditLog.findUnique({ where: { id: keyOf(gameId) } });
  if (!row) return null;
  const receipt = await expected(db, gameId);
  if (row.actorType !== "SYSTEM" || row.actorId !== null || row.action !== ACTION || row.entityType !== "Game"
    || row.entityId !== gameId || row.metaJson !== JSON.stringify(receipt)) throw Error("SINGLE_MEDIUM: invalid or changed policy pin");
  return receipt;
}
export async function ensureSingleMediumReviewPolicy(c: Container, gameId: string,
  fence: (tx: Prisma.TransactionClient) => Promise<void>) {
  if (await singleMediumReviewPolicyOf(c.db, gameId)) return;
  const budget = await boardWizardBudgetOf(c).audit(gameId + ":board-wizard");
  if (budget.capMicroUsd !== 4000000 || budget.overCapMicroUsd || budget.conflictRequestKeys.length || budget.overrunRequestKeys.length)
    throw Error("SINGLE_MEDIUM: original four-dollar ledger must remain intact");
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId); await fence(tx);
    const receipt = await expected(tx, gameId);
    await tx.auditLog.upsert({ where: { id: keyOf(gameId) }, update: {}, create: { id: keyOf(gameId), actorType: "SYSTEM",
      action: ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(receipt) } });
    await singleMediumReviewPolicyOf(tx, gameId);
  });
}

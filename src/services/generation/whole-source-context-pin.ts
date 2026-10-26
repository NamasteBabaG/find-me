import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../../lib/env";
import { SOURCE_PLACEMENT_RELEASE } from "../../../content/adventures/source-placement-release";
import { assertWholeSourceContextPlan, type WholeSourceContextPlan } from "../../domain/scene/whole-source-context";
import { WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION, wholeSourceContextMarker, wholeSourceContextMarkerSchema } from "../../domain/generation/whole-source-context-purchase";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { explorersOperationalPolicyOf } from "./explorers-operational-policy";
import { sourcePlacementReleaseAuditId } from "./source-placement-release";

export const WHOLE_SOURCE_CONTEXT_ACTION = "generation:whole-source-context-purchase/v1";
export const WHOLE_SOURCE_CONTEXT_WAKE_ACTION = "generation:whole-source-context-wake/v1";
export const wholeSourceContextPinId = (gameId: string) => "aud_whole_context_" + hash(gameId);
export const wholeSourceContextWakeId = (gameId: string) => "aud_whole_context_wake_" + hash(gameId);
export const WHOLE_SOURCE_CONTEXT_IMAGE_RESERVE = 150000;
/** Conservative admission room. The real MAIN bound remains independently calculated and reserved in full. */
export const WHOLE_SOURCE_CONTEXT_REQUIRED_HEADROOM = 550000;
const digest = z.string().regex(/^[a-f0-9]{64}$/), id = z.string().regex(/^[A-Za-z0-9_:-]{1,240}$/);
const selectedSchema = z.object({ rowId: id, sceneId: id, targetInstanceId: id, hideId: id, boardId: id, targetId: id,
  originalInstanceSha256: digest, originalRowSha256: digest, originalInvariantSha256: digest, previousJudgeJson: z.string().min(1).max(1000000),
  previousLastError: z.string().nullable(), originalAttempts: z.literal(3), authorizedAttempt: z.literal(4), requestKey: id,
  plan: z.custom<WholeSourceContextPlan>(), paid: z.array(z.object({ requestKey: id, fingerprint: digest, payloadSha256: digest,
    evidenceSha256: digest }).strict()).length(3) }).strict();
export const wholeSourceContextPinBodySchema = z.object({ version: z.literal(WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION),
  gameId: id, worldId: id, ownerId: id, operatorId: id, birthAuthorizationSha256: digest, familyRecordSha256: digest,
  childId: id, childSha256: digest, ordersSha256: digest, identityAssetId: id, identitySha256: digest,
  photoAssetId: id, photoSha256: digest, avatarAssetId: id, avatarSha256: digest, ageYears: z.number().int().min(1).max(18),
  capMicroUsd: z.literal(4000000), automaticBudgetExtension: z.literal(false), approvalGranted: z.literal(false),
  jobId: id, jobHoldSha256: digest, ledgerRevision: z.number().int().nonnegative(), ledgerSha256: digest,
  continuationApprovalsSha256: digest,
  originalRequests: z.array(z.object({ requestKey: id, sha256: digest }).strict()).min(1).max(300),
  selected: selectedSchema, protectedRows: z.array(z.object({ rowId: id, rowSha256: digest, instanceId: id, instanceSha256: digest,
    assetId: id, assetSha256: digest, imageSha256: digest, geometrySha256: digest }).strict()).length(26),
}).strict();
export const wholeSourceContextPinSchema = wholeSourceContextPinBodySchema.extend({ createdAt: z.string().datetime(), authorizationSha256: digest }).strict();
export type WholeSourceContextPin = z.infer<typeof wholeSourceContextPinSchema>;
type Reader = Pick<Prisma.TransactionClient, "auditLog">;
export const frozenWholeSourceContextHash = (value: unknown) => hash(JSON.parse(JSON.stringify(value)));
export const wholeSourceContextRowHash = (row: object) => frozenWholeSourceContextHash(Object.fromEntries(Object.entries(row).filter(([key]) => key !== "targetInstance")));
export const wholeSourceContextRowInvariant = (row: object) => frozenWholeSourceContextHash(Object.fromEntries(Object.entries(row).filter(([key]) =>
  !["targetInstance", "status", "attempts", "lastError", "updatedAt", "judgeJson"].includes(key))));
export const wholeSourceContextJobHash = (job: { id: string; status: string; attempts: number; currentStep: string | null; lastError: string | null; updatedAt: Date }) =>
  frozenWholeSourceContextHash([job.id, job.status, job.attempts, job.currentStep, job.lastError, job.updatedAt]);
export function wholeSourceContextMarkerFor(pin: WholeSourceContextPin) {
  return wholeSourceContextMarkerSchema.parse({ version: WHOLE_SOURCE_CONTEXT_PURCHASE_VERSION, authorizationSha256: pin.authorizationSha256,
    rowId: pin.selected.rowId, originalRowSha256: pin.selected.originalRowSha256, originalAttempts: 3, authorizedAttempt: 4,
    planSha256: pin.selected.plan.sha256 });
}
export function wholeSourceContextCandidate(pin: WholeSourceContextPin, row: { id: string; status: string; attempts: number; judgeJson: string | null }) {
  if (row.id !== pin.selected.rowId) return false;
  if (row.status === "FAILED" && row.attempts === 3) return wholeSourceContextRowHash(row) === pin.selected.originalRowSha256;
  return row.status === "PENDING" && row.attempts === 4 && wholeSourceContextRowInvariant(row) === pin.selected.originalInvariantSha256
    && hash(wholeSourceContextMarker(row)) === hash(wholeSourceContextMarkerFor(pin));
}
/** An immutable owner ADMIN exception, separate from all consumed old grants and default retry limits. */
export async function readWholeSourceContextPin(db: Reader, gameId: string): Promise<WholeSourceContextPin | null> {
  if (env().APP_ENV !== "qa") return null;
  const row = await db.auditLog.findUnique({ where: { id: wholeSourceContextPinId(gameId) } }); if (!row) return null;
  const pin = wholeSourceContextPinSchema.parse(JSON.parse(row.metaJson ?? "null")), { authorizationSha256, ...body } = pin;
  const fail = () => { throw Error("WHOLE_SOURCE_CONTEXT: immutable finite owner authority changed"); };
  if (row.actorType !== "ADMIN" || row.actorId !== pin.operatorId || pin.operatorId !== pin.ownerId || row.action !== WHOLE_SOURCE_CONTEXT_ACTION
    || row.entityType !== "Game" || row.entityId !== gameId || pin.gameId !== gameId || pin.worldId !== gameId + ":board-wizard"
    || row.metaJson !== JSON.stringify(pin) || hash(body) !== authorizationSha256) return fail();
  const birth = await explorersOperationalPolicyOf(db, gameId), family = await db.auditLog.findUnique({ where: { id: sourcePlacementReleaseAuditId(gameId) } });
  const s = pin.selected, entry = SOURCE_PLACEMENT_RELEASE.inventory.find(e => e.hideId === s.hideId && e.boardId === s.boardId);
  if (!birth || birth.authorizationSha256 !== pin.birthAuthorizationSha256 || !family || hash(family.metaJson) !== pin.familyRecordSha256
    || !entry?.sourceNeighbors || s.requestKey !== s.hideId + ":peeking:render:4" || s.hideId !== "greatwall-v12-2" || s.boardId !== "greatwall"
    || new Set(pin.protectedRows.map(r => r.rowId)).size !== 26 || pin.protectedRows.some(r => r.rowId === s.rowId)
    || new Set(pin.originalRequests.map(r => r.requestKey)).size !== pin.originalRequests.length
    || s.paid.some((r, i) => r.requestKey !== s.hideId + ":peeking:render:" + (i + 1))) return fail();
  assertWholeSourceContextPlan(s.plan, entry.sourceNeighbors.contract, entry.effective.child);
  return pin;
}
export async function wholeSourceContextPublicationAuthorized(db: Reader, input: { gameId: string; variantId: string; hideId: string; attempts: number; sceneVersion: number; judgeJson: string | null }) {
  try {
    const marker = wholeSourceContextMarker({ judgeJson: input.judgeJson });
    if (!marker || input.sceneVersion !== 12 || input.attempts !== 4) return false;
    const pin = await readWholeSourceContextPin(db, input.gameId), wake = await db.auditLog.findUnique({ where: { id: wholeSourceContextWakeId(input.gameId) } });
    if (!pin || input.variantId !== pin.selected.rowId || input.hideId !== pin.selected.hideId || hash(marker) !== hash(wholeSourceContextMarkerFor(pin))) return false;
    const proof = JSON.parse(wake?.metaJson ?? "null");
    return !!wake && wake.actorType === "SYSTEM" && wake.actorId === null && wake.action === WHOLE_SOURCE_CONTEXT_WAKE_ACTION
      && wake.entityType === "Game" && wake.entityId === input.gameId && proof.authorizationSha256 === pin.authorizationSha256
      && proof.previousHoldSha256 === pin.jobHoldSha256 && proof.providerCalls === 0;
  } catch { return false; }
}
export async function fenceWholeSourceContextPurchase(db: Pick<Prisma.TransactionClient, "auditLog" | "targetVariantAsset">,
  gameId: string, rowId: string, marker: unknown): Promise<void> {
  const pin = await readWholeSourceContextPin(db, gameId), row = await db.targetVariantAsset.findUnique({ where: { id: rowId }, include: { targetInstance: true } });
  if (!pin || !row || !wholeSourceContextCandidate(pin, row) || frozenWholeSourceContextHash(row.targetInstance) !== pin.selected.originalInstanceSha256 || hash(marker) !== hash(wholeSourceContextMarkerFor(pin)))
    throw Error("WHOLE_SOURCE_CONTEXT: finite purchase checkpoint changed");
  const protectedRows = await db.targetVariantAsset.findMany({ where: { id: { in: pin.protectedRows.map(p => p.rowId) }, targetInstance: { gameScene: { gameId } } }, include: { targetInstance: true } });
  if (protectedRows.length !== 26 || pin.protectedRows.some(p => !protectedRows.some(row => row.id === p.rowId && wholeSourceContextRowHash(row) === p.rowSha256 && row.targetInstanceId === p.instanceId
    && frozenWholeSourceContextHash(row.targetInstance) === p.instanceSha256)))
    throw Error("WHOLE_SOURCE_CONTEXT: an unchanged appearance changed");
}

import { z } from "zod";
import type { WorldBudget, WorldBudgetRequest, WorldUnknownContinuationApproval } from "./world-budget";
import type { Prisma } from "@prisma/client";
import { boardConditioningHash } from "./board-conditioned-source";
import { identityProvenanceSchema } from "./board-wizard-identity-gate";

export const IDENTITY_SOURCE_REVISION = "paid-identity-source-revision/v1" as const;
export const IDENTITY_REVISION_START_ACTION = "generation:identity-source-revision-start";
export const IDENTITY_REVISION_COMMIT_ACTION = "generation:identity-source-revision-commit";
export const identityRevisionStartId = (gameId: string) => `aud_identity_revision_start_${gameId}`;
export const identityRevisionCommitId = (gameId: string) => `aud_identity_revision_commit_${gameId}`;
export const identityRevisionCandidateId = (gameId: string, attempt: number) => `aud_identity_revision_candidate_${gameId}_${attempt}`;
const id = z.string().regex(/^[A-Za-z0-9_:.@/-]{1,200}$/).refine(s => !s.includes("://") && !/^sk-/i.test(s));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const identityRevisionStartSchema = z.object({ version: z.literal(IDENTITY_SOURCE_REVISION), gameId: id, ownerId: id, childId: id,
  oldIdentityAssetId: id, oldIdentitySha256: hash, oldAvatarAssetId: id, photoAssetId: id, photoSha256: hash, ageYears: z.number().int().min(2).max(10),
  cropSha256: hash, originalEnrollmentSha256: hash, jobId: id, jobHoldSha256: hash, planSha256: hash, recoveryPlanSha256: hash,
  firstAttempt: z.number().int().min(2).max(17), operatorId: id, authorizedAt: z.string().datetime(),
  provenance: identityProvenanceSchema.refine(p => p.style.version === "board-matched-identity/v6"),
}).strict();
export type IdentityRevisionStart = z.infer<typeof identityRevisionStartSchema>;
export const identityRevisionCandidateSchema = z.object({ version: z.literal(IDENTITY_SOURCE_REVISION), gameId: id, startSha256: hash,
  attempt: z.number().int().min(2).max(19), identityAssetId: id, avatarAssetId: id, sheetSha256: hash }).strict();
export const identityRevisionCommitSchema = z.object({ version: z.literal(IDENTITY_SOURCE_REVISION), gameId: id, startSha256: hash,
  originalEnrollmentSha256: hash, oldIdentityAssetId: id, oldIdentitySha256: hash, newIdentityAssetId: id, newIdentitySha256: hash, newAvatarAssetId: id,
  reviewFingerprint: hash, operatorId: id, committedAt: z.string().datetime() }).strict();
export type IdentityRevisionCommit = z.infer<typeof identityRevisionCommitSchema>;

type Db = Pick<Prisma.TransactionClient, "auditLog">;
async function readRecord<T>(db: Db, gameId: string, key: string, action: string, schema: z.ZodType<T>): Promise<T | null> {
  const row = await db.auditLog.findUnique({ where: { id: key } });
  if (!row) return null;
  const value = schema.parse(JSON.parse(row.metaJson ?? "null")) as T & { operatorId: string; gameId: string };
  if (row.actorType !== "ADMIN" || row.actorId !== value.operatorId || row.entityType !== "Game" || row.entityId !== gameId || value.gameId !== gameId
    || row.action !== action || row.metaJson !== JSON.stringify(value)) throw Error("IDENTITY_REVISION: invalid immutable record");
  return value;
}
export const identityRevisionStartOf = (db: Db, gameId: string) => readRecord(db, gameId, identityRevisionStartId(gameId), IDENTITY_REVISION_START_ACTION, identityRevisionStartSchema);
export const identityRevisionCommitOf = (db: Db, gameId: string) => readRecord(db, gameId, identityRevisionCommitId(gameId), IDENTITY_REVISION_COMMIT_ACTION, identityRevisionCommitSchema);
export async function identityRevisionStateOf(db: Db, gameId: string) {
  const start = await identityRevisionStartOf(db, gameId);
  const commit = await identityRevisionCommitOf(db, gameId);
  if (commit && (!start || commit.startSha256 !== boardConditioningHash(start) || commit.operatorId !== start.operatorId
    || commit.oldIdentityAssetId !== start.oldIdentityAssetId || commit.oldIdentitySha256 !== start.oldIdentitySha256
    || commit.originalEnrollmentSha256 !== start.originalEnrollmentSha256)) throw Error("IDENTITY_REVISION: commit differs from its authorized source");
  return { start, commit };
}
export async function identityRevisionPending(db: Db, gameId: string): Promise<boolean> {
  const { start, commit } = await identityRevisionStateOf(db, gameId);
  return !!start && !commit;
}


export const IDENTITY_REVISION_HELD_ACTION = "generation:identity-source-revision-held";
export const IDENTITY_REVISION_RETRY_ACTION = "generation:identity-source-revision-retry";
export const identityRevisionRetryId = (heldId: string) => `${heldId}_retry`;
/** An immutable service retry supersedes only the exact held diagnosis; no history is removed. */
export async function identityRevisionHeldOf(db: Db, gameId: string) {
  const held = await db.auditLog.findFirst({ where: { action: IDENTITY_REVISION_HELD_ACTION, entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" } });
  if (!held) return null;
  const retry = await db.auditLog.findUnique({ where: { id: identityRevisionRetryId(held.id) } });
  if (!retry) return held;
  const value = z.object({ version: z.literal("identity-source-revision-retry/v1"), gameId: id, heldId: id, heldSha256: hash, operatorId: id }).strict().parse(JSON.parse(retry.metaJson ?? "null"));
  if (retry.actorType !== "ADMIN" || retry.actorId !== value.operatorId || retry.action !== IDENTITY_REVISION_RETRY_ACTION || retry.entityType !== "Game" || retry.entityId !== gameId
    || value.gameId !== gameId || value.heldId !== held.id || value.heldSha256 !== boardConditioningHash([held.id, held.metaJson]) || retry.metaJson !== JSON.stringify(value))
    throw Error("IDENTITY_REVISION: invalid held-operation retry");
  return null;
}


export async function identityRevisionDeferralsOf(db: Db, gameId: string): Promise<number> {
  const ends = await db.auditLog.findMany({ where: { action: "generation:identity-source-revision-run-end", entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" }, take: 5 });
  let count = 0;
  for (const row of ends) { if (JSON.parse(row.metaJson ?? "{}").state !== "deferred") break; count++; }
  return count;
}
export function identityRevisionDiagnosticCode(metaJson: string | null): string {
  let code: unknown; try { code = JSON.parse(metaJson ?? "null")?.code; } catch { return "service-check"; }
  return typeof code === "string" && ["source-contract", "image-unresolved", "candidates-exhausted", "cap_exceeded", "world_held", "key_conflict", "evidence_conflict", "reference-revision-safe-stop"].includes(code) ? code : "service-check";
}


export async function identityRevisionPausedOf(db: Db, gameId: string): Promise<boolean> {
  const end = await db.auditLog.findFirst({ where: { action: "generation:identity-source-revision-run-end", entityType: "Game", entityId: gameId }, orderBy: { createdAt: "desc" } });
  return !!end && JSON.parse(end.metaJson ?? "{}").state === "paused";
}


/** Explicit source-start authority, NOT supplier usage. Shared by grant creation and publication validation. */
export function identityRevisionContinuationGrant(start: IdentityRevisionStart, attempt: number, kind: "image" | "review" | "rejudge", request: WorldBudgetRequest) {
  return { approvalId: `source-reference:${boardConditioningHash(start)}:${attempt}:${kind}`, requestKey: request.requestKey, scope: request.scope,
    operationFingerprint: request.operationFingerprint, reserveMicroUsd: request.reserveMicroUsd, unknownReasons: request.unknownReasons,
    operatorId: start.operatorId, authorizationSha256: boardConditioningHash({ version: "paid-reference-attempt-continuation/v1", startSha256: boardConditioningHash(start), attempt,
      kind, requestKey: request.requestKey, operationFingerprint: request.operationFingerprint, unknownReasons: request.unknownReasons }), authorizedAt: start.authorizedAt };
}

/** A narrowly bound exception for an automatically approved replacement. Every other operator grant remains non-publishable. */
export async function identityRevisionContinuationPublishable(db: Db, budget: Pick<WorldBudget, "readRequest">, gameId: string, approval: WorldUnknownContinuationApproval): Promise<boolean> {
  const { start, commit } = await identityRevisionStateOf(db, gameId);
  if (!start || !commit || approval.version !== "world-unknown-continuation/v1" || approval.worldId !== `${gameId}:board-wizard`) return false;
  const { subjectUpgradeOf } = await import("./subject-enrollment");
  const active = await subjectUpgradeOf(db, gameId); // Validates the immutable commit and its seven-check HIGH review.
  if (!active?.identityRevision || active.identityAssetId !== commit.newIdentityAssetId || active.identitySha256 !== commit.newIdentitySha256) return false;
  for (let n = start.firstAttempt; n < start.firstAttempt + 3; n++) for (const kind of ["image", "review", "rejudge"] as const) {
    if (approval.approvalId !== `source-reference:${boardConditioningHash(start)}:${n}:${kind}`) continue;
    const key = identityRevisionCandidateId(gameId, n), row = await db.auditLog.findUnique({ where: { id: key } });
    const candidate = row ? identityRevisionCandidateSchema.parse(JSON.parse(row.metaJson ?? "null")) : null;
    if (kind === "image" && candidate || kind !== "image" && (!candidate || candidate.identityAssetId === commit.newIdentityAssetId)) return false;
    if (candidate && (row?.actorType !== "SYSTEM" || row.actorId !== null || row.action !== "generation:identity-source-revision-candidate"
      || row.entityType !== "Game" || row.entityId !== gameId || row.metaJson !== JSON.stringify(candidate) || candidate.startSha256 !== boardConditioningHash(start)
      || candidate.gameId !== gameId || candidate.attempt !== n)) return false;
    const requestKey = kind === "image" ? "wizard:identity:" + n : kind === "rejudge"
      ? "wizard:identity-style-rejudge:1:" + candidate!.identityAssetId : "wizard:identity-style:1:" + candidate!.identityAssetId;
    const request = await budget.readRequest(approval.worldId, requestKey);
    if (!request || request.state !== "unknown" || request.conflicts.length || request.scope !== (kind === "image" ? "identity" : "judge")
      || request.reserveMicroUsd !== (kind === "image" ? 500_000 : 400_000)) return false;
    const intent = await db.auditLog.findUnique({ where: { id: key + (kind === "image" ? "_dispatch" : kind === "rejudge" ? "_rejudge_intent" : "_review_intent") } });
    let rejudge;
    if (kind === "rejudge") {
      const originalRow = await db.auditLog.findFirst({ where: { action: "board-wizard:identity-style-reviewed", entityType: "Asset", entityId: candidate!.identityAssetId }, orderBy: { createdAt: "desc" } });
      if (!originalRow?.metaJson) return false;
      const { identityGateReceiptSchema } = await import("./board-wizard-identity-gate");
      const { identitySourceRejudgeBinding } = await import("./identity-source-rejudge-binding");
      try { rejudge = await identitySourceRejudgeBinding(db, { gameId, attempt: n,
        original: identityGateReceiptSchema.parse(JSON.parse(originalRow.metaJson)), originalMetaJson: originalRow.metaJson }); } catch { return false; }
    }
    const expected = { version: IDENTITY_SOURCE_REVISION, startSha256: boardConditioningHash(start), attempt: n, requestKey, operationFingerprint: request.operationFingerprint,
      ...(candidate ? { identityAssetId: candidate.identityAssetId, sheetSha256: candidate.sheetSha256 } : {}), ...(rejudge ? { rejudge } : {}) };
    if (!intent || intent.actorType !== "SYSTEM" || intent.actorId !== null || intent.entityType !== "Game" || intent.entityId !== gameId
      || intent.action !== (kind === "image" ? "generation:identity-source-dispatch-intent" : kind === "rejudge" ? "generation:identity-source-rejudge-intent" : "generation:identity-source-review-intent")
      || intent.metaJson !== JSON.stringify(expected)) return false;
    const wanted = { ...identityRevisionContinuationGrant(start, n, kind, request), version: "world-unknown-continuation/v1", worldId: approval.worldId };
    return JSON.stringify(approval) === JSON.stringify(wanted);
  }
  return false;
}

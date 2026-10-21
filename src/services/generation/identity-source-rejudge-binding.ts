import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { boardConditioningHash as hash } from "./board-conditioned-source";
import { sha256Bytes } from "./fixed-sprite";
import type { IdentityGateReceipt } from "./board-wizard-identity-gate";

export const IDENTITY_SOURCE_REJUDGE_VERSION = "board-wizard-identity-source-sol-high-rejudge/v1" as const;
export const IDENTITY_SOURCE_REJUDGE_ACTION = "board-wizard:identity-style-rejudged";
export const identitySourceRejudgeId = (assetId: string) => `aud_identity_rejudge_${assetId}`;
export const identitySourceRejudgeKey = (assetId: string) => `wizard:identity-style-rejudge:1:${assetId}`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const identitySourceRejudgeBindingSchema = z.object({
  version: z.literal("identity-source-rejudge-binding/v1"), gameId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
  attempt: z.number().int().min(2).max(19), startSha256: digest, originalReceiptSha256: digest,
  originalFingerprint: digest, originalRequestKey: z.string().min(1).max(240),
  originalProviderRequestId: z.string().regex(/^req[-_][A-Za-z0-9_-]{1,160}$/),
  originalUsageSha256: digest, originalCostMicroUsd: z.number().int().positive(),
}).strict();
export type IdentitySourceRejudgeBinding = z.infer<typeof identitySourceRejudgeBindingSchema>;
type Db = Pick<Prisma.TransactionClient, "auditLog">;
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw Error(`IDENTITY_REJUDGE: ${message}`); }

/** A new question about retained pixels, never an interpretation or replacement of the original receipt. */
export async function identitySourceRejudgeBinding(db: Db, input: {
  gameId: string; attempt: number; original: IdentityGateReceipt; originalMetaJson: string;
}): Promise<IdentitySourceRejudgeBinding> {
  const { IDENTITY_SOURCE_REVISION, identityRevisionStartOf, identityRevisionCandidateId, identityRevisionCandidateSchema } = await import("./identity-source-revision-state");
  const { original } = input;
  demand(original.version === "board-wizard-identity-source-sol-high/v5" && original.provenance.style.version === "board-matched-identity/v6"
    && original.checks === null && !original.approved && !original.comparison && !original.automaticSelection && !original.rejudge
    && original.requestId && original.usage && original.costMicroUsd > 0, "only a paid unresolved full-source original may be rejudged");
  const start = await identityRevisionStartOf(db, input.gameId);
  demand(start && input.attempt >= start.firstAttempt && input.attempt < start.firstAttempt + 3, "candidate outside the authorized source revision");
  demand(hash({ ...original.provenance, repair: undefined }) === hash({ ...start.provenance, repair: undefined }), "source contract changed");
  const key = identityRevisionCandidateId(input.gameId, input.attempt);
  const row = await db.auditLog.findUnique({ where: { id: key } });
  const candidate = row ? identityRevisionCandidateSchema.parse(JSON.parse(row.metaJson ?? "null")) : null;
  demand(candidate && row?.actorType === "SYSTEM" && row.actorId === null && row.entityType === "Game" && row.entityId === input.gameId
    && row.action === "generation:identity-source-revision-candidate" && row.metaJson === JSON.stringify(candidate)
    && candidate.startSha256 === hash(start) && candidate.gameId === input.gameId && candidate.attempt === input.attempt
    && candidate.identityAssetId === original.identityAssetId && candidate.sheetSha256 === original.sheetSha256, "candidate differs from retained paid pixels");
  const originalRequestKey = `wizard:identity-style:1:${candidate.identityAssetId}`;
  const intent = await db.auditLog.findUnique({ where: { id: `${key}_review_intent` } });
  const expected = { version: IDENTITY_SOURCE_REVISION, startSha256: hash(start), attempt: input.attempt,
    requestKey: originalRequestKey, operationFingerprint: original.fingerprint, identityAssetId: original.identityAssetId, sheetSha256: original.sheetSha256 };
  demand(intent?.actorType === "SYSTEM" && intent.actorId === null && intent.entityType === "Game" && intent.entityId === input.gameId
    && intent.action === "generation:identity-source-review-intent" && intent.metaJson === JSON.stringify(expected), "original review intent differs");
  return identitySourceRejudgeBindingSchema.parse({ version: "identity-source-rejudge-binding/v1", gameId: input.gameId,
    attempt: input.attempt, startSha256: hash(start), originalReceiptSha256: sha256Bytes(Buffer.from(input.originalMetaJson)),
    originalFingerprint: original.fingerprint, originalRequestKey, originalProviderRequestId: original.requestId,
    originalUsageSha256: hash(original.usage), originalCostMicroUsd: original.costMicroUsd });
}

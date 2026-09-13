import { createHash } from "node:crypto";
import type { Prisma, TargetVariantAsset } from "@prisma/client";
import type { Container } from "../container";
import { isLocalPatchAdvisoryVersion, isLocalPatchStrictVersion, localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { isTheModelWeAsked, localPatchQualityDisposition, parseLocalPatchBoardVerdicts } from "./local-patch-judge";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { sameChargeEvidence } from "./world-budget";
import type { PaidRepairBatch } from "./local-patch-paid-repair";

export const LOCAL_PATCH_PUBLICATION_POLICY = "publish-with-visual-warnings/v1";
export const LOCAL_PATCH_STRICT_PUBLICATION_POLICY = "publish-with-severe-quality-guard/v2";
export const LOCAL_PATCH_PUBLICATION_ACTION = "local-patch:published-by-policy";
export const LOCAL_PATCH_PAID_REPAIR_PUBLICATION_POLICY = "publish-paid-join-after-canonical-sol-review/v1";
const REPAIR_COMPOSITION = "paid-mask-join/v1", REPAIR_REVIEW = "paid-repair-canonical-face-sol-low/v1";
const equalJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export const localPatchPublicationGeometryHash = (row: { rectJson: string | null; hitRectJson: string | null; headAnchorJson: string | null }) =>
  digest(JSON.stringify([row.rectJson, row.hitRectJson, row.headAnchorJson]));
/** A fresh review may change its receipt and update timestamp, but none of the
 * existing image, geometry, attempt, charge, inventory, or lifecycle fields. */
export const localPatchRepairSiblingInvariantHash = (row: TargetVariantAsset) =>
  digest(JSON.stringify(Object.fromEntries(Object.entries(row)
    .filter(([key]) => key !== "judgeJson" && key !== "updatedAt")
    .sort(([a], [b]) => a.localeCompare(b)))));
export type LocalPatchPublicationBinding = {
  gameId: string; sceneVersion: number; hideId: string; variantId: string; attempts: number;
  identityAssetId: string; identitySha256: string; assetId: string; imageSha256: string;
  geometrySha256: string; judgeJson: string | null;
};
const idOf = (input: LocalPatchPublicationBinding) => `aud_lpp_${digest(JSON.stringify([input.gameId, input.variantId, input.attempts, input.imageSha256,
  ...(isLocalPatchStrictVersion(input.sceneVersion) ? [digest(input.judgeJson ?? "")] : [])])).slice(0, 32)}`;
const recordOf = (input: LocalPatchPublicationBinding) => ({
  policy: isRepair(input) ? LOCAL_PATCH_PAID_REPAIR_PUBLICATION_POLICY
    : isLocalPatchStrictVersion(input.sceneVersion) ? LOCAL_PATCH_STRICT_PUBLICATION_POLICY : LOCAL_PATCH_PUBLICATION_POLICY,
  decision: "allowed-by-policy", gameId: input.gameId,
  sceneVersion: input.sceneVersion, hideId: input.hideId, variantId: input.variantId, attempts: input.attempts,
  identityAssetId: input.identityAssetId, identitySha256: input.identitySha256,
  assetId: input.assetId, imageSha256: input.imageSha256, geometrySha256: input.geometrySha256,
  judgeSha256: digest(input.judgeJson ?? ""),
});

function isRepair(input: LocalPatchPublicationBinding): boolean {
  try {
    const receipt = JSON.parse(input.judgeJson ?? "null");
    return receipt?.compositionVersion === REPAIR_COMPOSITION || !!receipt?.paidRepair;
  } catch { return false; }
}

/** A separate machine decision, never an operator visual approval. Verify the
 * committed batch, both full paid replies, and this exact candidate on EVERY
 * read; an old policy row alone cannot outlive its repair evidence. No writes. */
async function allowedRepair(db: Prisma.TransactionClient, input: LocalPatchPublicationBinding): Promise<boolean> {
  try {
    if (input.sceneVersion !== 8 || !Number.isInteger(input.attempts) || input.attempts < 1 || input.attempts > 3) return false;
    const receipt = JSON.parse(input.judgeJson ?? "null"), repair = receipt?.paidRepair, review = receipt?.boardReview;
    const unchangedSibling = repair?.kind === "reviewed-unchanged-sibling";
    const compositionVersion = unchangedSibling ? LOCAL_PATCH_COMPOSITION_VERSION : REPAIR_COMPOSITION;
    const batchId = `aud_lpmr_${digest(JSON.stringify(input.gameId)).slice(0, 32)}`;
    if (repair?.batchId !== batchId || receipt?.hide !== input.hideId || receipt.reviewState !== "board-review-complete"
      || receipt.wireFault !== null || receipt.renderFault !== null || receipt.judgedSha256 !== input.imageSha256
      || receipt.geometrySha256 !== input.geometrySha256 || review?.version !== REPAIR_REVIEW
      || receipt.compositionVersion !== compositionVersion || review?.compositionVersion !== compositionVersion || review.effort !== "low"
      || !isTheModelWeAsked(review.model ?? null, "gpt-5.6-sol")) return false;
    const audit = await db.auditLog.findUnique({ where: { id: batchId } });
    if (!audit || audit.actorType !== "ADMIN" || !audit.actorId || audit.action !== "local-patch:paid-mask-repair"
      || audit.entityType !== "Game" || audit.entityId !== input.gameId) return false;
    const batch = JSON.parse(audit.metaJson ?? "null") as PaidRepairBatch | null;
    if (!batch || batch.version !== 1 || batch.state !== "committed" || batch.gameId !== input.gameId
      || batch.operatorId !== audit.actorId || batch.inputSha256 !== repair.batchSha256
      || batch.identityAssetId !== input.identityAssetId || batch.identitySha256 !== input.identitySha256
      || batch.baseline.length !== 45 || new Set(batch.baseline.map(row => row.id)).size !== 45
      || batch.candidates.length !== 2 || new Set(batch.candidates.map(c => c.rowId)).size !== 2
      || batch.reviews.length !== 2 || new Set(batch.reviews.map(r => r.boardId)).size !== 2) return false;
    const candidate = batch.candidates.find(c => c.rowId === input.variantId);
    const siblings = batch.reviewedSiblings ?? [], sibling = siblings.find(s => s.rowId === input.variantId);
    if (siblings.length > 8 || new Set(siblings.map(s => s.rowId)).size !== siblings.length
      || siblings.some(s => batch.candidates.some(c => c.rowId === s.rowId))) return false;
    const appearance = unchangedSibling ? sibling : candidate;
    const baseline = batch.baseline.find(row => row.id === input.variantId);
    if (!appearance || !baseline || appearance.hideId !== input.hideId || appearance.assetId !== input.assetId || appearance.imageSha256 !== input.imageSha256
      || appearance.geometrySha256 !== input.geometrySha256 || localPatchPublicationGeometryHash(appearance.geometry) !== input.geometrySha256) return false;
    if (unchangedSibling) {
      if (!sibling || candidate || sibling.attempts !== input.attempts || sibling.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION
        || sibling.baselineSha256 !== baseline.sha256 || repair.baselineSha256 !== baseline.sha256
        || repair.selectedRawRequestKey !== undefined || repair.originalDiagnostic !== undefined) return false;
    } else if (!candidate || sibling || input.attempts !== 3 || repair.kind !== undefined
      || repair.selectedRawRequestKey !== candidate.rawRequestKey || !equalJson(repair.originalDiagnostic, candidate.audit)) return false;
    const game = await db.game.findUnique({ where: { id: input.gameId }, include: { childProfile: true } });
    const current = await db.targetVariantAsset.findUnique({ where: { id: input.variantId }, include: { targetInstance: true } });
    if (!game || game.deletedAt || game.ownerId !== batch.ownerId || game.childProfileId !== batch.childId
      || game.childProfile?.identityAssetId !== input.identityAssetId || game.childProfile.deletedAt || game.childProfile.ownerId !== batch.ownerId
      || game.childProfile.ageYears !== batch.ageYears || game.childProfile.photoCropJson !== batch.photoCropJson
      || ["DELETED", "REFUNDED", "CANCELLED"].includes(game.status)
      || !current || current.assetId !== input.assetId || current.attempts !== input.attempts || current.status !== "GENERATED"
      || current.judgeJson !== input.judgeJson || current.targetInstanceId !== appearance.targetInstanceId
      || current.targetInstance.gameSceneId !== appearance.sceneId || localPatchPublicationGeometryHash(current) !== input.geometrySha256) return false;
    const { targetInstance, ...currentFields } = current;
    if (sibling && localPatchRepairSiblingInvariantHash(currentFields) !== sibling.preservedSha256) return false;
    const scene = await db.gameScene.findUnique({ where: { id: appearance.sceneId } });
    const authored = localPatchBoardForVersion(appearance.boardId, 8)?.hides.find(h => h.id === input.hideId);
    if (!scene || scene.gameId !== input.gameId || scene.sceneSlug !== appearance.boardId || scene.sceneVersion !== 8
      || !authored || authored.targetId !== targetInstance.targetId) return false;
    const ownedAssets = await db.asset.findMany({ where: { id: { in: [input.identityAssetId, input.assetId] } } });
    for (const [id, sha, type, visibility] of [[input.identityAssetId, input.identitySha256, "IDENTITY_SHEET", "PRIVATE"],
      [input.assetId, input.imageSha256, "TARGET_SPRITE", "GAME"]] as const) {
      const asset = ownedAssets.find(a => a.id === id);
      if (!asset || asset.ownerId !== batch.ownerId || asset.status !== "READY" || asset.deletedAt || asset.type !== type || asset.visibility !== visibility
        || type === "IDENTITY_SHEET" && asset.storagePath !== batch.identityPath
        || type === "TARGET_SPRITE" && (asset.provider !== "local-patch" || asset.providerRequestId !== input.gameId)) return false;
      const blob = await db.fileBlob.findUnique({ where: { key: asset.storagePath } });
      if (!blob || createHash("sha256").update(Buffer.from(blob.data)).digest("hex") !== sha) return false;
    }
    const worldId = `${input.gameId}:board-wizard`;
    // This narrow adapter exposes a verified READ without reserving or changing
    // any ledger row inside the publication transaction.
    const ledger = await PrismaWorldBudgetStore.forContinuationApprovalTransaction(db).read(worldId);
    if (!ledger) return false;
    const retainedStore = new PrismaRetainedPurchaseStore(db);
    for (const boardReview of batch.reviews) {
      const result = boardReview.result, board = localPatchBoardForVersion(boardReview.boardId, 8);
      if (!result || !board || result.state !== "pass" || result.version !== REPAIR_REVIEW || result.wireFault !== null
        || !result.evidence || result.requestKey !== boardReview.requestKey || result.operationFingerprint !== boardReview.fingerprint
        || result.wireHashes.length !== 12 || result.wireHashes.some(sha => !/^[a-f0-9]{64}$/.test(sha))) return false;
      const bill = ledger.snapshot.requests.find(row => row.requestKey === boardReview.requestKey);
      if (!bill || !["settled", "linked"].includes(bill.state) || !("evidence" in bill) || bill.scope !== "judge"
        || bill.operationFingerprint !== boardReview.fingerprint || bill.reserveMicroUsd !== 500_000 || bill.conflicts.length
        || !sameChargeEvidence(bill.evidence, result.evidence) || !isTheModelWeAsked(bill.evidence.model, "gpt-5.6-sol")) return false;
      const retained = await retainedStore.get(worldId, boardReview.requestKey);
      if (!retained || retained.scope !== "judge" || retained.operationFingerprint !== boardReview.fingerprint
        || !retained.evidence || !sameChargeEvidence(retained.evidence, bill.evidence)) return false;
      const wire = JSON.parse(retained.bytes.toString());
      if (wire.wireFault !== null || wire.costUnknown !== false || wire.finishReason !== "stop"
        || wire.raw !== result.raw || wire.model !== bill.evidence.model || wire.requestId !== bill.evidence.providerRequestId
        || !sameChargeEvidence({ ...bill.evidence, rawUsage: wire.usage }, bill.evidence)) return false;
      const verdicts = parseLocalPatchBoardVerdicts(wire.raw, board.hides.map(hide => hide.id), 8);
      if (!equalJson(verdicts, result.verdicts) || board.hides.some(hide => localPatchQualityDisposition(verdicts[hide.id] ?? null).state !== "acceptable")) return false;
      if (boardReview.boardId === appearance.boardId && (!equalJson(receipt.verdict, verdicts[input.hideId]) || review.raw !== wire.raw
        || review.requestKey !== boardReview.requestKey || review.fingerprint !== boardReview.fingerprint
        || !equalJson(review.wireHashes, result.wireHashes) || review.model !== wire.model || review.costMicroUsd !== bill.evidence.amountMicroUsd)) return false;
    }
    return batch.reviews.some(r => r.boardId === appearance.boardId);
  } catch { return false; }
}

function allowed(input: LocalPatchPublicationBinding): boolean {
  if (!isLocalPatchAdvisoryVersion(input.sceneVersion)) return false;
  if (!isLocalPatchStrictVersion(input.sceneVersion)) return true;
  try {
    const receipt = JSON.parse(input.judgeJson ?? "null");
    return receipt?.reviewState === "board-review-complete" && receipt.wireFault === null
      && receipt?.compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION
      && receipt?.boardReview?.compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION
      && receipt?.boardReview?.version === "local-patch-board-five-quality/v3-head-safe"
      && localPatchQualityDisposition(receipt.verdict).state === "acceptable";
  } catch { return false; }
}

/** Written with the target, not minted later by the assembler. No visual pass or human decision is invented. */
export async function recordLocalPatchPublicationPolicy(tx: Prisma.TransactionClient, input: LocalPatchPublicationBinding) {
  if (!(isRepair(input) ? await allowedRepair(tx, input) : allowed(input))) throw new Error("Unsupported or unresolved local-patch publication quality policy");
  const id = idOf(input), metaJson = JSON.stringify(recordOf(input));
  const row = await tx.auditLog.upsert({ where: { id }, update: {}, create: {
    id, actorType: "SYSTEM", action: LOCAL_PATCH_PUBLICATION_ACTION, entityType: "Game", entityId: input.gameId, metaJson,
  } });
  if (row.actorType !== "SYSTEM" || row.action !== LOCAL_PATCH_PUBLICATION_ACTION || row.entityId !== input.gameId || row.metaJson !== metaJson) {
    throw new Error("Local-patch publication binding changed during replay");
  }
}

export async function hasLocalPatchPublicationPolicy(c: Pick<Container, "db">, input: LocalPatchPublicationBinding) {
  if (!(isRepair(input) ? await allowedRepair(c.db, input) : allowed(input))) return false;
  const row = await c.db.auditLog.findUnique({ where: { id: idOf(input) } });
  return !!row && row.actorType === "SYSTEM" && row.actorId === null && row.action === LOCAL_PATCH_PUBLICATION_ACTION
    && row.entityType === "Game" && row.entityId === input.gameId && row.metaJson === JSON.stringify(recordOf(input));
}

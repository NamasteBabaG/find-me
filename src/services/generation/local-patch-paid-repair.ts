import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { cropOf, maskForHide } from "../../domain/scene/local-patch-hides";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { sceneBySlug } from "../scene-catalog.service";
import { SYSTEM } from "../audit.service";
import { transitionGame } from "../game-status";
import { sha256Bytes } from "./fixed-sprite";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { prepareLocalPatchIdentityReferences } from "./local-patch-identity-reference";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, readShippedBoardArt } from "./local-patch-hide";
import { LocalPatchRetainedPurchaseStore, fenceLocalPatchImages } from "./local-patch-lifecycle";
import { LOCAL_PATCH_RESERVE, RETAINED_RENDER_VERSION } from "./local-patch-render";
import { sameChargeEvidence } from "./world-budget";
import { LOCAL_PATCH_RETURN_GUARD, LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { recomputePaidPatchJoin } from "./local-patch-repair-compose";
import { prepareLocalPatchRepairReview, reviewLocalPatchRepair } from "./local-patch-repair-review";
import { hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash, localPatchRepairSiblingInvariantHash, recordLocalPatchPublicationPolicy } from "./local-patch-publication-policy";
import type { LocalPatchBoardJudgeRequest } from "./local-patch-judge";

export const LOCAL_PATCH_PAID_REPAIR_ACTION = "local-patch:paid-mask-repair";
export const LOCAL_PATCH_PAID_REPAIR_COMPOSITION = "paid-mask-join/v1";
export class LocalPatchPaidRepairError extends Error {}
const hash = (v: unknown) => sha256Bytes(Buffer.from(JSON.stringify(v)));
const idOf = (gameId: string) => `aud_lpmr_${hash(gameId).slice(0, 32)}`;
function demand(v: unknown, why: string): asserts v { if (!v) throw new LocalPatchPaidRepairError(`LOCAL_PATCH_PAID_REPAIR: ${why}`); }
const rectSchema = z.object({ left: z.number().int().nonnegative(), top: z.number().int().nonnegative(),
  width: z.number().int().positive(), height: z.number().int().positive() }).strict();
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const paidPatchRepairInputSchema = z.array(z.object({ hideId: z.string().min(1).max(100), attempt: z.number().int().min(1).max(3),
  rawSha256: digestSchema, originalBoardSha256: digestSchema, candidateSha256: digestSchema, alphaSha256: digestSchema,
  alphaBase64: z.string().min(4).max(100_000), protectedCore: rectSchema, faceRect: rectSchema,
}).strict()).length(2);
type Geometry = { rectJson: string; hitRectJson: string; headAnchorJson: string };
type Candidate = { hideId: string; boardId: string; sceneId: string; rowId: string; targetInstanceId: string; assetId: string;
  imageSha256: string; alphaAssetId: string; geometry: Geometry; geometrySha256: string; faceRect: z.infer<typeof rectSchema>;
  rawRequestKey: string; rawPayloadSha256: string; rawFingerprint: string; originalBoardSha256: string; audit: unknown };
type ReviewedSibling = { hideId: string; boardId: string; sceneId: string; rowId: string; targetInstanceId: string; assetId: string;
  imageSha256: string; geometry: Geometry; geometrySha256: string; attempts: number; baselineSha256: string; preservedSha256: string; compositionVersion: string };
type Prepared = Awaited<ReturnType<typeof prepareLocalPatchRepairReview>>;
type ReviewResult = Awaited<ReturnType<typeof reviewLocalPatchRepair>>;
export type PaidRepairBatch = { version: 1; gameId: string; ownerId: string; childId: string; identityAssetId: string; identitySha256: string;
  identityPath: string; ageYears: number; photoAssetId: string | null; photoCropJson: string | null;
  inputSha256: string; state: "staged" | "blocked" | "committed"; reason: string | null; operatorId: string; authorizationReason: string;
  baseline: { id: string; sha256: string }[]; candidates: Candidate[]; reviewedSiblings?: ReviewedSibling[];
  reviews: { boardId: string; requestKey: string; fingerprint: string; result: ReviewResult | null }[] };
const rowDigest = (row: unknown) => hash(row);
async function rowsOf(c: Container, gameId: string) {
  return c.db.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } }, orderBy: { id: "asc" } });
}
export async function readLocalPatchPaidRepair(c: Pick<Container, "db">, gameId: string): Promise<PaidRepairBatch | null> {
  const a = await c.db.auditLog.findUnique({ where: { id: idOf(gameId) } });
  if (!a) return null;
  demand(a.action === LOCAL_PATCH_PAID_REPAIR_ACTION && a.entityType === "Game" && a.entityId === gameId && a.actorType === "ADMIN", "Repair inventory record is invalid");
  const b = JSON.parse(a.metaJson ?? "null") as PaidRepairBatch;
  demand(b?.version === 1 && b.gameId === gameId && b.baseline.length === 45 && b.candidates.length === 2 && b.reviews.length === 2,
    "Repair inventory is incomplete");
  return b;
}
async function identityOf(c: Container, gameId: string) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "This repair is restricted to durable QA storage");
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: true, orders: true } });
  const child = game.childProfile;
  demand(!game.deletedAt && !game.readyAt && !game.configJson && game.styleVersion === "local-patch-world-v1" && game.ownerId && child
    && !child.deletedAt && child.ownerId === game.ownerId && child.identityAssetId && child.ageYears && game.paidAt,
    "Repair needs an owned, paid, unpublished game and its original identity");
  demand(game.orders.some(o => o.paymentStatus === "PAID" && o.userId === game.ownerId && o.paidAt && !o.refundedAt)
    && !game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "A live paid order is required");
  demand(game.scenes.length === 9 && game.scenes.every(s => s.sceneVersion === 8), "Only the complete pinned v8 world may be repaired");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  demand(identity.ownerId === game.ownerId && identity.type === "IDENTITY_SHEET" && identity.status === "READY" && !identity.deletedAt && identity.visibility === "PRIVATE", "Canonical identity is unavailable");
  const sheet = await c.storage.get(identity.storagePath), identitySha256 = sha256Bytes(sheet);
  await requireBoardWizardIdentityApproval(c, boardWizardBudgetOf(c), { gameId, identityAssetId: identity.id, sheetSha256: identitySha256,
    catalogSha256: (await readBoardConditionedCatalog()).sha256, photoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears,
    crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null, contentVersion: 8 });
  return { game, child, identity, sheet, identitySha256 };
}
async function immutableRows(c: Container, batch: PaidRepairBatch) {
  const rows = await rowsOf(c, batch.gameId);
  demand(rows.length === 45 && rows.every(row => batch.baseline.find(b => b.id === row.id)?.sha256 === rowDigest(row)), "An appearance changed after the repair was staged");
  return rows;
}
async function fenceRepairIdentity(tx: Prisma.TransactionClient, b: PaidRepairBatch) {
  const game = await tx.game.findUniqueOrThrow({ where: { id: b.gameId } });
  const child = await tx.childProfile.findUniqueOrThrow({ where: { id: b.childId } });
  const asset = await tx.asset.findUniqueOrThrow({ where: { id: b.identityAssetId } });
  const blob = await tx.fileBlob.findUniqueOrThrow({ where: { key: b.identityPath } });
  const orders = await tx.order.findMany({ where: { gameId: b.gameId } });
  demand(orders.some(o => o.userId === b.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    && !orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt), "The repair order was refunded or is no longer paid");
  demand(!game.deletedAt && !game.configJson && !game.readyAt && game.ownerId === b.ownerId && game.childProfileId === b.childId
    && !child.deletedAt && child.ownerId === b.ownerId && child.identityAssetId === b.identityAssetId && child.ageYears === b.ageYears
    && child.originalPhotoAssetId === b.photoAssetId && child.photoCropJson === b.photoCropJson
    && asset.ownerId === b.ownerId && asset.type === "IDENTITY_SHEET" && asset.visibility === "PRIVATE" && asset.status === "READY"
    && !asset.deletedAt && asset.storagePath === b.identityPath && sha256Bytes(Buffer.from(blob.data)) === b.identitySha256,
  "The repair's canonical identity or provenance changed");
}

/** Rebuild exactly the evidence that will be reviewed; staged PNGs are not a new approval. */
async function prepareBoard(c: Container, batch: PaidRepairBatch, boardId: string, overrides?: Map<string, Buffer>): Promise<Prepared> {
  const { game, child, sheet, identitySha256 } = await identityOf(c, batch.gameId);
  demand(game.ownerId === batch.ownerId && child.id === batch.childId && child.identityAssetId === batch.identityAssetId && identitySha256 === batch.identitySha256,
    "The repair's canonical identity changed");
  const scene = game.scenes.find(s => s.sceneSlug === boardId)!;
  const board = localPatchBoardForVersion(boardId, 8);
  demand(scene && board && board.hides.length === 5, "The reviewed board is not authored");
  const def = sceneBySlug(boardId, 8), original = await readShippedBoardArt(board.art, def.art.sha256 ?? "");
  const all = await rowsOf(c, game.id), targets = await c.db.targetInstance.findMany({ where: { gameSceneId: scene.id } });
  const hides: LocalPatchBoardJudgeRequest["hides"][number][] = [];
  const request: LocalPatchBoardJudgeRequest = { boardId, contentVersion: 8,
    boardPng: await sharp(original).resize(1536, 1024, { fit: "inside" }).png().toBuffer(),
    identityPng: (await prepareLocalPatchIdentityReferences(sheet, 8)).judgeIdentityPng, hides };
  const faceRois: { hideId: string; rect: z.infer<typeof rectSchema> }[] = [];
  for (const hide of board.hides) {
    const target = targets.find(t => t.targetId === hide.targetId), row = all.find(r => r.targetInstanceId === target?.id);
    demand(row, "Reviewed target disappeared");
    const replacement = batch.candidates.find(x => x.rowId === row.id);
    const assetId = replacement?.assetId ?? row.assetId;
    demand(assetId, "No image exists for this review");
    const asset = overrides?.has(assetId) ? null : await c.db.asset.findUniqueOrThrow({ where: { id: assetId } });
    if (asset) demand(asset.ownerId === batch.ownerId && asset.providerRequestId === game.id && asset.status === "READY" && !asset.deletedAt, "Review asset is unavailable or unrelated");
    const bytes = overrides?.get(assetId) ?? await c.storage.get(asset!.storagePath), imageSha256 = sha256Bytes(bytes);
    if (replacement) demand(replacement.imageSha256 === imageSha256 && replacement.originalBoardSha256 === sha256Bytes(original), "Staged pixels or base board changed");
    else {
      const sibling = batch.reviewedSiblings?.find(s => s.rowId === row.id);
      demand(row.status === "GENERATED" && (sibling ? sibling.imageSha256 === imageSha256 && sibling.assetId === assetId
        && sibling.baselineSha256 === rowDigest(row) && sibling.preservedSha256 === localPatchRepairSiblingInvariantHash(row)
        : await hasLocalPatchPublicationPolicy(c, { gameId: game.id, sceneVersion: 8, hideId: hide.id,
        variantId: row.id, attempts: row.attempts, identityAssetId: batch.identityAssetId, identitySha256, assetId, imageSha256,
        geometrySha256: localPatchPublicationGeometryHash(row), judgeJson: row.judgeJson })), "An unchanged sibling lacks its frozen review input or original valid approval");
    }
    const crop = cropOf(hide), left = Math.max(0, crop.left - 64), top = Math.max(0, crop.top - 64);
    const context = { left, top, width: Math.min(def.art.width, crop.left + crop.width + 64) - left,
      height: Math.min(def.art.height, crop.top + crop.height + 64) - top };
    const beforePng = await sharp(original).extract(context).png().toBuffer();
    const afterPng = await sharp(beforePng).composite([{ input: bytes, left: crop.left - left, top: crop.top - top }]).png().toBuffer();
    const mask = maskForHide(hide), g = LOCAL_PATCH_RETURN_GUARD;
    const detailLeft = Math.max(0, mask.left - g), detailTop = Math.max(0, mask.top - g);
    const closeupPng = await sharp(bytes).extract({ left: detailLeft, top: detailTop,
      width: Math.min(crop.width, mask.left + mask.width + g) - detailLeft,
      height: Math.min(crop.height, mask.top + mask.height + g) - detailTop }).png().toBuffer();
    const dm = await sharp(closeupPng).metadata();
    const afterEvidencePng = await sharp({ create: { width: context.width + 24 + dm.width!, height: Math.max(context.height, dm.height!), channels: 4, background: "white" } })
      .composite([{ input: afterPng, left: 0, top: 0 }, { input: closeupPng, left: context.width + 24, top: 0 }]).png().toBuffer();
    hides.push({ hideId: hide.id, beforePng, afterPng, closeupPng, afterEvidencePng,
      expectation: { ageYears: child.ageYears!, support: `${hide.pose} on ${board.ground}` } });
    if (replacement) faceRois.push({ hideId: hide.id, rect: { ...replacement.faceRect,
      left: replacement.faceRect.left + crop.left - left, top: replacement.faceRect.top + crop.top - top } });
  }
  return prepareLocalPatchRepairReview({ gameId: game.id, batchId: idOf(game.id), batchSha256: batch.inputSha256, request, faceRois });
}

/** No image callback exists. Only two already-settled purchases can enter this one-shot repair. */
export async function stageLocalPatchPaidRepair(c: Container, input: { gameId: string; operatorId: string; authorizationReason: string; repairs: unknown }) {
  const repairs = paidPatchRepairInputSchema.parse(input.repairs);
  demand(new Set(repairs.map(r => r.hideId)).size === 2 && input.authorizationReason.trim().length >= 10 && input.authorizationReason.length <= 1000,
    "Two distinct appearances and an explicit authorization reason are required");
  const { game, child, identity, sheet, identitySha256 } = await identityOf(c, input.gameId);
  demand(game.status === "GENERATION_FAILED", "Only a terminal, unpublished quality failure can enter this review-only path");
  demand(!await readLocalPatchPaidRepair(c, game.id), "This game's immutable repair batch already exists");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: `job_${game.id}` } });
  demand(job.status === "DONE" && job.currentStep === "local-patch:quality-failed", "The original worker has not stopped");
  const rows = await rowsOf(c, game.id), targets = await c.db.targetInstance.findMany({ where: { gameScene: { gameId: game.id } } });
  demand(rows.length === 45 && rows.every(r => r.attempts >= 1 && r.attempts <= 3), "The complete bounded world is required");
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(game.id), ledger = await budget.audit(worldId);
  demand(!ledger.held && ledger.reservedMicroUsd === 0 && !ledger.pendingRequestKeys.length && !ledger.unknownRequestKeys.length, "Unresolved spending cannot enter recovery");
  const candidates: Candidate[] = [], blobs = new Map<string, Buffer>();
  for (const selection of repairs) {
    const scene = game.scenes.find(s => localPatchBoardForVersion(s.sceneSlug, 8)?.hides.some(h => h.id === selection.hideId));
    demand(scene, "Repair hide is not in this game");
    const board = localPatchBoardForVersion(scene.sceneSlug, 8)!, hide = board.hides.find(h => h.id === selection.hideId)!;
    const target = targets.find(t => t.gameSceneId === scene.id && t.targetId === hide.targetId), row = rows.find(r => r.targetInstanceId === target?.id);
    demand(row && target && row.provider === LOCAL_PATCH_PROVIDER && row.attempts === 3 && ["GENERATED", "FAILED"].includes(row.status), "Only an exhausted, concluded appearance may be locally repaired");
    const requestKey = `${hide.id}:${hide.pose}:render:${selection.attempt}`, bill = await budget.readRequest(worldId, requestKey);
    demand(bill && (bill.state === "settled" || bill.state === "linked") && bill.scope === "image" && bill.conflicts.length === 0
      && bill.reserveMicroUsd === LOCAL_PATCH_RESERVE.renderMicroUsd, "The selected paid image has no authoritative settled bill");
    const retained = await new LocalPatchRetainedPurchaseStore(c, game.id, budget).get(worldId, requestKey);
    demand(retained && retained.worldId === worldId && retained.requestKey === requestKey && retained.scope === "image"
      && retained.operationFingerprint === bill.operationFingerprint && retained.evidence && sameChargeEvidence(retained.evidence, bill.evidence), "Paid image receipt/fingerprint mismatch");
    const e = JSON.parse(retained.bytes.toString());
    demand(e.version === RETAINED_RENDER_VERSION && e.rejected === null && typeof e.bytesBase64 === "string", "The provider refused this image");
    const raw = Buffer.from(e.bytesBase64, "base64"), alpha = Buffer.from(selection.alphaBase64, "base64");
    demand(raw.toString("base64") === e.bytesBase64 && sha256Bytes(raw) === selection.rawSha256
      && alpha.toString("base64") === selection.alphaBase64 && sha256Bytes(alpha) === selection.alphaSha256, "Paid image or alpha digest mismatch");
    const def = sceneBySlug(scene.sceneSlug, 8), original = await readShippedBoardArt(board.art, def.art.sha256 ?? "");
    demand(sha256Bytes(original) === selection.originalBoardSha256, "The selected source board changed");
    const crop = cropOf(hide), mask = maskForHide(hide), g = LOCAL_PATCH_RETURN_GUARD;
    const left = Math.max(0, mask.left - g), top = Math.max(0, mask.top - g);
    const returnWindow = { left, top, width: Math.min(crop.width, mask.left + mask.width + g) - left,
      height: Math.min(crop.height, mask.top + mask.height + g) - top };
    const joined = await recomputePaidPatchJoin({ beforePng: original, rawPng: raw, alphaPng: alpha, crop, returnWindow,
      protectedCore: selection.protectedCore, faceRect: selection.faceRect });
    demand(joined.candidateSha256 === selection.candidateSha256, "The repaired picture does not match the inspected candidate");
    const assetId = `ast_lpmr_${hash([game.id, hide.id, joined.candidateSha256]).slice(0, 24)}`;
    const alphaAssetId = `ast_lpmra_${hash([game.id, hide.id, selection.alphaSha256]).slice(0, 24)}`;
    const geometry = { rectJson: JSON.stringify(joined.geometry.rect), hitRectJson: JSON.stringify(joined.geometry.hitRect), headAnchorJson: JSON.stringify(joined.geometry.anchor) };
    candidates.push({ hideId: hide.id, boardId: board.board, sceneId: scene.id, rowId: row.id, targetInstanceId: target.id,
      assetId, imageSha256: joined.candidateSha256, alphaAssetId, geometry, geometrySha256: localPatchPublicationGeometryHash(geometry), faceRect: selection.faceRect,
      rawRequestKey: requestKey, rawPayloadSha256: retained.payloadSha256, rawFingerprint: retained.operationFingerprint, originalBoardSha256: selection.originalBoardSha256, audit: joined.audit });
    blobs.set(assetId, joined.candidatePng); blobs.set(alphaAssetId, alpha);
  }
  demand(new Set(candidates.map(x => x.boardId)).size === 2, "The two repaired appearances must belong to different boards");
  // No unselected failure can be disguised by this path.
  demand(rows.filter(r => !candidates.some(x => x.rowId === r.id)).every(r => r.status === "GENERATED"), "An unselected appearance still failed");
  const batch: PaidRepairBatch = { version: 1, gameId: game.id, ownerId: game.ownerId!, childId: child.id, identityAssetId: identity.id,
    identityPath: identity.storagePath, ageYears: child.ageYears!, photoAssetId: child.originalPhotoAssetId, photoCropJson: child.photoCropJson,
    identitySha256, inputSha256: hash(repairs), state: "staged", reason: null, operatorId: input.operatorId, authorizationReason: input.authorizationReason.trim(),
    baseline: rows.map(r => ({ id: r.id, sha256: rowDigest(r) })), candidates, reviewedSiblings: [], reviews: [] };
  // A board whose final render failed may never have reached grouped review.
  // Keep its sibling pictures intact, but establish their first REAL approval
  // from the same fresh board review, rather than pretending they already passed.
  for (const candidate of candidates) {
    const board = localPatchBoardForVersion(candidate.boardId, 8)!;
    for (const hide of board.hides) {
      const target = targets.find(t => t.gameSceneId === candidate.sceneId && t.targetId === hide.targetId)!;
      const row = rows.find(r => r.targetInstanceId === target.id)!;
      if (candidates.some(x => x.rowId === row.id)) continue;
      demand(row.assetId && row.rectJson && row.hitRectJson && row.headAnchorJson, "An unchanged appearance is incomplete");
      const asset = await c.db.asset.findUniqueOrThrow({ where: { id: row.assetId } });
      demand(asset.ownerId === batch.ownerId && asset.provider === LOCAL_PATCH_PROVIDER && asset.providerRequestId === game.id
        && asset.type === "TARGET_SPRITE" && asset.visibility === "GAME" && asset.status === "READY" && !asset.deletedAt,
        "An unchanged appearance has no owned playable asset");
      const image = await c.storage.get(asset.storagePath), imageSha256 = sha256Bytes(image);
      if (await hasLocalPatchPublicationPolicy(c, { gameId: game.id, sceneVersion: 8, hideId: hide.id, variantId: row.id,
        attempts: row.attempts, identityAssetId: identity.id, identitySha256, assetId: row.assetId, imageSha256,
        geometrySha256: localPatchPublicationGeometryHash(row), judgeJson: row.judgeJson })) continue;
      const receipt = JSON.parse(row.judgeJson ?? "null");
      const meta = await sharp(image, { limitInputPixels: 512 * 768 }).metadata();
      demand(receipt?.reviewState === "pending-board-review" && receipt.verdict === null
        && receipt.compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION && receipt.hide === hide.id && receipt.pose === hide.pose
        && receipt.judgedSha256 === imageSha256 && receipt.geometrySha256 === localPatchPublicationGeometryHash(row)
        && meta.format === "png" && meta.width === 512 && meta.height === 768 && (meta.pages ?? 1) === 1,
        "An unapproved sibling is not awaiting its first current review");
      batch.reviewedSiblings!.push({ hideId: hide.id, boardId: candidate.boardId, sceneId: candidate.sceneId, rowId: row.id,
        targetInstanceId: target.id, assetId: row.assetId, imageSha256,
        geometry: { rectJson: row.rectJson, hitRectJson: row.hitRectJson, headAnchorJson: row.headAnchorJson },
        geometrySha256: localPatchPublicationGeometryHash(row), attempts: row.attempts, baselineSha256: rowDigest(row),
        preservedSha256: localPatchRepairSiblingInvariantHash(row), compositionVersion: receipt.compositionVersion });
    }
  }
  for (const candidate of candidates) {
    const prepared = await prepareBoard(c, batch, candidate.boardId, blobs);
    batch.reviews.push({ boardId: candidate.boardId, requestKey: prepared.requestKey, fingerprint: prepared.operationFingerprint, result: null });
  }
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, game.id);
    const tc = { ...c, db: tx as Container["db"] };
    const live = await tx.game.findUniqueOrThrow({ where: { id: game.id } });
    demand(live.status === "GENERATION_FAILED" && !live.readyAt && !live.configJson && live.ownerId === batch.ownerId && live.childProfileId === batch.childId,
      "The stopped game changed while staging");
    await immutableRows(tc, batch);
    await fenceRepairIdentity(tx, batch);
    const idBlob = await tx.fileBlob.findUniqueOrThrow({ where: { key: identity.storagePath } });
    demand(sha256Bytes(Buffer.from(idBlob.data)) === sha256Bytes(sheet), "The identity bytes changed while staging");
    for (const [assetId, bytes] of blobs) {
      const key = `private/${assetId}.png`;
      await tx.asset.create({ data: { id: assetId, ownerId: batch.ownerId, type: "REJECTED_PATCH", visibility: "PRIVATE", status: "READY", storagePath: key,
        mimeType: "image/png", width: 512, height: 768, bytes: bytes.length, costCents: 0, provider: LOCAL_PATCH_PROVIDER, providerRequestId: game.id } });
      await tx.fileBlob.create({ data: { key, data: new Uint8Array(bytes), contentType: "image/png" } });
    }
    await tx.auditLog.create({ data: { id: idOf(game.id), actorType: "ADMIN", actorId: input.operatorId, action: LOCAL_PATCH_PAID_REPAIR_ACTION,
      entityType: "Game", entityId: game.id, metaJson: JSON.stringify(batch) } });
    await transitionGame(tc, game.id, "TARGETS_GENERATING", SYSTEM, { reason: "Existing paid images, review-only repair; no image retries granted", batchId: idOf(game.id) });
    const queued = await tx.generationJob.updateMany({ where: { id: job.id, status: "DONE", currentStep: "local-patch:quality-failed", attempts: job.attempts },
      data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    demand(queued.count === 1, "The old worker changed during staging");
    await tx.game.update({ where: { id: game.id }, data: { lastError: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return { batchId: idOf(game.id), gameId: game.id, requestKeys: batch.reviews.map(r => r.requestKey) };
}

/** Called before any ordinary work planning. It cannot buy images, even if a sibling fails review. */
export async function runLocalPatchPaidRepair(c: Container, gameId: string, deps: {
  fence(tx: Prisma.TransactionClient): Promise<void>; apiKey?: string; deadlineAt?: number;
  judge?: Parameters<typeof reviewLocalPatchRepair>[2]["judge"];
}): Promise<{ state: "none" | "pending" | "held" | "blocked" | "committed"; reason: string | null }> {
  const batch = await readLocalPatchPaidRepair(c, gameId);
  if (!batch) return { state: "none", reason: null };
  if (batch.state === "blocked") return { state: "blocked", reason: batch.reason };
  if (batch.state === "committed") {
    const current = await rowsOf(c, gameId);
    demand(current.length === 45 && current.every(row => {
      const candidate = batch.candidates.find(x => x.rowId === row.id);
      const sibling = batch.reviewedSiblings?.find(x => x.rowId === row.id);
      return candidate ? row.status === "GENERATED" && row.attempts === 3 && row.assetId === candidate.assetId
        && localPatchPublicationGeometryHash(row) === candidate.geometrySha256
        : sibling ? localPatchRepairSiblingInvariantHash(row) === sibling.preservedSha256
        : batch.baseline.find(x => x.id === row.id)?.sha256 === rowDigest(row);
    }), "A committed repair no longer preserves the original forty-three appearances");
    return { state: "committed", reason: null };
  }
  await immutableRows(c, batch);
  const next = batch.reviews.find(r => !r.result);
  if (next) {
    const prepared = await prepareBoard(c, batch, next.boardId);
    demand(prepared.requestKey === next.requestKey && prepared.operationFingerprint === next.fingerprint, "The staged review question changed");
    const result = await reviewLocalPatchRepair(c, prepared, { ...deps, fence: async tx => {
      await deps.fence(tx); await fenceRepairIdentity(tx, batch); await immutableRows({ ...c, db: tx as Container["db"] }, batch);
      const current = await readLocalPatchPaidRepair({ db: tx as Container["db"] }, gameId);
      demand(current && JSON.stringify(current) === JSON.stringify(batch), "The frozen repair batch changed");
    } });
    if (result.state === "pending" || result.state === "held") return { state: result.state, reason: result.reason };
    const oldJson = JSON.stringify(batch);
    next.result = result;
    if (result.state !== "pass") { batch.state = "blocked"; batch.reason = result.reason ?? "The corrective visual review did not pass"; }
    await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId); await deps.fence(tx); await immutableRows({ ...c, db: tx as Container["db"] }, batch);
      await fenceRepairIdentity(tx, batch);
      const saved = await tx.auditLog.updateMany({ where: { id: idOf(gameId), metaJson: oldJson }, data: { metaJson: JSON.stringify(batch) } });
      demand(saved.count === 1, "The repair review was concurrently changed");
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
    if (batch.state === "blocked") return { state: "blocked", reason: batch.reason };
    if (batch.reviews.some(r => !r.result)) return { state: "pending", reason: null };
  }
  // Publication is atomic for the TWO candidates; no partially repaired world.
  await commitLocalPatchPaidRepair(c, batch, deps.fence);
  return { state: "committed", reason: null };
}

async function commitLocalPatchPaidRepair(c: Container, batch: PaidRepairBatch, fence: (tx: Prisma.TransactionClient) => Promise<void>) {
  demand(batch.reviews.every(r => r.result?.state === "pass"), "Both corrective reviews must pass");
  const { identitySha256 } = await identityOf(c, batch.gameId);
  demand(identitySha256 === batch.identitySha256, "Canonical identity changed before repair publication");
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, batch.gameId); await fence(tx);
    await fenceRepairIdentity(tx, batch);
    const tc = { ...c, db: tx as Container["db"] }, rows = await immutableRows(tc, batch);
    const oldJson = JSON.stringify(batch); batch.state = "committed";
    const saved = await tx.auditLog.updateMany({ where: { id: idOf(batch.gameId), metaJson: oldJson }, data: { metaJson: JSON.stringify(batch) } });
    demand(saved.count === 1, "The repair changed before publication");
    for (const candidate of batch.candidates) {
      const row = rows.find(r => r.id === candidate.rowId)!, reviewed = batch.reviews.find(r => r.boardId === candidate.boardId)!;
      const result = reviewed.result!;
      demand(result.state === "pass" && result.verdicts && result.evidence && result.wireFault === null, "Review evidence is missing");
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: candidate.assetId } });
      const blob = await tx.fileBlob.findUniqueOrThrow({ where: { key: asset.storagePath } });
      demand(asset.ownerId === batch.ownerId && asset.providerRequestId === batch.gameId && !asset.deletedAt && asset.status === "READY"
        && sha256Bytes(Buffer.from(blob.data)) === candidate.imageSha256, "Staged candidate changed before publication");
      const old = JSON.parse(row.judgeJson ?? "{}");
      const judgeJson = JSON.stringify({ ...old, hide: candidate.hideId, reviewState: "board-review-complete", wireFault: null,
        verdict: result.verdicts[candidate.hideId], judgedSha256: candidate.imageSha256, geometrySha256: candidate.geometrySha256,
        compositionVersion: LOCAL_PATCH_PAID_REPAIR_COMPOSITION, renderFault: null, compositionPermission: "separately-reviewed-background-join",
        paidRepair: { batchId: idOf(batch.gameId), batchSha256: batch.inputSha256, selectedRawRequestKey: candidate.rawRequestKey, originalDiagnostic: candidate.audit },
        boardReview: { version: result.version, wireHashes: result.wireHashes, raw: result.raw, model: result.evidence.model, effort: "low",
          costMicroUsd: result.evidence.amountMicroUsd, requestKey: reviewed.requestKey, fingerprint: reviewed.fingerprint, compositionVersion: LOCAL_PATCH_PAID_REPAIR_COMPOSITION } });
      const priorIds = JSON.parse(row.rejectedAssetIdsJson ?? "[]") as string[];
      demand(Array.isArray(priorIds) && priorIds.every(v => typeof v === "string"), "The rejected-image inventory is invalid");
      const publishedPath = `game/${asset.id}.png`;
      await tx.fileBlob.create({ data: { key: publishedPath, data: blob.data, contentType: "image/png" } });
      await tx.asset.update({ where: { id: asset.id }, data: { type: "TARGET_SPRITE", visibility: "GAME", storagePath: publishedPath } });
      await tx.fileBlob.delete({ where: { key: asset.storagePath } });
      await tx.targetVariantAsset.update({ where: { id: row.id }, data: { ...candidate.geometry, status: "GENERATED", assetId: asset.id,
        judgeJson, lastError: null, rejectedAssetIdsJson: JSON.stringify([...new Set([...priorIds, ...(row.assetId ? [row.assetId] : [])])]) } });
      await tx.targetInstance.update({ where: { id: candidate.targetInstanceId }, data: { status: "GENERATED", spriteKind: "image", spriteAssetId: asset.id } });
      await tx.gameScene.update({ where: { id: candidate.sceneId }, data: { generationStatus: "GENERATED", configJson: null } });
      await recordLocalPatchPublicationPolicy(tx, { gameId: batch.gameId, sceneVersion: 8, hideId: candidate.hideId, variantId: row.id,
        attempts: row.attempts, identityAssetId: batch.identityAssetId, identitySha256: batch.identitySha256, assetId: asset.id,
        imageSha256: candidate.imageSha256, geometrySha256: candidate.geometrySha256, judgeJson });
    }
    for (const sibling of batch.reviewedSiblings ?? []) {
      const row = rows.find(r => r.id === sibling.rowId)!, reviewed = batch.reviews.find(r => r.boardId === sibling.boardId)!;
      const result = reviewed.result!;
      demand(result.state === "pass" && result.verdicts && result.evidence && result.wireFault === null, "Sibling review evidence is missing");
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: sibling.assetId } });
      const blob = await tx.fileBlob.findUniqueOrThrow({ where: { key: asset.storagePath } });
      demand(sha256Bytes(Buffer.from(blob.data)) === sibling.imageSha256, "An unchanged sibling picture changed before publication");
      const judgeJson = JSON.stringify({ ...JSON.parse(row.judgeJson ?? "{}"), hide: sibling.hideId,
        reviewState: "board-review-complete", wireFault: null, verdict: result.verdicts[sibling.hideId],
        judgedSha256: sibling.imageSha256, geometrySha256: sibling.geometrySha256, renderFault: null,
        paidRepair: { kind: "reviewed-unchanged-sibling", batchId: idOf(batch.gameId), batchSha256: batch.inputSha256, baselineSha256: sibling.baselineSha256 },
        boardReview: { version: result.version, wireHashes: result.wireHashes, raw: result.raw, model: result.evidence.model, effort: "low",
          costMicroUsd: result.evidence.amountMicroUsd, requestKey: reviewed.requestKey, fingerprint: reviewed.fingerprint, compositionVersion: sibling.compositionVersion } });
      await tx.targetVariantAsset.update({ where: { id: row.id }, data: { judgeJson } });
      await recordLocalPatchPublicationPolicy(tx, { gameId: batch.gameId, sceneVersion: 8, hideId: sibling.hideId, variantId: row.id,
        attempts: row.attempts, identityAssetId: batch.identityAssetId, identitySha256: batch.identitySha256, assetId: sibling.assetId,
        imageSha256: sibling.imageSha256, geometrySha256: sibling.geometrySha256, judgeJson });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

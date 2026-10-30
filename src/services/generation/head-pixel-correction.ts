import { Prisma } from "@prisma/client";
import sharp from "sharp";
import type { Container } from "../container";
import { DbStorage } from "../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { HEAD_PIXEL_CORRECTION_ACTION, HEAD_PIXEL_CORRECTION_VERSION, MEASURED_HEAD_FADE_REASON, composeHeadPixelCorrection,
  headPixelCorrectionCandidate, headPixelCorrectionSchema, type HeadPixelCorrection } from "../../domain/generation/head-pixel-correction";
import { targetHeadAnswerSchema, targetHeadReturnDecision, type TargetHeadEvidence } from "../../domain/generation/target-head-return";
import { readSingleVisualReview, SINGLE_MEDIUM_VISUAL_REVIEW_VERSION } from "../../domain/generation/single-visual-review";
import { localPatchRuntimeContinuityVerdict } from "../../domain/scene/local-patch-body-continuity";
import { retainedNormalHeadSchema } from "../../domain/generation/retained-normal-head";
import { cropOf } from "../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_RETURN_FEATHER } from "../../domain/scene/local-patch-return-region";
import { resolveLocalPatchBoardsForGame } from "./source-placement-release";
import { readShippedBoardArt, LOCAL_PATCH_PROVIDER, type LocalPatchHideDeps } from "./local-patch-hide";
import { sceneBySlug } from "../scene-catalog.service";
import { localPatchGeometry } from "./local-patch-geometry";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { authoredLocalPatchReviewBinding } from "./local-patch-authored-return";
import { readContinuityStage, readQualityStage, verifiedDualStage, type DualReviewProof } from "./local-patch-dual-evidence";
import { allowedDualSubject } from "./local-patch-dual-publication";
import type { LocalPatchPublicationBinding } from "./local-patch-publication-policy";
import { subjectUpgradeOf } from "./subject-enrollment";
import { dualVisualReviewVersion } from "./visual-review-release";
import { isLeanWorld } from "./lean-release";
import { readSettledTargetRaw, singleReviewHeadEvidenceMatches } from "./single-review-head-evidence";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { sha256Bytes } from "./fixed-sprite";

const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
const rgba = async (png: Buffer) => { const { data, info } = await sharp(png, { limitInputPixels: 8_294_400 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels }; };
type Candidate = { id: string; status: string; assetId: string | null; judgeJson: string | null };

/** C fixes only head blending. Read every other role from its immutable paid
 * document even if a mutable row verdict no longer carries that role's refusal.
 * The same subject reader and enrollment fences also protect publication. */
async function otherPaidRolesPass(db: Prisma.TransactionClient, binding: LocalPatchPublicationBinding, proof: DualReviewProof): Promise<boolean> {
  if (proof.single !== SINGLE_MEDIUM_VISUAL_REVIEW_VERSION || !proof.continuity || !proof.subject
    || readSingleVisualReview(proof.quality.raw)?.doubt !== false
    || ![proof.continuity, proof.subject].every(stage => stage.requestKey === proof.quality.requestKey
      && stage.fingerprint === proof.quality.fingerprint && stage.raw === proof.quality.raw
      && JSON.stringify(stage.policy) === JSON.stringify(proof.quality.policy) && stage.costMicroUsd === proof.quality.costMicroUsd)) return false;
  const version = await dualVisualReviewVersion(db, binding.gameId);
  if (!version || proof.version !== version) return false;
  const continuity = readContinuityStage(proof.continuity, binding.hideId, version);
  if (!continuity || localPatchRuntimeContinuityVerdict(continuity).disposition !== "pass") return false;
  const upgrade = await subjectUpgradeOf(db, binding.gameId);
  return !!upgrade && allowedDualSubject(db, binding.gameId + ":board-wizard", upgrade, proof, binding,
    await isLeanWorld(db, binding.gameId), true);
}

/** The located heads, read only from the exact paid answer in this proof. */
function locatedHeads(proof: DualReviewProof) {
  const document = JSON.parse(String(proof.quality.raw ?? "null").trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i, "$1"));
  const answer = targetHeadAnswerSchema.parse(document?.head);
  return { answer, heads: [answer.rawHead, answer.shippingHead] };
}
/** The corrected shipping of an authenticated baseline: same RAW, same scene, same return. */
async function correctedShipping(input: { raw: Buffer; board: Buffer; crop: ReturnType<typeof cropOf>; baseline: Buffer;
  returned: HeadPixelCorrection["returned"]; heads: HeadPixelCorrection["heads"] }) {
  const scene = await sharp(input.board, { limitInputPixels: 8_294_400 }).extract(input.crop).png().toBuffer();
  const { pixels, changed } = composeHeadPixelCorrection({ raw: await rgba(input.raw), scene: await rgba(scene), baseline: await rgba(input.baseline),
    returned: input.returned, heads: input.heads, band: LOCAL_PATCH_RETURN_FEATHER });
  return { png: await sharp(pixels, { raw: { width: input.crop.width, height: input.crop.height, channels: 4 } }).png().toBuffer(), changed };
}

/** Free, finite and bounded to ONE candidate: keep an already-paid normal
 * composition's located head opaque inside its SAME return, then require a fresh
 * ordinary MEDIUM. Nothing is bought, counters and reserves are untouched, and a
 * refusal is never permission for a painting. Returns true when a candidate changed. */
export async function correctHeadPixels(c: Container, gameId: string, rows: readonly Candidate[], fence: (tx: Prisma.TransactionClient) => Promise<void>,
  readArt: NonNullable<LocalPatchHideDeps["readBoardArt"]> = readShippedBoardArt): Promise<boolean> {
  // At most one write; a candidate refused here never starves the next one.
  for (const candidate of rows.filter(headPixelCorrectionCandidate)) if (await correctOne(c, gameId, candidate, fence, readArt)) return true;
  return false;
}

async function correctOne(c: Container, gameId: string, candidate: Candidate, fence: (tx: Prisma.TransactionClient) => Promise<void>,
  readArt: NonNullable<LocalPatchHideDeps["readBoardArt"]>): Promise<boolean> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true } }), child = game?.childProfile;
  if (!game || !child || game.status !== "TARGETS_GENERATING" || game.deletedAt || game.configJson || game.readyAt || !game.ownerId
    || child.deletedAt || child.ownerId !== game.ownerId || !child.identityAssetId
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) return false;
  const row = await c.db.targetVariantAsset.findUnique({ where: { id: candidate.id }, include: { targetInstance: { include: { gameScene: true } } } });
  if (!row || !headPixelCorrectionCandidate(row) || row.targetInstance.gameScene.gameId !== gameId) return false;
  const j = JSON.parse(row.judgeJson!), proof = j.boardReview.dual as DualReviewProof, scene = row.targetInstance.gameScene;
  const context = await resolveLocalPatchBoardsForGame(c.db, gameId, scene.sceneVersion);
  const board = context.boards.find(b => b.board === scene.sceneSlug), hide = board?.hides.find(h => h.targetId === row.targetInstance.targetId);
  const identity = await c.db.asset.findUnique({ where: { id: child.identityAssetId } });
  if (!board || !hide || j.hide !== hide.id || proof.hideId !== hide.id || proof.imageSha256 !== j.judgedSha256 || proof.geometrySha256 !== j.geometrySha256
    || j.geometrySha256 !== localPatchPublicationGeometryHash(row) || !identity || identity.ownerId !== game.ownerId || identity.type !== "IDENTITY_SHEET"
    || identity.status !== "READY" || identity.visibility !== "PRIVATE" || identity.deletedAt) return false;
  const identitySha256 = sha256Bytes(await c.storage.get(identity.storagePath));
  if (proof.identitySha256 !== identitySha256) return false;
  // The baseline: the candidate's own shipped asset, owned by this game.
  const baselineAsset = await c.db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
  if (baselineAsset.deletedAt || baselineAsset.status !== "READY" || baselineAsset.type !== "TARGET_SPRITE" || baselineAsset.visibility !== "GAME"
    || baselineAsset.ownerId !== game.ownerId || baselineAsset.providerRequestId !== gameId) return false;
  const baseline = await c.storage.get(baselineAsset.storagePath);
  if (sha256Bytes(baseline) !== j.judgedSha256) return false;
  // Every paid role, the RAW alias chain, the return and the measured refusal, as paid.
  const binding = { gameId, hideId: hide.id, variantId: row.id, imageSha256: j.judgedSha256, geometrySha256: j.geometrySha256, identitySha256,
    sceneVersion: scene.sceneVersion, attempts: row.attempts, judgeJson: row.judgeJson, assetId: row.assetId!, identityAssetId: identity.id };
  const evidence = proof.quality.headEvidence as TargetHeadEvidence;
  if (!await singleReviewHeadEvidenceMatches(c.db, binding, evidence)) return false;
  const options = { allowSingle: true, authoredReviewBinding: authoredLocalPatchReviewBinding({ ...binding, authoredReturn: proof.authoredReturn }) };
  const paid = await verifiedDualStage(c.db, gameId + ":board-wizard", proof.quality, "scene-quality", options);
  const continuity = await verifiedDualStage(c.db, gameId + ":board-wizard", proof.continuity!, "head-continuity", options);
  const subject = await verifiedDualStage(c.db, gameId + ":board-wizard", proof.subject!, "scene-quality", options);
  if (!paid || !continuity || !subject || !paid.bytes.equals(continuity.bytes) || !paid.bytes.equals(subject.bytes)) return false;
  if (!await otherPaidRolesPass(c.db, binding, proof)) return false;
  if (targetHeadReturnDecision(proof.quality.raw, evidence).reason !== MEASURED_HEAD_FADE_REASON
    || JSON.stringify(readQualityStage(proof.quality, hide.id, scene.sceneVersion)) !== JSON.stringify(j.verdict)) return false;
  const { heads } = locatedHeads(proof), raw = await readSettledTargetRaw(c.db, gameId, evidence.sourceRequestKey);
  const definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion), art = await readArt(board.art, definition.art.sha256 ?? "");
  let corrected;
  try { corrected = await correctedShipping({ raw: raw.normalized, board: art, crop: cropOf(hide), baseline, returned: evidence.returned, heads }); }
  catch { return false; }
  if (!corrected.changed) return false;
  const candidateSha256 = sha256Bytes(corrected.png);
  const measured = await localPatchGeometry({ hide, boardPng: art, patchPng: corrected.png, board: definition.art, contentVersion: scene.sceneVersion });
  const geometry = { rectJson: JSON.stringify(measured.geometry.rect), hitRectJson: JSON.stringify(measured.geometry.hitRect), headAnchorJson: JSON.stringify(measured.geometry.anchor) };
  const auditId = "aud_head_pixels_" + hash([gameId, row.id, evidence.sourceRequestKey, j.judgedSha256, evidence.returned, proof.quality.requestKey]).slice(0, 40);
  if (await c.db.auditLog.findUnique({ where: { id: auditId } })) return false;
  const marker = headPixelCorrectionSchema.parse({ version: HEAD_PIXEL_CORRECTION_VERSION, auditId,
    sourceRequestKey: evidence.sourceRequestKey, sourceFingerprint: evidence.sourceFingerprint, sourcePayloadSha256: evidence.sourcePayloadSha256,
    normalizedRawSha256: evidence.normalizedRawSha256, ...(j.retainedNormalHead !== undefined ? { alias: { retainedNormalHead: retainedNormalHeadSchema.parse(j.retainedNormalHead) } } : {}),
    baselineAssetId: baselineAsset.id, baselineShippingSha256: j.judgedSha256, baselineGeometrySha256: j.geometrySha256, boardArtSha256: sha256Bytes(art),
    returned: evidence.returned, heads, band: LOCAL_PATCH_RETURN_FEATHER,
    headAnswer: { requestKey: proof.quality.requestKey, fingerprint: proof.quality.fingerprint, rawSha256: sha256Bytes(Buffer.from(proof.quality.raw ?? "")) },
    candidateSha256, geometrySha256: localPatchPublicationGeometryHash(geometry), identitySha256 });
  const assetId = "ast_hpc_" + hash([gameId, hide.id, HEAD_PIXEL_CORRECTION_VERSION, candidateSha256]).slice(0, 24), key = `game/${assetId}.png`;
  const worldId = gameId + ":board-wizard", stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldId);
  if (!stored) return false;
  // The paid answer's acceptance is not reused: a fresh ordinary MEDIUM decides the new shipping.
  const receipt = { ...j, retainedNormalHead: undefined, headPixelCorrection: marker, judgedSha256: candidateSha256, geometrySha256: marker.geometrySha256,
    geometryBasis: measured.basis, measuredFraction: Number(measured.measuredFraction.toFixed(4)),
    boardReview: undefined, dualContinuityCheckpoint: undefined, verdict: null, wireFault: null, qualityDisposition: undefined, reviewState: "pending-board-review" };
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId); await fence(tx);
    const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } }), live = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { orders: true, childProfile: true } });
    const ledger = await PrismaWorldBudgetStore.forReadOnlyTransaction(tx).read(worldId), held = await tx.asset.findUniqueOrThrow({ where: { id: baselineAsset.id } });
    const heldBlob = await tx.fileBlob.findUnique({ where: { key: baselineAsset.storagePath } });
    const heldIdentity = await tx.asset.findUnique({ where: { id: identity.id } });
    const identityBlob = heldIdentity && await tx.fileBlob.findUnique({ where: { key: heldIdentity.storagePath } });
    if (live.status !== "TARGETS_GENERATING" || live.deletedAt || live.configJson || live.readyAt || live.ownerId !== game.ownerId
      || live.childProfileId !== game.childProfileId || !live.childProfile || live.childProfile.deletedAt
      || live.childProfile.ownerId !== game.ownerId || live.childProfile.identityAssetId !== identity.id || live.childProfile.ageYears !== child.ageYears
      || !heldIdentity || heldIdentity.deletedAt || heldIdentity.status !== "READY" || heldIdentity.type !== "IDENTITY_SHEET"
      || heldIdentity.visibility !== "PRIVATE" || heldIdentity.ownerId !== game.ownerId || !identityBlob || sha256Bytes(Buffer.from(identityBlob.data)) !== identitySha256
      || live.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt) || !live.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt)
      || current.judgeJson !== row.judgeJson || current.assetId !== row.assetId || current.status !== row.status || current.attempts !== row.attempts
      || current.costCents !== row.costCents || !ledger || ledger.revision !== stored.revision || hash(ledger.snapshot) !== hash(stored.snapshot)
      || held.deletedAt || held.status !== "READY" || !heldBlob || sha256Bytes(Buffer.from(heldBlob.data)) !== j.judgedSha256
      || await tx.auditLog.findUnique({ where: { id: auditId } })) return false;
    if (!await singleReviewHeadEvidenceMatches(tx, binding, evidence) || !await otherPaidRolesPass(tx, binding, proof)) return false;
    const cas = await tx.worldBudgetLedger.updateMany({ where: { worldId, revision: stored.revision }, data: { revision: { increment: 1 } } });
    if (cas.count !== 1) return false;
    const saved = await tx.asset.upsert({ where: { id: assetId }, update: {}, create: { id: assetId, ownerId: game.ownerId, type: "TARGET_SPRITE",
      visibility: "GAME", status: "READY", storagePath: key, mimeType: "image/png", width: 512, height: 768, bytes: corrected.png.length, costCents: 0,
      provider: LOCAL_PATCH_PROVIDER, providerRequestId: gameId } });
    const blob = await new DbStorage(tx).put(key, corrected.png, "image/png").then(() => tx.fileBlob.findUnique({ where: { key } }));
    if (saved.ownerId !== game.ownerId || saved.storagePath !== key || saved.providerRequestId !== gameId || saved.type !== "TARGET_SPRITE"
      || !blob || sha256Bytes(Buffer.from(blob.data)) !== candidateSha256) throw Error("HEAD_PIXELS: derived asset address belongs to different data");
    const retained: unknown = JSON.parse(row.rejectedAssetIdsJson ?? "[]");
    if (!Array.isArray(retained) || !retained.every(id => typeof id === "string")) throw Error("HEAD_PIXELS: retained image inventory is invalid");
    await tx.auditLog.create({ data: { id: auditId, actorType: "SYSTEM", action: HEAD_PIXEL_CORRECTION_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ version: HEAD_PIXEL_CORRECTION_VERSION, variantId: row.id, marker, candidateSha256, assetId, changedPixels: corrected.changed,
        previousJudgeJson: row.judgeJson, previousAssetId: row.assetId, previousGeometry: { rectJson: row.rectJson, hitRectJson: row.hitRectJson, headAnchorJson: row.headAnchorJson },
        previousCostCents: row.costCents, providerCalls: 0, attemptsPreserved: true, cyclesPreserved: true, requestsPreserved: true }) } });
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: "GENERATED", assetId, ...geometry, lastError: null, judgeJson: JSON.stringify(receipt),
      rejectedAssetIdsJson: JSON.stringify([...new Set([...retained, row.assetId!])]) } });
    await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "GENERATED", spriteKind: "image", spriteAssetId: assetId } });
    await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: "NEEDS_REGENERATION", configJson: null } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** Publication re-derives the correction from authenticated paid bytes: the archived
 * paid answer and its heads, the settled RAW and alias chain, the baseline asset, the
 * pinned board art, and the candidate's own bytes and geometry. Nothing is trusted
 * from the mutable receipt alone. */
export async function headPixelCorrectionPublicationMatches(db: Prisma.TransactionClient, input: { gameId: string; sceneVersion: number; hideId: string;
  variantId: string; imageSha256: string; geometrySha256: string; identitySha256: string; assetId: string; judgeJson: string | null },
  readArt: NonNullable<LocalPatchHideDeps["readBoardArt"]> = readShippedBoardArt): Promise<boolean> {
  try {
    const j = JSON.parse(input.judgeJson ?? "null"), marker = headPixelCorrectionSchema.parse(j?.headPixelCorrection);
    if (j.retainedNormalHead !== undefined || marker.candidateSha256 !== input.imageSha256 || j.judgedSha256 !== input.imageSha256
      || marker.geometrySha256 !== input.geometrySha256 || marker.identitySha256 !== input.identitySha256) return false;
    const audit = await db.auditLog.findUnique({ where: { id: marker.auditId } }), meta = audit && JSON.parse(audit.metaJson ?? "null");
    if (!audit || audit.actorType !== "SYSTEM" || audit.action !== HEAD_PIXEL_CORRECTION_ACTION || audit.entityType !== "Game" || audit.entityId !== input.gameId
      || meta?.variantId !== input.variantId || JSON.stringify(meta?.marker) !== JSON.stringify(marker) || meta.assetId !== input.assetId) return false;
    // The paid answer and its located heads, read from the archived receipt and its settled bill.
    const previous = JSON.parse(meta.previousJudgeJson), proof = previous.boardReview.dual as DualReviewProof;
    if (previous.judgedSha256 !== marker.baselineShippingSha256 || previous.geometrySha256 !== marker.baselineGeometrySha256 || meta.previousAssetId !== marker.baselineAssetId
      || proof.quality.requestKey !== marker.headAnswer.requestKey || proof.quality.fingerprint !== marker.headAnswer.fingerprint
      || sha256Bytes(Buffer.from(proof.quality.raw ?? "")) !== marker.headAnswer.rawSha256 || JSON.stringify(proof.quality.headEvidence?.returned) !== JSON.stringify(marker.returned)
      || JSON.stringify(locatedHeads(proof).heads) !== JSON.stringify(marker.heads)
      || JSON.stringify(previous.retainedNormalHead) !== JSON.stringify(marker.alias?.retainedNormalHead)) return false;
    const paid = await verifiedDualStage(db, input.gameId + ":board-wizard", proof.quality, "scene-quality", { allowSingle: true,
      authoredReviewBinding: authoredLocalPatchReviewBinding({ hideId: input.hideId, imageSha256: previous.judgedSha256, geometrySha256: previous.geometrySha256,
        identitySha256: input.identitySha256, authoredReturn: proof.authoredReturn }) });
    if (!paid) return false;
    const raw = await readSettledTargetRaw(db, input.gameId, marker.sourceRequestKey);
    if (raw.kept.operationFingerprint !== marker.sourceFingerprint || raw.kept.payloadSha256 !== marker.sourcePayloadSha256
      || sha256Bytes(raw.normalized) !== marker.normalizedRawSha256) return false;
    const blobOf = async (assetId: string) => { const asset = await db.asset.findUnique({ where: { id: assetId } });
      if (!asset || asset.deletedAt || asset.status !== "READY" || asset.type !== "TARGET_SPRITE" || asset.providerRequestId !== input.gameId) return null;
      const blob = await db.fileBlob.findUnique({ where: { key: asset.storagePath } }); return blob ? Buffer.from(blob.data) : null; };
    const baseline = await blobOf(marker.baselineAssetId), candidate = await blobOf(input.assetId);
    if (!baseline || !candidate || sha256Bytes(baseline) !== marker.baselineShippingSha256 || sha256Bytes(candidate) !== input.imageSha256) return false;
    const context = await resolveLocalPatchBoardsForGame(db, input.gameId, input.sceneVersion);
    const board = context.boards.find(b => b.hides.some(h => h.id === input.hideId)), hide = board?.hides.find(h => h.id === input.hideId);
    if (!board || !hide) return false;
    const definition = sceneBySlug(board.board, input.sceneVersion), art = await readArt(board.art, definition.art.sha256 ?? "");
    if (sha256Bytes(art) !== marker.boardArtSha256) return false;
    const corrected = await correctedShipping({ raw: raw.normalized, board: art, crop: cropOf(hide), baseline, returned: marker.returned, heads: marker.heads });
    if (!corrected.png.equals(candidate)) return false;
    const measured = await localPatchGeometry({ hide, boardPng: art, patchPng: candidate, board: definition.art, contentVersion: input.sceneVersion });
    return localPatchPublicationGeometryHash({ rectJson: JSON.stringify(measured.geometry.rect), hitRectJson: JSON.stringify(measured.geometry.hitRect),
      headAnchorJson: JSON.stringify(measured.geometry.anchor) }) === input.geometrySha256;
  } catch { return false; }
}

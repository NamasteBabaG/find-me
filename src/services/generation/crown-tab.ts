import { Prisma } from "@prisma/client";
import sharp from "sharp";
import type { Container } from "../container";
import { DbStorage } from "../../infra/storage/db";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { CROWN_TAB_ACTION, CROWN_TAB_VERSION, composeCrownTab, crownTabAuthorityFor, crownTabCandidate, crownTabRect, crownTabSchema, crownTabSeam,
  type CrownTab, type CrownTabAuthority } from "../../domain/generation/crown-tab";
import { targetHeadAnswerSchema, type TargetHeadEvidence } from "../../domain/generation/target-head-return";
import { cropOf, maskForHide, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { LOCAL_PATCH_RETURN_FEATHER } from "../../domain/scene/local-patch-return-region";
import { resolveLocalPatchBoardsForGame, sourcePlacementForHide, type TrustedSourcePlacementContext } from "./source-placement-release";
import { readShippedBoardArt, LOCAL_PATCH_PROVIDER, type LocalPatchHideDeps } from "./local-patch-hide";
import { sceneBySlug } from "../scene-catalog.service";
import { localPatchGeometry } from "./local-patch-geometry";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { authoredLocalPatchReviewBinding } from "./local-patch-authored-return";
import { readQualityStage, verifiedDualStage, type DualReviewProof } from "./local-patch-dual-evidence";
import { otherPaidRolesPass } from "./head-pixel-correction";
import { readSettledTargetRaw, singleReviewHeadEvidenceMatches } from "./single-review-head-evidence";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";
import { sha256Bytes } from "./fixed-sprite";

const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
const rgba = async (png: Buffer) => { const { data, info } = await sharp(png, { limitInputPixels: 8_294_400 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels }; };
type Candidate = { id: string; status: string; assetId: string | null; judgeJson: string | null };
type Rect = { left: number; top: number; width: number; height: number };

/** The located crown, read only from the exact paid answer in this proof. */
function locatedCrown(proof: DualReviewProof) {
  const document = JSON.parse(String(proof.quality.raw ?? "null").trim().replace(/^```(?:json)?[\t ]*\r?\n([\s\S]*?)\r?\n```$/i, "$1"));
  return targetHeadAnswerSchema.parse(document?.head);
}
/** Every registered original head of this window, crop-local: a tab never covers one. */
function registeredHeads(context: TrustedSourcePlacementContext, hide: LocalPatchHide): Rect[] {
  const crop = cropOf(hide);
  return (sourcePlacementForHide(context, hide.id)?.sourceNeighbors?.contract.neighbors ?? [])
    .map(n => ({ left: n.head.left - crop.left, top: n.head.top - crop.top, width: n.head.width, height: n.head.height }));
}
/** The authority of this exact window: the shipped source file (the hash `readShippedBoardArt`
 * verified before decoding it) and the authored geometry. */
function authorityOf(hide: LocalPatchHide, sourceSha256: string | undefined): CrownTabAuthority | null {
  return hide.returnRect && sourceSha256 ? crownTabAuthorityFor({ hideId: hide.id, sourceSha256, crop: cropOf(hide), child: maskForHide(hide), returned: hide.returnRect }) : null;
}
/** The tab's shipping from authenticated bytes: same RAW, same scene, same baseline, same tab. */
async function tabbedShipping(input: { raw: Buffer; board: Buffer; crop: ReturnType<typeof cropOf>; baseline: Buffer; returned: Rect; tab: Rect }) {
  const scene = await rgba(await sharp(input.board, { limitInputPixels: 8_294_400 }).extract(input.crop).png().toBuffer()), raw = await rgba(input.raw);
  const seam = crownTabSeam({ raw, scene, tab: input.tab, returned: input.returned, band: LOCAL_PATCH_RETURN_FEATHER });
  const { pixels, changed } = composeCrownTab({ raw, scene, baseline: await rgba(input.baseline), returned: input.returned, tab: input.tab, band: LOCAL_PATCH_RETURN_FEATHER });
  return { png: await sharp(pixels, { raw: { width: input.crop.width, height: input.crop.height, channels: 4 } }).png().toBuffer(), changed, seam };
}

/** Free, finite and bounded to ONE candidate per call: a paid painting whose complete
 * crown was drawn above its whole authored window gets that crown back over a scene
 * the window's authority classifies as behind it, then a fresh ordinary MEDIUM decides.
 * Nothing is bought; counters, history and reserves are untouched. True when changed. */
export async function correctCrownTabs(c: Container, gameId: string, rows: readonly Candidate[], fence: (tx: Prisma.TransactionClient) => Promise<void>,
  readArt: NonNullable<LocalPatchHideDeps["readBoardArt"]> = readShippedBoardArt): Promise<boolean> {
  for (const candidate of rows.filter(crownTabCandidate)) if (await tabOne(c, gameId, candidate, fence, readArt)) return true;
  return false;
}

async function tabOne(c: Container, gameId: string, candidate: Candidate, fence: (tx: Prisma.TransactionClient) => Promise<void>,
  readArt: NonNullable<LocalPatchHideDeps["readBoardArt"]>): Promise<boolean> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, orders: true } }), child = game?.childProfile;
  if (!game || !child || game.status !== "TARGETS_GENERATING" || game.deletedAt || game.configJson || game.readyAt || !game.ownerId
    || child.deletedAt || child.ownerId !== game.ownerId || !child.identityAssetId
    || !game.orders.some(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt)
    || game.orders.some(o => o.paymentStatus === "REFUNDED" || o.refundedAt)) return false;
  const row = await c.db.targetVariantAsset.findUnique({ where: { id: candidate.id }, include: { targetInstance: { include: { gameScene: true } } } });
  if (!row || !crownTabCandidate(row) || row.targetInstance.gameScene.gameId !== gameId) return false;
  const j = JSON.parse(row.judgeJson!), proof = j.boardReview.dual as DualReviewProof, scene = row.targetInstance.gameScene;
  const context = await resolveLocalPatchBoardsForGame(c.db, gameId, scene.sceneVersion);
  const board = context.boards.find(b => b.board === scene.sceneSlug), hide = board?.hides.find(h => h.targetId === row.targetInstance.targetId);
  const identity = await c.db.asset.findUnique({ where: { id: child.identityAssetId } });
  if (!board || !hide || j.hide !== hide.id || proof.hideId !== hide.id || proof.imageSha256 !== j.judgedSha256 || proof.geometrySha256 !== j.geometrySha256
    || j.geometrySha256 !== localPatchPublicationGeometryHash(row) || !identity || identity.ownerId !== game.ownerId || identity.type !== "IDENTITY_SHEET"
    || identity.status !== "READY" || identity.visibility !== "PRIVATE" || identity.deletedAt) return false;
  const definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion), art = await readArt(board.art, definition.art.sha256 ?? "");
  const authority = authorityOf(hide, definition.art.sha256);
  if (!authority) return false;
  const identitySha256 = sha256Bytes(await c.storage.get(identity.storagePath));
  if (proof.identitySha256 !== identitySha256) return false;
  const baselineAsset = await c.db.asset.findUniqueOrThrow({ where: { id: row.assetId! } });
  if (baselineAsset.deletedAt || baselineAsset.status !== "READY" || baselineAsset.type !== "TARGET_SPRITE" || baselineAsset.visibility !== "GAME"
    || baselineAsset.ownerId !== game.ownerId || baselineAsset.providerRequestId !== gameId) return false;
  const baseline = await c.storage.get(baselineAsset.storagePath);
  if (sha256Bytes(baseline) !== j.judgedSha256) return false;
  // Every paid role and the head evidence, exactly as paid; only the crown cut may refuse.
  const binding = { gameId, hideId: hide.id, variantId: row.id, imageSha256: j.judgedSha256, geometrySha256: j.geometrySha256, identitySha256,
    sceneVersion: scene.sceneVersion, attempts: row.attempts, judgeJson: row.judgeJson, assetId: row.assetId!, identityAssetId: identity.id };
  const evidence = proof.quality.headEvidence as TargetHeadEvidence;
  if (JSON.stringify(evidence?.returned) !== JSON.stringify(authority.returned) || !await singleReviewHeadEvidenceMatches(c.db, binding, evidence)) return false;
  const options = { allowSingle: true, authoredReviewBinding: authoredLocalPatchReviewBinding({ ...binding, authoredReturn: proof.authoredReturn }) };
  const paid = await verifiedDualStage(c.db, gameId + ":board-wizard", proof.quality, "scene-quality", options);
  const continuity = await verifiedDualStage(c.db, gameId + ":board-wizard", proof.continuity!, "head-continuity", options);
  const subject = await verifiedDualStage(c.db, gameId + ":board-wizard", proof.subject!, "scene-quality", options);
  if (!paid || !continuity || !subject || !paid.bytes.equals(continuity.bytes) || !paid.bytes.equals(subject.bytes)) return false;
  if (!await otherPaidRolesPass(c.db, binding, proof) || JSON.stringify(readQualityStage(proof.quality, hide.id, scene.sceneVersion)) !== JSON.stringify(j.verdict)) return false;
  const answer = locatedCrown(proof), tab = crownTabRect(evidence.returned, answer.rawHead, registeredHeads(context, hide));
  if (typeof tab === "string") return false;
  const raw = await readSettledTargetRaw(c.db, gameId, evidence.sourceRequestKey);
  let shipped;
  try { shipped = await tabbedShipping({ raw: raw.normalized, board: art, crop: cropOf(hide), baseline, returned: evidence.returned, tab }); }
  catch { return false; }
  if (!shipped.seam.usable || !shipped.changed) return false;
  const candidateSha256 = sha256Bytes(shipped.png);
  const measured = await localPatchGeometry({ hide, boardPng: art, patchPng: shipped.png, board: definition.art, contentVersion: scene.sceneVersion });
  const geometry = { rectJson: JSON.stringify(measured.geometry.rect), hitRectJson: JSON.stringify(measured.geometry.hitRect), headAnchorJson: JSON.stringify(measured.geometry.anchor) };
  const auditId = "aud_crown_tab_" + hash([gameId, row.id, evidence.sourceRequestKey, j.judgedSha256, tab, proof.quality.requestKey]).slice(0, 40);
  if (await c.db.auditLog.findUnique({ where: { id: auditId } })) return false;
  const marker: CrownTab = crownTabSchema.parse({ version: CROWN_TAB_VERSION, auditId, hideId: hide.id, authoritySha256: hash(authority),
    sourceRequestKey: evidence.sourceRequestKey, sourceFingerprint: evidence.sourceFingerprint, sourcePayloadSha256: evidence.sourcePayloadSha256,
    normalizedRawSha256: evidence.normalizedRawSha256, baselineAssetId: baselineAsset.id, baselineShippingSha256: j.judgedSha256,
    baselineGeometrySha256: j.geometrySha256, boardArtSha256: sha256Bytes(art), returned: evidence.returned, rawHead: answer.rawHead, tab,
    band: LOCAL_PATCH_RETURN_FEATHER, seam: { borderMeanDiff: shipped.seam.borderMeanDiff, shift: shipped.seam.shift },
    headAnswer: { requestKey: proof.quality.requestKey, fingerprint: proof.quality.fingerprint, rawSha256: sha256Bytes(Buffer.from(proof.quality.raw ?? "")) },
    candidateSha256, geometrySha256: localPatchPublicationGeometryHash(geometry), identitySha256 });
  const assetId = "ast_ctab_" + hash([gameId, hide.id, CROWN_TAB_VERSION, candidateSha256]).slice(0, 24), key = `game/${assetId}.png`;
  const worldId = gameId + ":board-wizard", stored = await PrismaWorldBudgetStore.forReadOnlyTransaction(c.db).read(worldId);
  if (!stored) return false;
  // The paid answer's refusal is not reused either way: a fresh ordinary MEDIUM decides the new shipping.
  const receipt = { ...j, crownTab: marker, judgedSha256: candidateSha256, geometrySha256: marker.geometrySha256,
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
      visibility: "GAME", status: "READY", storagePath: key, mimeType: "image/png", width: 512, height: 768, bytes: shipped.png.length, costCents: 0,
      provider: LOCAL_PATCH_PROVIDER, providerRequestId: gameId } });
    const blob = await new DbStorage(tx).put(key, shipped.png, "image/png").then(() => tx.fileBlob.findUnique({ where: { key } }));
    if (saved.ownerId !== game.ownerId || saved.storagePath !== key || saved.providerRequestId !== gameId || saved.type !== "TARGET_SPRITE"
      || !blob || sha256Bytes(Buffer.from(blob.data)) !== candidateSha256) throw Error("CROWN_TAB: derived asset address belongs to different data");
    const retained: unknown = JSON.parse(row.rejectedAssetIdsJson ?? "[]");
    if (!Array.isArray(retained) || !retained.every(id => typeof id === "string")) throw Error("CROWN_TAB: retained image inventory is invalid");
    await tx.auditLog.create({ data: { id: auditId, actorType: "SYSTEM", action: CROWN_TAB_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ version: CROWN_TAB_VERSION, variantId: row.id, marker, candidateSha256, assetId, changedPixels: shipped.changed, behind: authority.behind,
        previousJudgeJson: row.judgeJson, previousAssetId: row.assetId, previousGeometry: { rectJson: row.rectJson, hitRectJson: row.hitRectJson, headAnchorJson: row.headAnchorJson },
        previousCostCents: row.costCents, providerCalls: 0, attemptsPreserved: true, cyclesPreserved: true, requestsPreserved: true }) } });
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { status: "GENERATED", assetId, ...geometry, lastError: null, judgeJson: JSON.stringify(receipt),
      rejectedAssetIdsJson: JSON.stringify([...new Set([...retained, row.assetId!])]) } });
    await tx.targetInstance.update({ where: { id: row.targetInstanceId }, data: { status: "GENERATED", spriteKind: "image", spriteAssetId: assetId } });
    await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: "NEEDS_REGENERATION", configJson: null } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/** The archived receipt the tab was derived from, as its own audit row recorded it. */
export async function crownTabBaseline(db: Prisma.TransactionClient, gameId: string, marker: CrownTab) {
  const audit = await db.auditLog.findUnique({ where: { id: marker.auditId } }), meta = audit && JSON.parse(audit.metaJson ?? "null");
  if (!audit || audit.actorType !== "SYSTEM" || audit.actorId !== null || audit.action !== CROWN_TAB_ACTION || audit.entityType !== "Game" || audit.entityId !== gameId
    || JSON.stringify(meta?.marker) !== JSON.stringify(marker) || meta.previousAssetId !== marker.baselineAssetId) return null;
  const previous = JSON.parse(meta.previousJudgeJson);
  return previous?.judgedSha256 === marker.baselineShippingSha256 && previous.geometrySha256 === marker.baselineGeometrySha256
    ? { previousJudgeJson: meta.previousJudgeJson as string, previous, assetId: meta.assetId as string, variantId: meta.variantId as string } : null;
}

/** Publication re-derives the tab from authenticated paid bytes: the archived paid answer
 * and its located crown, the settled RAW, the baseline asset, the pinned board art, the
 * window's authority and registered heads, and the candidate's own bytes and geometry. */
export async function crownTabPublicationMatches(db: Prisma.TransactionClient, input: { gameId: string; sceneVersion: number; hideId: string;
  variantId?: string; imageSha256: string; geometrySha256: string; identitySha256: string; assetId?: string; judgeJson: string | null },
  readArt: NonNullable<LocalPatchHideDeps["readBoardArt"]> = readShippedBoardArt): Promise<boolean> {
  try {
    const j = JSON.parse(input.judgeJson ?? "null"), marker = crownTabSchema.parse(j?.crownTab);
    if (marker.hideId !== input.hideId || marker.candidateSha256 !== input.imageSha256 || j.judgedSha256 !== input.imageSha256
      || marker.geometrySha256 !== input.geometrySha256 || marker.identitySha256 !== input.identitySha256) return false;
    const base = await crownTabBaseline(db, input.gameId, marker);
    if (!base || input.variantId !== undefined && base.variantId !== input.variantId || input.assetId !== undefined && base.assetId !== input.assetId) return false;
    const proof = base.previous.boardReview.dual as DualReviewProof;
    if (proof.quality.requestKey !== marker.headAnswer.requestKey || proof.quality.fingerprint !== marker.headAnswer.fingerprint
      || sha256Bytes(Buffer.from(proof.quality.raw ?? "")) !== marker.headAnswer.rawSha256 || JSON.stringify(proof.quality.headEvidence?.returned) !== JSON.stringify(marker.returned)
      || JSON.stringify(locatedCrown(proof).rawHead) !== JSON.stringify(marker.rawHead)) return false;
    const paid = await verifiedDualStage(db, input.gameId + ":board-wizard", proof.quality, "scene-quality", { allowSingle: true,
      authoredReviewBinding: authoredLocalPatchReviewBinding({ hideId: input.hideId, imageSha256: base.previous.judgedSha256, geometrySha256: base.previous.geometrySha256,
        identitySha256: input.identitySha256, authoredReturn: proof.authoredReturn }) });
    if (!paid) return false;
    const raw = await readSettledTargetRaw(db, input.gameId, marker.sourceRequestKey);
    if (raw.kept.operationFingerprint !== marker.sourceFingerprint || raw.kept.payloadSha256 !== marker.sourcePayloadSha256
      || sha256Bytes(raw.normalized) !== marker.normalizedRawSha256) return false;
    const blobOf = async (assetId: string) => { const asset = await db.asset.findUnique({ where: { id: assetId } });
      if (!asset || asset.deletedAt || asset.status !== "READY" || asset.type !== "TARGET_SPRITE" || asset.providerRequestId !== input.gameId) return null;
      const blob = await db.fileBlob.findUnique({ where: { key: asset.storagePath } }); return blob ? Buffer.from(blob.data) : null; };
    const baseline = await blobOf(marker.baselineAssetId), candidate = await blobOf(base.assetId);
    if (!baseline || !candidate || sha256Bytes(baseline) !== marker.baselineShippingSha256 || sha256Bytes(candidate) !== input.imageSha256) return false;
    const context = await resolveLocalPatchBoardsForGame(db, input.gameId, input.sceneVersion);
    const board = context.boards.find(b => b.hides.some(h => h.id === input.hideId)), hide = board?.hides.find(h => h.id === input.hideId);
    if (!board || !hide) return false;
    const definition = sceneBySlug(board.board, input.sceneVersion), art = await readArt(board.art, definition.art.sha256 ?? "");
    const authority = authorityOf(hide, definition.art.sha256);
    if (!authority || hash(authority) !== marker.authoritySha256 || sha256Bytes(art) !== marker.boardArtSha256) return false;
    const tab = crownTabRect(marker.returned, marker.rawHead, registeredHeads(context, hide));
    if (typeof tab === "string" || JSON.stringify(tab) !== JSON.stringify(marker.tab)) return false;
    const shipped = await tabbedShipping({ raw: raw.normalized, board: art, crop: cropOf(hide), baseline, returned: marker.returned, tab });
    if (!shipped.seam.usable || !shipped.png.equals(candidate)) return false;
    const measured = await localPatchGeometry({ hide, boardPng: art, patchPng: candidate, board: definition.art, contentVersion: input.sceneVersion });
    return localPatchPublicationGeometryHash({ rectJson: JSON.stringify(measured.geometry.rect), hitRectJson: JSON.stringify(measured.geometry.hitRect),
      headAnchorJson: JSON.stringify(measured.geometry.anchor) }) === input.geometrySha256;
  } catch { return false; }
}

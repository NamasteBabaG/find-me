import { Prisma } from "@prisma/client";
import sharp from "sharp";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { LOCAL_PATCH_CROP, cropOf, maskForHide, type LocalPatchBoard, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { isLocalPatchStrictVersion } from "../../domain/scene/local-patch-catalog";
import { LOCAL_PATCH_MAX_ATTEMPTS } from "../../domain/scene/local-patch-attempts";
import { sceneBySlug } from "../scene-catalog.service";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, readShippedBoardArt, type LocalPatchHideDeps } from "./local-patch-hide";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { composeBoundedLocalPatch, LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { localPatchGeometry } from "./local-patch-geometry";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
import { LOCAL_PATCH_RESERVE, RETAINED_RENDER_VERSION } from "./local-patch-render";
import { sameChargeEvidence } from "./world-budget";
import { sha256Bytes } from "./fixed-sprite";

export const LOCAL_PATCH_RECOMPOSE_ACTION = "local-patch:recomposed-from-paid-render";
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
function demand(value: unknown, reason: string): asserts value { if (!value) throw new Error(`LOCAL_PATCH_RECOMPOSE: ${reason}`); }

/** Pending attempts use the ordinary same-key purchase replay and account once.
 * Only concluded rows need this free migration; old v6/v7 are never touched. */
export function localPatchNeedsRecomposition(row: { status: string; attempts: number; judgeJson: string | null }, contentVersion: number): boolean {
  if (!isLocalPatchStrictVersion(contentVersion) || !["GENERATED", "FAILED"].includes(row.status) || row.attempts < 1) return false;
  try {
    const receipt = JSON.parse(row.judgeJson ?? "null");
    // Provider/schema/transport refusals have no recoverable compositor pixels.
    // They keep the ordinary bounded retry path, not a permanent refresh hold.
    if (row.status === "FAILED" && typeof receipt?.renderFault === "string" && !/^quality-seam(?::|$)/.test(receipt.renderFault)) return false;
    return receipt?.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION;
  }
  catch { return true; }
}

/** No render callback, reservation or settlement exists in this API. The
 * immutable paid payload is authenticated against its existing settled bill,
 * then only derived pixels and render-completion bindings are refreshed. */
export async function recomposeLocalPatchHide(c: Container, input: {
  gameId: string; sceneId: string; board: LocalPatchBoard; hide: LocalPatchHide;
}, deps: { fence(tx: Prisma.TransactionClient): Promise<void>; readBoardArt?: LocalPatchHideDeps["readBoardArt"] }): Promise<boolean> {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only durable QA imagery may be recomposed");
  const { gameId, hide, board } = input;
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true } });
  const child = game.childProfile;
  const scene = await c.db.gameScene.findUniqueOrThrow({ where: { id: input.sceneId } });
  demand(game.status === "TARGETS_GENERATING" && game.styleVersion === "local-patch-world-v1" && !game.deletedAt && !game.configJson
    && game.ownerId && child && !child.deletedAt && child.ownerId === game.ownerId && child.identityAssetId && child.ageYears,
  "A live owned unpublished local-patch game is required");
  demand(scene.gameId === gameId && scene.sceneSlug === board.board && isLocalPatchStrictVersion(scene.sceneVersion)
    && board.hides.some(item => item.id === hide.id && item.targetId === hide.targetId), "The original v8 hide must belong to this game");
  const instance = await c.db.targetInstance.findUniqueOrThrow({ where: { gameSceneId_targetId: { gameSceneId: scene.id, targetId: hide.targetId } } });
  const row = await c.db.targetVariantAsset.findUniqueOrThrow({ where: { targetInstanceId_variant: { targetInstanceId: instance.id, variant: LOCAL_PATCH_VARIANT } } });
  if (!localPatchNeedsRecomposition(row, scene.sceneVersion)) return false;
  demand(row.provider === LOCAL_PATCH_PROVIDER && row.attempts <= LOCAL_PATCH_MAX_ATTEMPTS, "The original bounded image attempt is required");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  demand(identity.ownerId === game.ownerId && identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE"
    && identity.status === "READY" && !identity.deletedAt, "Canonical identity is unavailable or unrelated");
  const sheet = await c.storage.get(identity.storagePath), identitySha256 = sha256Bytes(sheet);
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(gameId);
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await requireBoardWizardIdentityApproval(c, budget, { gameId, identityAssetId: identity.id, sheetSha256: identitySha256,
    catalogSha256, photoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears,
    crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null, contentVersion: scene.sceneVersion });
  const definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
  demand(`public${definition.art.base}` === board.art, "The original authored artwork changed");
  const original = await (deps.readBoardArt ?? readShippedBoardArt)(board.art, definition.art.sha256 ?? "");
  const crop = cropOf(hide), store = new LocalPatchRetainedPurchaseStore(c, gameId, budget);
  const inspected: Record<string, unknown>[] = [];
  const inspect = async (attempt: number, required: boolean) => {
    const requestKey = `${hide.id}:${hide.pose}:render:${attempt}`;
    const bill = await budget.readRequest(worldId, requestKey);
    if (!bill || (bill.state !== "settled" && bill.state !== "linked")) {
      demand(!required, "The current raw render has no matching settled image bill; no repurchase is allowed");
      inspected.push({ requestKey, skipped: "no-settled-bill" }); return null;
    }
    demand(bill.scope === "image" && bill.requestKey === requestKey && bill.reserveMicroUsd === LOCAL_PATCH_RESERVE.renderMicroUsd
      && bill.conflicts.length === 0, "The settled image bill does not match this bounded render");
    // Missing older evidence is not a new purchase opportunity. Corruption is
    // deliberately not caught: even an optional candidate must be trustworthy.
    const retained = await store.get(worldId, requestKey);
    if (!retained) {
      demand(!required, "Retained image and original bill do not match");
      inspected.push({ requestKey, skipped: "no-retained-image" }); return null;
    }
    demand(retained.worldId === worldId && retained.requestKey === requestKey && retained.scope === "image" && retained.operationFingerprint === bill.operationFingerprint
      && retained.evidence && sameChargeEvidence(retained.evidence, bill.evidence), "Retained image and original bill do not match");
    const envelope = JSON.parse(retained.bytes.toString()) as { version?: string; bytesBase64?: unknown; rejected?: unknown };
    demand(envelope.version === RETAINED_RENDER_VERSION, "Retained provider envelope version is invalid");
    if (envelope.rejected !== null || typeof envelope.bytesBase64 !== "string" || !envelope.bytesBase64.length) {
      demand(!required, "The provider did not retain a usable image; no visual approval can be invented");
      inspected.push({ requestKey, skipped: "provider-refused-image" }); return null;
    }
    const raw = Buffer.from(envelope.bytesBase64, "base64");
    demand(raw.toString("base64") === envelope.bytesBase64, "Retained provider image encoding is corrupt");
    const rawMeta = await sharp(raw, { limitInputPixels: 8_294_400 }).metadata();
    demand(rawMeta.format === "png" && (rawMeta.pages ?? 1) === 1, "The retained image is not one PNG");
    const patch = await sharp(raw, { limitInputPixels: 8_294_400 }).resize(LOCAL_PATCH_CROP.width, LOCAL_PATCH_CROP.height, { fit: "fill" }).png().toBuffer();
    const result = await composeBoundedLocalPatch(original, crop, patch, maskForHide(hide));
    inspected.push({ requestKey, payloadSha256: retained.payloadSha256, usable: result.usable,
      report: result.report, compositionPermission: result.compositionPermission });
    return { requestKey, retained, result };
  };
  // Latest first, then at most the already-paid earlier attempts. Keep the row's
  // high-water attempt unchanged even when the selected pixels came from #1.
  const latest = await inspect(row.attempts, true);
  demand(latest, "The latest paid render must be authenticated first");
  let selected = latest;
  if (!latest.result.usable) for (let attempt = row.attempts - 1; attempt >= 1; attempt--) {
    const prior = await inspect(attempt, false);
    if (prior?.result.usable) { selected = prior; break; }
  }
  const { requestKey, retained, result } = selected;
  const recompositionSelection = {
    reason: selected !== latest ? "latest-composition-refused-earlier-paid-image-usable"
      : latest.result.usable ? "latest-paid-image-usable" : "latest-composition-refused-no-earlier-usable",
    latestRequestKey: latest.requestKey,
    latestRawRefusal: latest.result.usable ? null : { usable: false, report: latest.result.report, compositionPermission: latest.result.compositionPermission },
    inspected,
  };
  const shipping = await sharp(result.candidate).extract(crop).png().toBuffer(), imageSha256 = sha256Bytes(shipping);
  const measured = await localPatchGeometry({ hide, boardPng: original, patchPng: shipping, board: definition.art, contentVersion: scene.sceneVersion });
  const geometry = { rectJson: JSON.stringify(measured.geometry.rect), hitRectJson: JSON.stringify(measured.geometry.hitRect), headAnchorJson: JSON.stringify(measured.geometry.anchor) };
  const assetId = `ast_lpc_${hash([gameId, hide.id, LOCAL_PATCH_COMPOSITION_VERSION, imageSha256, result.usable]).slice(0, 24)}`;
  const key = `${result.usable ? "game" : "private"}/${assetId}.png`;
  const auditId = `aud_lpc_${hash([gameId, row.id, row.attempts, LOCAL_PATCH_COMPOSITION_VERSION, imageSha256]).slice(0, 28)}`;
  const judgeJson = JSON.stringify({ verdict: null, wireFault: null, seam: result.report, compositionPermission: result.compositionPermission,
    compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, judgedSha256: imageSha256, geometrySha256: localPatchPublicationGeometryHash(geometry),
    geometryBasis: measured.basis, measuredFraction: Number(measured.measuredFraction.toFixed(4)), hide: hide.id, pose: hide.pose,
    reviewState: result.usable ? "pending-board-review" : "composition-refused", renderFault: result.usable ? null : `quality-seam: ${result.report.reason}`,
    renderPurchase: { requestKey, operationFingerprint: retained.operationFingerprint, payloadSha256: retained.payloadSha256 },
    recompositionSelection,
  });
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId); await deps.fence(tx);
    const currentGame = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const currentChild = await tx.childProfile.findUniqueOrThrow({ where: { id: child.id } });
    const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: row.id } });
    const currentScene = await tx.gameScene.findUniqueOrThrow({ where: { id: scene.id } });
    const currentIdentity = await tx.asset.findUniqueOrThrow({ where: { id: identity.id } });
    demand(currentGame.ownerId === game.ownerId && currentGame.childProfileId === child.id && currentGame.status === "TARGETS_GENERATING" && !currentGame.configJson
      && !currentChild.deletedAt && currentChild.ownerId === game.ownerId && currentChild.identityAssetId === identity.id
      && currentChild.ageYears === child.ageYears && currentChild.originalPhotoAssetId === child.originalPhotoAssetId && currentChild.photoCropJson === child.photoCropJson
      && currentScene.sceneVersion === scene.sceneVersion, "Identity, ownership or scene changed during recomposition");
    demand(currentIdentity.ownerId === game.ownerId && currentIdentity.type === "IDENTITY_SHEET" && currentIdentity.visibility === "PRIVATE"
      && currentIdentity.status === "READY" && !currentIdentity.deletedAt && currentIdentity.storagePath === identity.storagePath,
    "Canonical identity was withdrawn during recomposition");
    demand(current.status === row.status && current.attempts === row.attempts && current.assetId === row.assetId
      && current.judgeJson === row.judgeJson && current.costCents === row.costCents, "Target changed during recomposition");
    const identityBlob = await tx.fileBlob.findUnique({ where: { key: identity.storagePath } });
    demand(identityBlob && sha256Bytes(Buffer.from(identityBlob.data)) === identitySha256, "Canonical identity bytes changed during recomposition");
    const saved = await tx.asset.upsert({ where: { id: assetId }, update: {}, create: { id: assetId, ownerId: game.ownerId,
      type: result.usable ? "TARGET_SPRITE" : "REJECTED_PATCH", visibility: result.usable ? "GAME" : "PRIVATE", status: "READY", storagePath: key,
      mimeType: "image/png", width: crop.width, height: crop.height, bytes: shipping.length, costCents: 0,
      provider: LOCAL_PATCH_PROVIDER, providerRequestId: gameId } });
    demand(saved.ownerId === game.ownerId && saved.storagePath === key && saved.status === "READY" && !saved.deletedAt
      && saved.type === (result.usable ? "TARGET_SPRITE" : "REJECTED_PATCH") && saved.providerRequestId === gameId, "Derived asset address belongs to different data");
    const blob = await tx.fileBlob.upsert({ where: { key }, update: {}, create: { key, data: new Uint8Array(shipping), contentType: "image/png" } });
    demand(sha256Bytes(Buffer.from(blob.data)) === imageSha256, "Derived blob digest changed");
    const previousIds: unknown = JSON.parse(row.rejectedAssetIdsJson ?? "[]");
    demand(Array.isArray(previousIds) && previousIds.every(id => typeof id === "string"), "Retained image inventory is invalid");
    await tx.auditLog.create({ data: { id: auditId, actorType: "SYSTEM", action: LOCAL_PATCH_RECOMPOSE_ACTION, entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ variantId: row.id, hideId: hide.id, attempts: row.attempts, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION,
        requestKey, operationFingerprint: retained.operationFingerprint, payloadSha256: retained.payloadSha256, identitySha256, recompositionSelection,
        previousAssetId: row.assetId, previousJudgeJson: row.judgeJson, previousCostCents: row.costCents,
        assetId, imageSha256, geometrySha256: localPatchPublicationGeometryHash(geometry), usable: result.usable }) } });
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: { ...geometry, judgeJson,
      status: result.usable ? "GENERATED" : "FAILED", assetId: result.usable ? assetId : row.assetId,
      lastError: result.usable ? null : `quality-seam: ${result.report.reason}`.slice(0, 500),
      rejectedAssetIdsJson: JSON.stringify([...new Set([...previousIds, ...(row.assetId ? [row.assetId] : []), ...(!result.usable ? [assetId] : [])])]) } });
    await tx.targetInstance.update({ where: { id: instance.id }, data: { status: result.usable ? "GENERATED" : "FAILED",
      ...(result.usable ? { spriteKind: "image", spriteAssetId: assetId } : {}) } });
    await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: "NEEDS_REGENERATION", configJson: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return true;
}

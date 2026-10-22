import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import sharp from "sharp";
import type { LocalPatchBoard, LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { cropOf, maskForHide } from "../../domain/scene/local-patch-hides";
import { localPatchBoardsForVersion } from "../../domain/scene/local-patch-catalog";
import { AUTHORED_PATCH_COMPOSITION_VERSION, authoredLocalPatchReturnContract, type AuthoredLocalPatchReturnContract } from "../../domain/scene/local-patch-return-region";
import { AUTHORED_RECOVERY_COMPOSITION_VERSION, AUTHORED_RECOVERY_CONTEXT_VERSION, authoredRecoveryAlpha,
  authoredRecoveryParentSha256, readAuthoredLocalPatchRecovery } from "../../domain/scene/local-patch-authored-recovery";
import { SELF_REPAIR_VERSION, selfRepairDecisionSchema } from "../../domain/scene/local-patch-self-repair";
import { sourcePlacementRecoveryGeometryAllowed, type SourcePlacementHideContract } from "../../domain/scene/source-placement-release";
import { prepareSourceNeighborContract } from "../../domain/scene/local-patch-source-neighbors";
import { assertTrustedSourcePlacementContext, resolveLocalPatchBoardsForGame, sourcePlacementForHide,
  type TrustedSourcePlacementContext } from "./source-placement-release";
import { sceneBySlug } from "../scene-catalog.service";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { sameChargeEvidence } from "./world-budget";
import { sha256Bytes } from "./fixed-sprite";
import { isTheModelWeAsked } from "./local-patch-judge";
import { foregroundForPinnedPrompt, foregroundPlanConflict } from "./local-patch-foreground";

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export type AuthoredLocalPatchReceipt = { compositionVersion?: unknown; authoredReturn?: unknown; authoredRecovery?: unknown;
  selfRepair?: unknown; recoveryComposition?: unknown; foreground?: unknown; judgedSha256?: unknown; promptVersion?: unknown; boardReview?: unknown };

/** Reconstruct from trusted pinned source data, never from a claimed receipt. */
export function expectedAuthoredLocalPatchReturn(board: LocalPatchBoard, hide: LocalPatchHide, contentVersion: number,
  placementContext?: TrustedSourcePlacementContext): AuthoredLocalPatchReturnContract | null {
  if (placementContext) {
    assertTrustedSourcePlacementContext(placementContext);
    if (placementContext.sceneVersion !== contentVersion) throw Error("Authored return context version differs");
  }
  if (!hide.returnRect) return null;
  const definition = sceneBySlug(board.board, contentVersion);
  if (`public${definition.art.base}` !== board.art) throw Error("Authored return source differs from the scene");
  const entry = placementContext?.manifestSha256 ? sourcePlacementForHide(placementContext, hide.id) : null;
  if (placementContext?.manifestSha256 && (!entry || entry.boardId !== board.board || !equal(entry.effective.crop, cropOf(hide))
    || !equal(entry.effective.child, maskForHide(hide)) || !equal(entry.effective.returnRect, hide.returnRect)))
    throw Error("Authored return differs from the authoritative effective placement");
  return authoredLocalPatchReturnContract({ contentVersion, boardId: board.board, hideId: hide.id,
    source: { art: board.art, sha256: definition.art.sha256 ?? "", width: definition.art.width, height: definition.art.height },
    crop: cropOf(hide), child: maskForHide(hide), authored: hide.returnRect,
    ...(entry ? { sourcePlacement: { manifestSha256: placementContext!.manifestSha256!, basePlacementSha256: entry.basePlacementSha256 } } : {}) });
}

/** A caller cannot buy an alternate envelope under a pinned hide id. */
export function assertAuthoredLocalPatchPlacement(board: LocalPatchBoard, hide: LocalPatchHide, contentVersion: number,
  placementContext?: TrustedSourcePlacementContext) {
  if (placementContext) assertTrustedSourcePlacementContext(placementContext);
  const pinned = (placementContext?.boards ?? localPatchBoardsForVersion(contentVersion)).find(b => b.board === board.board);
  const pinnedHide = pinned?.hides.find(h => h.id === hide.id);
  if (!hide.returnRect && !pinnedHide?.returnRect) return;
  const actual = expectedAuthoredLocalPatchReturn(board, hide, contentVersion, placementContext);
  const expected = pinned && pinnedHide ? expectedAuthoredLocalPatchReturn(pinned, pinnedHide, contentVersion, placementContext) : null;
  if (!actual || !expected || !equal(actual, expected)) throw Error("LOCAL_PATCH: authored placement differs from its pinned source/window");
}

/** Pure, before image purchase and again on an applying-phase resume. It is
 * never permission to move the crop, change source, or cut a registered head. */
export function assertAuthoredLocalPatchRecoveryGeometry(parent: AuthoredLocalPatchReturnContract,
  placementContext: TrustedSourcePlacementContext | undefined, decision: unknown) {
  if (!placementContext) throw Error("AUTHORED_RECOVERY: trusted companion context is required");
  assertTrustedSourcePlacementContext(placementContext);
  const entry = sourcePlacementForHide(placementContext, parent.hideId), plan = selfRepairDecisionSchema.parse(decision);
  const board = placementContext.boards.find(b => b.board === parent.boardId), hide = board?.hides.find(h => h.id === parent.hideId);
  if (!entry || !board || !hide || !equal(parent, expectedAuthoredLocalPatchReturn(board, hide, placementContext.sceneVersion, placementContext))
    || parent.sourcePlacement?.manifestSha256 !== placementContext.manifestSha256
    || parent.sourcePlacement.basePlacementSha256 !== entry.basePlacementSha256
    || !sourcePlacementRecoveryGeometryAllowed(entry, { crop: parent.crop, child: plan.protectedCore, returnRect: plan.returnWindow }))
    throw Error("AUTHORED_RECOVERY: fixed crop, source heads or authored child/window envelope is unsafe");
  const world = { ...plan.returnWindow, left: parent.crop.left + plan.returnWindow.left, top: parent.crop.top + plan.returnWindow.top };
  if (!board.hides.filter(h => h.id !== hide.id).every(other => { const r = cropOf(other);
    return world.left + world.width <= r.left || r.left + r.width <= world.left || world.top + world.height <= r.top || r.top + r.height <= world.top;
  })) throw Error("AUTHORED_RECOVERY: return window overlaps another hide");
  return plan;
}

/** Geometry-only reconstruction for the prospective neighbor reader. The
 * caller still supplies an authoritative entry and verifies paid role evidence. */
export function authoredLocalPatchSourceNeighborContract(entry: SourcePlacementHideContract, receipt: AuthoredLocalPatchReceipt) {
  if (!entry.sourceNeighbors) return null;
  const parent = receipt.authoredReturn as AuthoredLocalPatchReturnContract;
  const canonical = parent && authoredLocalPatchReturnContract({ contentVersion: 12, boardId: entry.boardId, hideId: entry.hideId,
    source: entry.source, crop: entry.effective.crop, child: entry.effective.child, authored: entry.effective.returnRect,
    ...(parent.sourcePlacement ? { sourcePlacement: parent.sourcePlacement } : {}) });
  if (!parent?.sourcePlacement || parent.sourcePlacement.basePlacementSha256 !== entry.basePlacementSha256 || !equal(parent, canonical))
    throw Error("AUTHORED_RECOVERY: source-neighbor parent differs from its authoritative entry");
  const recovered = receipt.authoredRecovery !== undefined ? readAuthoredLocalPatchRecovery(parent, receipt.authoredRecovery) : null;
  const returned = recovered?.returnWindow ?? entry.effective.returnRect;
  if (recovered && (receipt.compositionVersion !== AUTHORED_RECOVERY_COMPOSITION_VERSION
    || !sourcePlacementRecoveryGeometryAllowed(entry, { crop: recovered.crop, child: recovered.protectedCore, returnRect: returned })))
    throw Error("AUTHORED_RECOVERY: source-neighbor recovery window is unsafe");
  const context = { boardId: entry.boardId, hideId: entry.hideId, source: entry.source, crop: entry.effective.crop, returnRect: returned };
  const prepared = prepareSourceNeighborContract({ ...entry.sourceNeighbors.contract, ...context }, context);
  if (!prepared.ok) throw Error(`AUTHORED_RECOVERY: invalid source-neighbor window ${prepared.fault.code}`);
  return { contract: prepared.contract, contractSha256: prepared.contractSha256 };
}

export function authoredLocalPatchReturnMatches(receipt: AuthoredLocalPatchReceipt | null,
  board: LocalPatchBoard, hide: LocalPatchHide, contentVersion: number, reviewed = false, placementContext?: TrustedSourcePlacementContext): boolean {
  const v4 = receipt?.compositionVersion === AUTHORED_PATCH_COMPOSITION_VERSION;
  const recovery = receipt?.compositionVersion === AUTHORED_RECOVERY_COMPOSITION_VERSION;
  if (!v4 && !recovery && receipt?.authoredReturn === undefined && receipt?.authoredRecovery === undefined && !hide.returnRect) return true;
  if ((!v4 && !recovery) || contentVersion !== 12 || !hide.returnRect) return false;
  try {
    const expected = expectedAuthoredLocalPatchReturn(board, hide, contentVersion, placementContext);
    if (!expected || !equal(receipt?.authoredReturn, expected)) return false;
    if (recovery) {
      const derived = readAuthoredLocalPatchRecovery(expected, receipt?.authoredRecovery), state = object(receipt?.selfRepair);
      const decision = assertAuthoredLocalPatchRecoveryGeometry(expected, placementContext, state.decision), audit = object(receipt?.recoveryComposition);
      if (state.version !== SELF_REPAIR_VERSION || state.phase !== "awaiting-review" || state.cycle !== derived.cycle
        || !equal(state.authoredDiagnosis, derived.diagnosis) || !equal(decision.returnWindow, derived.returnWindow)
        || !equal(decision.protectedCore, derived.protectedCore) || !equal(decision.faceRect, derived.faceRect)
        || !equal(audit.crop, derived.crop) || !equal(audit.returnWindow, derived.returnWindow)
        || !equal(audit.protectedCore, derived.protectedCore) || !equal(audit.faceRect, derived.faceRect)
        || audit.sourceSha256 !== derived.sourcePngSha256 || audit.rawSha256 !== derived.source.normalizedRawSha256
        || audit.outsideChangedPixels !== 0 || audit.protectedChangedPixels !== 0) return false;
    } else if (receipt?.authoredRecovery !== undefined) return false;
    const review = object(receipt?.boardReview);
    return !reviewed || review.compositionVersion === receipt?.compositionVersion && equal(review.authoredReturn, expected)
      && equal(review.authoredRecovery, receipt?.authoredRecovery);
  } catch { return false; }
}

/** Re-read the actual diagnosis and paid RAW, then reproduce the deterministic
 * join before a new review or publication. Forged audit zeros are not proof. */
export async function authoredLocalPatchRecoveryEvidenceMatches(db: Prisma.TransactionClient, input: { gameId: string;
  board: LocalPatchBoard; hide: LocalPatchHide; sceneVersion: number; receipt: AuthoredLocalPatchReceipt;
  placementContext: TrustedSourcePlacementContext; promptVersion: string | null; beforePng?: Buffer }): Promise<boolean> {
  const { receipt, placementContext, board, hide } = input;
  if (receipt.authoredRecovery === undefined) return receipt.compositionVersion !== AUTHORED_RECOVERY_COMPOSITION_VERSION;
  try {
    if (!authoredLocalPatchReturnMatches(receipt, board, hide, input.sceneVersion, false, placementContext)) return false;
    const parent = expectedAuthoredLocalPatchReturn(board, hide, input.sceneVersion, placementContext)!;
    const recovery = readAuthoredLocalPatchRecovery(parent, receipt.authoredRecovery), worldId = `${input.gameId}:board-wizard`;
    const state = object(receipt.selfRepair), decision = selfRepairDecisionSchema.parse(state.decision);
    if (recovery.diagnosis.requestKey !== `self-repair:${hide.id}:diagnosis:${recovery.cycle}`
      || recovery.source.requestKey !== (decision.action === "recompose-retained" ? decision.sourceKey : `${hide.id}:${hide.pose}:self-repair:${recovery.cycle}`)) return false;
    const ledger = await PrismaWorldBudgetStore.forContinuationApprovalTransaction(db).read(worldId);
    if (!ledger) return false;
    const store = new PrismaRetainedPurchaseStore(db);
    const read = async (ref: { requestKey: string; operationFingerprint: string }, scope: "judge" | "image") => {
      const bill = ledger.snapshot.requests.find(r => r.requestKey === ref.requestKey), kept = await store.get(worldId, ref.requestKey);
      if (!bill || !["settled", "linked"].includes(bill.state) || !("evidence" in bill) || bill.scope !== scope || bill.conflicts.length
        || bill.operationFingerprint !== ref.operationFingerprint || !kept?.evidence || kept.operationFingerprint !== ref.operationFingerprint
        || !sameChargeEvidence(kept.evidence, bill.evidence)) throw Error("Authored recovery paid evidence changed");
      const wire = JSON.parse(kept.bytes.toString()) as Record<string, unknown>;
      if (scope === "judge" && (wire.requestId !== bill.evidence.providerRequestId || wire.model !== bill.evidence.model
        || !isTheModelWeAsked(wire.model as string, "gpt-5.6-sol") || wire.finishReason !== "stop" || wire.wireFault != null || wire.costUnknown === true))
        throw Error("Authored recovery diagnosis wire changed");
      return wire;
    };
    const diagnosis = await read(recovery.diagnosis, "judge"), context = { version: AUTHORED_RECOVERY_CONTEXT_VERSION,
      parentSha256: authoredRecoveryParentSha256(parent), sourcePngSha256: recovery.sourcePngSha256 };
    if (typeof diagnosis.raw !== "string" || sha256Bytes(Buffer.from(diagnosis.raw)) !== recovery.diagnosis.rawSha256
      || !equal(diagnosis.authoredRecoveryContext, context) || !equal(selfRepairDecisionSchema.parse(JSON.parse(diagnosis.raw)), decision)) return false;
    const wire = await read(recovery.source, "image");
    if (wire.version !== "local-patch-render/v1" || wire.rejected !== null || typeof wire.bytesBase64 !== "string"
      || !equal(wire.authoredReturn, parent)
      || decision.action !== "recompose-retained" && !equal(wire.authoredDiagnosis, recovery.diagnosis)) return false;
    const originalRaw = Buffer.from(wire.bytesBase64, "base64");
    if (originalRaw.toString("base64") !== wire.bytesBase64 || sha256Bytes(originalRaw) !== recovery.source.retainedRawSha256) return false;
    const raw = await sharp(originalRaw, { limitInputPixels: 8_294_400 }).resize(512, 768, { fit: "fill" }).png().toBuffer();
    if (sha256Bytes(raw) !== recovery.source.normalizedRawSha256) return false;
    const foreground = foregroundForPinnedPrompt(hide, input.promptVersion);
    if (foreground && foregroundPlanConflict(foreground, decision)) return false;
    const before = input.beforePng ?? await (await import("./local-patch-hide")).readShippedBoardArt(board.art, parent.source.sha256);
    if (sha256Bytes(before) !== recovery.sourcePngSha256) return false;
    const alphaPng = await sharp(Buffer.from(authoredRecoveryAlpha(recovery)), { raw: { width: 512, height: 768, channels: 1 } }).toColourspace("b-w").png().toBuffer();
    const joined = await (await import("./local-patch-repair-compose")).recomputePaidPatchJoin({ beforePng: before, rawPng: raw, alphaPng,
      crop: recovery.crop, returnWindow: recovery.returnWindow, protectedCore: recovery.protectedCore, faceRect: recovery.faceRect,
      boardSize: { width: 3840, height: 2160 }, ...(foreground ? { foreground } : {}) });
    return joined.candidateSha256 === receipt.judgedSha256 && equal(joined.audit, receipt.recoveryComposition) && equal(joined.foreground, receipt.foreground);
  } catch { return false; }
}

/** Both publication routes resolve game authority afresh. No base-catalog
 * fallback can erase a malformed or unknown companion pin. */
export async function authoredLocalPatchPublicationMatches(db: Prisma.TransactionClient,
  input: { gameId: string; sceneVersion: number; hideId: string; judgeJson: string | null; variantId?: string }): Promise<boolean> {
  try {
    const placementContext = await resolveLocalPatchBoardsForGame(db, input.gameId, input.sceneVersion);
    let receipt: AuthoredLocalPatchReceipt | null;
    try { receipt = JSON.parse(input.judgeJson ?? "null"); } catch { return !placementContext.release; }
    const board = placementContext.boards.find(b => b.hides.some(h => h.id === input.hideId)), hide = board?.hides.find(h => h.id === input.hideId);
    const claims = receipt?.compositionVersion === AUTHORED_PATCH_COMPOSITION_VERSION || receipt?.compositionVersion === AUTHORED_RECOVERY_COMPOSITION_VERSION
      || receipt?.authoredReturn !== undefined || receipt?.authoredRecovery !== undefined;
    if (!claims && !hide?.returnRect) return true;
    if (!board || !hide || !authoredLocalPatchReturnMatches(receipt, board, hide, input.sceneVersion, true, placementContext)) return false;
    if (receipt?.authoredRecovery === undefined) return true;
    const row = input.variantId ? await db.targetVariantAsset.findUnique({ where: { id: input.variantId }, select: { promptVersion: true } }) : null;
    return !!row && await authoredLocalPatchRecoveryEvidenceMatches(db, { gameId: input.gameId, board, hide, sceneVersion: input.sceneVersion,
      receipt, placementContext, promptVersion: row.promptVersion });
  } catch { return false; }
}

/** Only prospective v4 answers carry this attestation in immutable paid bytes.
 * A recovery also attests the exact derived window and paid lineage. */
export function authoredLocalPatchReviewBinding(input: { hideId: string; imageSha256: string;
  geometrySha256: string; identitySha256: string; authoredReturn?: unknown; authoredRecovery?: unknown }): string | undefined {
  if (input.authoredReturn === undefined) {
    if (input.authoredRecovery !== undefined) throw Error("LOCAL_PATCH: recovery has no authored parent");
    return undefined;
  }
  const c = input.authoredReturn as AuthoredLocalPatchReturnContract;
  const canonical = authoredLocalPatchReturnContract({ contentVersion: c?.contentVersion, boardId: c?.boardId, hideId: c?.hideId,
    source: c?.source, crop: c?.crop, child: c?.child, authored: c?.local, ...(c?.sourcePlacement ? { sourcePlacement: c.sourcePlacement } : {}) });
  if (!equal(c, canonical) || input.hideId !== canonical.hideId
    || ![input.imageSha256, input.geometrySha256, input.identitySha256].every(value => /^[a-f0-9]{64}$/.test(value)))
    throw Error("LOCAL_PATCH: authored review candidate binding is invalid");
  const recovery = input.authoredRecovery !== undefined ? readAuthoredLocalPatchRecovery(canonical, input.authoredRecovery) : null;
  return createHash("sha256").update(JSON.stringify({ version: "authored-return-review-binding/v1", hideId: input.hideId,
    imageSha256: input.imageSha256, geometrySha256: input.geometrySha256, identitySha256: input.identitySha256,
    authoredReturn: canonical, ...(recovery ? { authoredRecovery: recovery } : {}) })).digest("hex");
}

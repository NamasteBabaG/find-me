import { Prisma, type TargetVariantAsset, type Asset } from "@prisma/client";
import { z } from "zod";
import sharp from "sharp";
import type { Container } from "../container";
import { env } from "../../lib/env";
import { DbStorage } from "../../infra/storage/db";
import { PrismaRetainedPurchaseStore } from "../../infra/db/prisma-retained-purchase-store";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { SYSTEM } from "../audit.service";
import { transitionGame } from "../game-status";
import { sceneBySlug } from "../scene-catalog.service";
import { localPatchBoardForVersion, localPatchBoardsForVersion } from "../../domain/scene/local-patch-catalog";
import { localPatchRecoveryDirectiveForHide, type LocalPatchRecoveryDirective } from "../../domain/scene/local-patch-recovery-directive";
import { cropOf } from "../../domain/scene/local-patch-hides";
import { SpriteRefSchema } from "../../domain/game/config";
import { requireLocalPatchRecoveryIdentity, requireLocalPatchRecoveryBudget, readLocalPatchQualityPilot } from "./local-patch-quality-pilot";
import { boardWizardWorldId } from "./board-conditioned-wizard";
import { sha256Bytes } from "./fixed-sprite";
import { sameChargeEvidence } from "./world-budget";
import { LOCAL_PATCH_RESERVE, RETAINED_RENDER_VERSION } from "./local-patch-render";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, readShippedBoardArt } from "./local-patch-hide";
import { LOCAL_PATCH_COMPOSITION_VERSION } from "./local-patch-seam";
import { hasLocalPatchPublicationPolicy, localPatchPublicationGeometryHash, localPatchRepairSiblingInvariantHash } from "./local-patch-publication-policy";
import { parseLocalPatchBoardVerdicts, localPatchQualityDisposition, isTheModelWeAsked } from "./local-patch-judge";

export const LOCAL_PATCH_EXTRA_ATTEMPT_ACTION = "local-patch:extra-attempt";
const STYLE = "local-patch-world-v1", TERMINAL = "local-patch:quality-failed";
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
const auditId = (gameId: string) => `aud_lpea_${hash(gameId).slice(0, 32)}`;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export type LocalPatchExtraAttemptDirective = LocalPatchRecoveryDirective;
const directiveSchema = z.enum(["amazon-peek-age-evidence-v1", "sydney-rock-registration-v1", "greatwall-parapet-registration-v1"]);
const paidSchema = z.object({ requestKey: z.string(), operationFingerprint: z.string(), payloadSha256: digest, evidenceSha256: digest }).strict();
const selectedSchema = z.object({ hideId: z.string(), rowId: z.string(), sceneId: z.string(), targetInstanceId: z.string(),
  directive: directiveSchema, originalAttempt: z.literal(3), authorizedAttempt: z.literal(4), requestKey: z.string(),
  previousJudgeJson: z.string(), previousLastError: z.string().nullable(), originalRowSha256: digest,
  paid: z.array(paidSchema).min(3).max(4) }).strict();
const otherSchema = z.object({ hideId: z.string(), rowId: z.string(), sceneId: z.string(), targetInstanceId: z.string(),
  assetId: z.string(), assetSha256: digest, imageSha256: digest, geometrySha256: digest, invariantSha256: digest,
  judgeJson: z.string(), reviewState: z.enum(["pending-board-review", "board-review-complete"]) }).strict();
const reviewOnlySchema = otherSchema.extend({ hideId: z.literal("amazon-v7-5"), originalRowSha256: digest,
  paid: z.array(paidSchema).min(3).max(4) }).strict();
const bodySchema = z.object({ version: z.literal(1), gameId: z.string(), requestedBy: z.string(), reason: z.string().min(10).max(1000),
  ownerId: z.string(), childId: z.string(), childSha256: digest, ordersSha256: digest,
  identityAssetId: z.string(), identitySha256: digest, ageYears: z.number().int().positive(),
  scenes: z.array(z.object({ sceneId: z.string(), boardId: z.string(), sceneVersion: z.literal(9), art: z.string(),
    artSha256: digest, pinnedSha256: digest }).strict()).length(9),
  selected: z.array(selectedSchema).min(1).max(3), others: z.array(otherSchema).min(41).max(44),
  reviewOnly: z.array(reviewOnlySchema).max(1),
  reviewRequestKeys: z.array(z.string()).min(1).max(3), approvalGranted: z.literal(false),
}).strict();
const planSchema = bodySchema.extend({ authorizationId: z.string() }).strict();
export type LocalPatchExtraAttemptPlan = z.infer<typeof planSchema>;
type Selected = LocalPatchExtraAttemptPlan["selected"][number];
type Row = TargetVariantAsset & { targetInstance: { gameSceneId: string; targetId: string } };
type Input = { gameId: string; operatorId: string; reason: string; hideIds: readonly string[]; reviewOnlyHideIds?: readonly string[] };
type RequireInput = { gameId: string; hideId: string; rowId: string; authorizationId: string };
type ReviewInput = { gameId: string; sceneId: string; authorizationId: string };
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`LOCAL_PATCH_EXTRA_ATTEMPT: ${message}`); }
const tcOf = (c: Container, tx: Prisma.TransactionClient): Container => ({ ...c, db: tx as Container["db"], storage: new DbStorage(tx as Container["db"]) });
const rowsOf = (c: Container, gameId: string) => c.db.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT,
  targetInstance: { gameScene: { gameId } } }, include: { targetInstance: { select: { gameSceneId: true, targetId: true } } }, orderBy: { id: "asc" } });
const ordersHash = (orders: readonly { id: string }[]) => hash([...orders].sort((a, b) => a.id.localeCompare(b.id)));
const rowHash = ({ targetInstance: _target, ...row }: Row) => hash(row);
const reviewOnlyInvariant = (row: TargetVariantAsset) => hash(Object.fromEntries(Object.entries(row)
  .filter(([key]) => !["status", "lastError", "judgeJson", "updatedAt"].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
const directiveFor = localPatchRecoveryDirectiveForHide;

export async function readLocalPatchExtraAttemptPlan(c: Pick<Container, "db">, gameId: string): Promise<LocalPatchExtraAttemptPlan | null> {
  const audit = await c.db.auditLog.findUnique({ where: { id: auditId(gameId) } });
  if (!audit) return null;
  demand(audit.actorType === "ADMIN" && audit.actorId && audit.action === LOCAL_PATCH_EXTRA_ATTEMPT_ACTION
    && audit.entityType === "Game" && audit.entityId === gameId, "The immutable authority record changed");
  const plan = planSchema.parse(JSON.parse(audit.metaJson ?? "null"));
  const { authorizationId, ...body } = plan;
  demand(body.gameId === gameId && body.requestedBy === audit.actorId && authorizationId === `lpea_${hash(body)}`
    && new Set(plan.selected.map(s => s.hideId)).size === plan.selected.length
    && new Set([...plan.selected, ...plan.others, ...plan.reviewOnly].map(s => s.rowId)).size === 45
    && plan.selected.length + plan.others.length + plan.reviewOnly.length === 45
    && plan.selected.every(s => s.directive === directiveFor(s.hideId)), "The scoped authority digest or selected hides changed");
  return plan;
}

async function paid(c: Pick<Container, "db">, gameId: string, requestKey: string, scope: "image" | "judge") {
  const worldId = boardWizardWorldId(gameId), ledger = await PrismaWorldBudgetStore.forContinuationApprovalTransaction(c.db).read(worldId);
  const bill = ledger?.snapshot.requests.find(r => r.requestKey === requestKey), retained = await new PrismaRetainedPurchaseStore(c.db).get(worldId, requestKey);
  demand(bill && (bill.state === "settled" || bill.state === "linked") && bill.scope === scope && !bill.conflicts.length
    && bill.reserveMicroUsd === (scope === "image" ? LOCAL_PATCH_RESERVE.renderMicroUsd : 30000)
    && retained && retained.worldId === worldId && retained.requestKey === requestKey && retained.scope === scope
    && retained.operationFingerprint === bill.operationFingerprint && retained.evidence && retained.unknownReason === null
    && sameChargeEvidence(retained.evidence, bill.evidence), "Original paid evidence is missing, changed or unsettled");
  if (scope === "image") {
    const envelope = JSON.parse(retained.bytes.toString());
    demand(envelope.version === RETAINED_RENDER_VERSION && (envelope.rejected === null || typeof envelope.rejected === "string")
      && (envelope.bytesBase64 === null || typeof envelope.bytesBase64 === "string"
        && Buffer.from(envelope.bytesBase64, "base64").toString("base64") === envelope.bytesBase64), "Original render envelope is malformed");
  }
  return { proof: { requestKey, operationFingerprint: bill.operationFingerprint, payloadSha256: retained.payloadSha256,
    evidenceSha256: hash(bill.evidence) }, retained, evidence: bill.evidence };
}

async function reviewOnlyCompletion(c: Pick<Container, "db">, plan: LocalPatchExtraAttemptPlan,
  frozen: LocalPatchExtraAttemptPlan["reviewOnly"][number], row: Row) {
  demand(row.targetInstanceId === frozen.targetInstanceId && row.targetInstance.gameSceneId === frozen.sceneId && row.attempts === 3
    && ["FAILED", "GENERATED"].includes(row.status) && reviewOnlyInvariant(row) === frozen.invariantSha256,
  "A review-only image, geometry or attempt changed");
  if (row.status === "FAILED" && rowHash(row) === frozen.originalRowSha256) return;
  const receipt = JSON.parse(row.judgeJson ?? "null"), review = receipt?.boardReview;
  const pin = plan.scenes.find(s => s.sceneId === frozen.sceneId), board = pin && localPatchBoardForVersion(pin.boardId, 9);
  demand(board && receipt?.hide === frozen.hideId && receipt.judgedSha256 === frozen.imageSha256
    && receipt.geometrySha256 === frozen.geometrySha256 && receipt.reviewState === "board-review-complete"
    && receipt.wireFault === null && !receipt.renderFault && review?.assessmentMode === "visible-body-v1"
    && review.extraAttemptAuthorizationId === plan.authorizationId
    && plan.reviewRequestKeys.includes(review.requestKey), "Review-only completion needs the exact new contextual question");
  const result = await paid(c, plan.gameId, review.requestKey, "judge"), wire = JSON.parse(result.retained.bytes.toString());
  const verdicts = parseLocalPatchBoardVerdicts(wire.raw, board.hides.map(h => h.id), 9);
  demand(review.fingerprint === result.proof.operationFingerprint && review.raw === wire.raw && wire.wireFault === null
    && wire.costUnknown === false && wire.finishReason === "stop" && isTheModelWeAsked(wire.model, "gpt-5.6-luna")
    && review.model === wire.model && wire.model === result.evidence.model && wire.requestId === result.evidence.providerRequestId
    && sameChargeEvidence({ ...result.evidence, rawUsage: wire.usage }, result.evidence)
    && hash(receipt.verdict) === hash(verdicts[frozen.hideId]), "The new contextual review is not authenticated");
  if (row.status === "GENERATED") await publication(c, plan, frozen.hideId, row, frozen.imageSha256, frozen.geometrySha256);
  else demand(row.lastError?.startsWith("quality-") && localPatchQualityDisposition(verdicts[frozen.hideId] ?? null, 9, { hideId: frozen.hideId }).state !== "acceptable",
    "A failed contextual review is not a new image allowance");
}

type ImageSnapshot = { asset: Asset; bytes: Buffer };
/** Two reads instead of84 sequential remote round trips. The decoded payloads
 * remain bounded to this game's existing45 rows; every digest is still checked. */
async function imageSnapshots(c: Pick<Container, "db">, rows: readonly TargetVariantAsset[]) {
  const ids = [...new Set(rows.flatMap(row => row.assetId ? [row.assetId] : []))];
  const assets = await c.db.asset.findMany({ where: { id: { in: ids } } });
  const blobs = await c.db.fileBlob.findMany({ where: { key: { in: assets.map(a => a.storagePath) } } });
  const byPath = new Map(blobs.map(blob => [blob.key, blob]));
  return new Map(assets.map(asset => {
    const blob = byPath.get(asset.storagePath); demand(blob, "An existing appearance payload is missing");
    return [asset.id, { asset, bytes: Buffer.from(blob.data) }] as const;
  }));
}

async function image(c: Container, ownerId: string, gameId: string, hideId: string, row: TargetVariantAsset, snapshot?: ImageSnapshot) {
  demand(row.assetId && row.rectJson && row.hitRectJson && row.headAnchorJson, "An unchanged appearance needs its shipping image and geometry");
  const asset = snapshot?.asset ?? await c.db.asset.findUniqueOrThrow({ where: { id: row.assetId } });
  demand(asset.ownerId === ownerId && asset.type === "TARGET_SPRITE" && asset.visibility === "GAME" && asset.status === "READY"
    && !asset.deletedAt && asset.provider === LOCAL_PATCH_PROVIDER && asset.providerRequestId === gameId, "Appearance ownership or lifecycle changed");
  const bytes = snapshot?.bytes ?? await c.storage.get(asset.storagePath), imageSha256 = sha256Bytes(bytes), geometrySha256 = localPatchPublicationGeometryHash(row);
  const hide = localPatchBoardsForVersion(9).flatMap(b => b.hides).find(h => h.id === hideId);
  demand(hide, "Appearance is not authored");
  const crop = cropOf(hide), meta = await sharp(bytes, { limitInputPixels: 8_294_400 }).metadata();
  const sprite = SpriteRefSchema.parse({ kind: "image", url: "https://example.invalid/retained.png", width: asset.width, height: asset.height,
    rect: JSON.parse(row.rectJson), hitRect: JSON.parse(row.hitRectJson), anchor: JSON.parse(row.headAnchorJson) });
  demand(meta.width === crop.width && meta.height === crop.height && (meta.pages ?? 1) === 1 && sprite.kind === "image" && sprite.rect
    && sprite.rect.x === crop.left / 3072 && sprite.rect.y === crop.top / 2048
    && sprite.rect.w === crop.width / 3072 && sprite.rect.h === crop.height / 2048, "Appearance raster or authored geometry changed");
  const receipt = JSON.parse(row.judgeJson ?? "null");
  demand(receipt?.hide === hideId && receipt.judgedSha256 === imageSha256 && receipt.geometrySha256 === geometrySha256
    && !receipt.renderFault && receipt.compositionVersion === LOCAL_PATCH_COMPOSITION_VERSION
    && ["pending-board-review", "board-review-complete"].includes(receipt.reviewState), "Appearance pixels or render-completion evidence changed");
  return { assetSha256: hash(asset), imageSha256, geometrySha256, receipt };
}

async function publication(c: Pick<Container, "db">, plan: Pick<LocalPatchExtraAttemptPlan, "gameId" | "identityAssetId" | "identitySha256">,
  hideId: string, row: TargetVariantAsset, imageSha256: string, geometrySha256: string) {
  demand(await hasLocalPatchPublicationPolicy(c, { gameId: plan.gameId, sceneVersion: 9, hideId, variantId: row.id,
    attempts: row.attempts, identityAssetId: plan.identityAssetId, identitySha256: plan.identitySha256,
    assetId: row.assetId!, imageSha256, geometrySha256, judgeJson: row.judgeJson }), "An existing reviewed appearance lacks its authentic publication binding");
}

async function validatePlan(c: Container, plan: LocalPatchExtraAttemptPlan) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Only durable QA storage is eligible");
  const proof = await requireLocalPatchRecoveryIdentity(c, plan.gameId);
  demand(["TARGETS_GENERATING", "GENERATION_FAILED"].includes(proof.game.status)
    && proof.game.ownerId === plan.ownerId && proof.child.id === plan.childId && hash(proof.child) === plan.childSha256
    && ordersHash(proof.game.orders) === plan.ordersSha256 && proof.identityAssetId === plan.identityAssetId
    && proof.identitySha256 === plan.identitySha256 && proof.child.ageYears === plan.ageYears, "Game, identity, age or paid order changed");
  for (const pin of plan.scenes) {
    const scene = proof.game.scenes.find(s => s.id === pin.sceneId), definition = scene && sceneBySlug(scene.sceneSlug, scene.sceneVersion);
    demand(scene && scene.sceneSlug === pin.boardId && scene.sceneVersion === pin.sceneVersion && definition
      && `public${definition.art.base}` === pin.art && definition.art.sha256 === pin.artSha256
      && sha256Bytes(await readShippedBoardArt(pin.art, pin.artSha256)) === pin.pinnedSha256, "Pinned scene artwork changed");
  }
  const all = await rowsOf(c, plan.gameId);
  demand(all.length === 45 && all.every(r => r.provider === LOCAL_PATCH_PROVIDER), "The authored world changed");
  const snapshots = await imageSnapshots(c, all.filter(r => [...plan.others, ...plan.reviewOnly].some(o => o.rowId === r.id)));
  for (const frozen of plan.others) {
    const row = all.find(r => r.id === frozen.rowId);
    demand(row && row.targetInstanceId === frozen.targetInstanceId && row.targetInstance.gameSceneId === frozen.sceneId
      && row.status === "GENERATED" && localPatchRepairSiblingInvariantHash(row) === frozen.invariantSha256, "An unselected appearance changed");
    const current = await image(c, plan.ownerId, plan.gameId, frozen.hideId, row, snapshots.get(row.assetId!));
    demand(current.assetSha256 === frozen.assetSha256 && current.imageSha256 === frozen.imageSha256 && current.geometrySha256 === frozen.geometrySha256,
      "An unselected image, asset or geometry changed");
    if (frozen.reviewState === "board-review-complete") demand(row.judgeJson === frozen.judgeJson, "An existing reviewed judgment changed");
    else demand(row.judgeJson === frozen.judgeJson || current.receipt.reviewState === "board-review-complete", "An unreviewed sibling changed without a completed review");
    if (current.receipt.reviewState === "board-review-complete") await publication(c, plan, frozen.hideId, row, current.imageSha256, current.geometrySha256);
  }
  for (const selection of plan.selected) {
    const row = all.find(r => r.id === selection.rowId), pin = plan.scenes.find(s => s.sceneId === selection.sceneId);
    const hide = pin && localPatchBoardForVersion(pin.boardId, 9)?.hides.find(h => h.id === selection.hideId);
    demand(row && hide && row.targetInstanceId === selection.targetInstanceId && row.targetInstance.gameSceneId === selection.sceneId
      && row.targetInstance.targetId === hide.targetId && selection.requestKey === `${hide.id}:${hide.pose}:render:4`, "Selected appearance scope changed");
    demand(row.attempts === 3 && row.status === "FAILED" && rowHash(row) === selection.originalRowSha256
      || row.attempts === 4 && ["PENDING", "GENERATED", "FAILED"].includes(row.status), "Only the original third or authorized fourth attempt is allowed");
    if (row.status === "PENDING") demand(row.judgeJson === selection.previousJudgeJson, "An interrupted fourth attempt changed its original repair evidence");
    for (const original of selection.paid) {
      const current = await paid(c, plan.gameId, original.requestKey, original.requestKey.includes(":render:") ? "image" : "judge");
      demand(hash(current.proof) === hash(original), "The original paid refusal evidence changed");
    }
  }
  for (const frozen of plan.reviewOnly) {
    const row = all.find(r => r.id === frozen.rowId); demand(row, "The review-only appearance disappeared");
    const current = await image(c, plan.ownerId, plan.gameId, frozen.hideId, row, snapshots.get(row.assetId!));
    demand(current.assetSha256 === frozen.assetSha256 && current.imageSha256 === frozen.imageSha256
      && current.geometrySha256 === frozen.geometrySha256, "The review-only pixels or ownership changed");
    await reviewOnlyCompletion(c, plan, frozen, row);
    for (const original of frozen.paid) demand(hash((await paid(c, plan.gameId, original.requestKey,
      original.requestKey.includes(":render:") ? "image" : "judge")).proof) === hash(original), "Review-only original paid evidence changed");
  }
  const cost = await proof.budget.audit(boardWizardWorldId(plan.gameId));
  const allowedKeys = [...plan.selected.map(s => s.requestKey), ...plan.reviewRequestKeys];
  demand(cost.capMicroUsd === 4_000_000 && !cost.held && !cost.unknownRequestKeys.length
    && cost.pendingRequestKeys.every(key => allowedKeys.includes(key)), "The unchanged inclusive4-dollar ledger is held or contains an unrelated pending charge");
  return { proof, all };
}

/** Authority only: this transaction neither buys an image nor changes any
 * attempt, existing judgment, asset, order or commercial ceiling. */
export async function stageLocalPatchExtraAttempts(c: Container, input: Input): Promise<LocalPatchExtraAttemptPlan> {
  const reviewOnlyIds = input.reviewOnlyHideIds ?? [];
  demand(env().APP_ENV === "qa" && c.storage.id === "db" && /^[A-Za-z0-9_-]{1,160}$/.test(input.gameId)
    && input.reason.trim().length >= 10 && input.reason.length <= 1000 && input.hideIds.length >= 1 && input.hideIds.length <= 3
    && new Set(input.hideIds).size === input.hideIds.length && input.hideIds.every(id => directiveFor(id))
    && reviewOnlyIds.length <= 1 && reviewOnlyIds.every(id => id === "amazon-v7-5" && !input.hideIds.includes(id)), "Explicit bounded QA authorization is required");
  const admin = await c.db.user.findUnique({ where: { id: input.operatorId } });
  demand(admin && c.adminEmails?.some(email => email.trim().toLowerCase() === admin.email.toLowerCase()), "Authenticated administrator required");
  return c.db.$transaction(async tx => {
    const tc = tcOf(c, tx), previous = await readLocalPatchExtraAttemptPlan(tc, input.gameId);
    if (previous) {
      demand(previous.requestedBy === input.operatorId && previous.reason === input.reason.trim()
        && hash(previous.selected.map(s => s.hideId).sort()) === hash([...input.hideIds].sort())
        && hash(previous.reviewOnly.map(s => s.hideId)) === hash(reviewOnlyIds), "This game already has another immutable authorization");
      await validatePlan(tc, previous); return previous;
    }
    const locked = await tx.game.updateMany({ where: { id: input.gameId, status: "GENERATION_FAILED", deletedAt: null, styleVersion: STYLE }, data: { styleVersion: STYLE } });
    demand(locked.count === 1, "Only an unpublished terminal quality failure is eligible");
    const proof = await requireLocalPatchRecoveryIdentity(tc, input.gameId);
    demand(proof.game.jobs.length === 1 && proof.game.jobs[0]?.id === `job_${input.gameId}`
      && proof.game.jobs.every(j => j.status === "DONE" && j.currentStep === TERMINAL), "Original job must be terminal and inactive");
    const pilot = await readLocalPatchQualityPilot(tc, input.gameId);
    demand(!pilot || pilot.state === "resumed", "An unfinished pilot cannot be bypassed");
    demand(!await tx.auditLog.findFirst({ where: { entityType: "Game", entityId: input.gameId, action: "local-patch:paid-mask-repair" } }), "Another repair batch is already active");
    const cost = await requireLocalPatchRecoveryBudget(tc, input.gameId);
    demand(cost.committedMicroUsd + input.hideIds.length * LOCAL_PATCH_RESERVE.renderMicroUsd + (input.hideIds.length + reviewOnlyIds.length) * 30000 <= 4_000_000,
      "The selected images and reviews must fit the unchanged inclusive4-dollar ceiling");
    const scenes: LocalPatchExtraAttemptPlan["scenes"] = [];
    for (const scene of [...proof.game.scenes].sort((a, b) => a.id.localeCompare(b.id))) {
      const board = localPatchBoardForVersion(scene.sceneSlug, 9), definition = sceneBySlug(scene.sceneSlug, 9);
      demand(board && board.hides.length === 5 && `public${definition.art.base}` === board.art && definition.art.sha256, "Authored scene changed");
      scenes.push({ sceneId: scene.id, boardId: board.board, sceneVersion: 9, art: board.art, artSha256: definition.art.sha256,
        pinnedSha256: sha256Bytes(await readShippedBoardArt(board.art, definition.art.sha256)) });
    }
    const all = await rowsOf(tc, input.gameId), selected: Selected[] = [], others: LocalPatchExtraAttemptPlan["others"] = [],
      reviewOnly: LocalPatchExtraAttemptPlan["reviewOnly"] = [];
    demand(all.length === 45 && all.every(r => r.provider === LOCAL_PATCH_PROVIDER), "All45 authored appearances are required");
    const snapshots = await imageSnapshots(tc, all);
    for (const scene of scenes) for (const hide of localPatchBoardForVersion(scene.boardId, 9)!.hides) {
      const row = all.find(r => r.targetInstance.gameSceneId === scene.sceneId && r.targetInstance.targetId === hide.targetId);
      demand(row && row.attempts >= 1 && row.attempts <= 3, "An authored appearance is missing or outside its original limit");
      if (input.hideIds.includes(hide.id) || reviewOnlyIds.includes(hide.id)) {
        demand(row.status === "FAILED" && row.attempts === 3 && row.judgeJson, "Only an exact FAILED third attempt may receive one extra image");
        const receipt = JSON.parse(row.judgeJson);
        demand(receipt?.hide === hide.id && receipt.pose === hide.pose && (typeof receipt.renderFault === "string" && receipt.renderFault.startsWith("quality-seam:")
          || row.lastError?.startsWith("quality-retry:") && receipt.reviewState === "board-review-complete"), "The selected row is not a concluded quality refusal");
        const records: Selected["paid"] = [];
        for (let attempt = 1; attempt <= 3; attempt++) records.push((await paid(tc, input.gameId, `${hide.id}:${hide.pose}:render:${attempt}`, "image")).proof);
        if (receipt.boardReview?.requestKey) {
          const review = await paid(tc, input.gameId, receipt.boardReview.requestKey, "judge"), wire = JSON.parse(review.retained.bytes.toString());
          const verdicts = parseLocalPatchBoardVerdicts(wire.raw, localPatchBoardForVersion(scene.boardId, 9)!.hides.map(h => h.id), 9);
          const disposition = localPatchQualityDisposition(verdicts[hide.id] ?? null, 9, { hideId: hide.id });
          demand(receipt.boardReview.version === "local-patch-board-five-quality/v5-evidence-labeled"
            && receipt.boardReview.fingerprint === review.proof.operationFingerprint && receipt.boardReview.raw === wire.raw
            && wire.wireFault === null && wire.costUnknown === false && wire.finishReason === "stop"
            && isTheModelWeAsked(wire.model, "gpt-5.6-luna") && receipt.boardReview.model === wire.model
            && wire.model === review.evidence.model && wire.requestId === review.evidence.providerRequestId
            && sameChargeEvidence({ ...review.evidence, rawUsage: wire.usage }, review.evidence)
            && hash(receipt.verdict) === hash(verdicts[hide.id]) && (disposition.state === "retry" || reviewOnlyIds.includes(hide.id) && disposition.state === "acceptable"),
            "The selected judgment no longer matches its original paid reply"); records.push(review.proof);
        }
        if (reviewOnlyIds.includes(hide.id)) {
          demand(hide.id === "amazon-v7-5" && receipt.reviewState === "board-review-complete" && !receipt.renderFault,
            "Only the retained Amazon quality-reviewed image may enter review-only recovery");
          const current = await image(tc, proof.game.ownerId!, input.gameId, hide.id, row, snapshots.get(row.assetId!));
          reviewOnly.push({ hideId: hide.id, rowId: row.id, sceneId: scene.sceneId, targetInstanceId: row.targetInstanceId,
            assetId: row.assetId!, assetSha256: current.assetSha256, imageSha256: current.imageSha256,
            geometrySha256: current.geometrySha256, invariantSha256: reviewOnlyInvariant(row), judgeJson: row.judgeJson,
            reviewState: "board-review-complete", originalRowSha256: rowHash(row), paid: records });
          continue;
        }
        const requestKey = `${hide.id}:${hide.pose}:render:4`;
        demand(!await proof.budget.readRequest(boardWizardWorldId(input.gameId), requestKey)
          && !await new PrismaRetainedPurchaseStore(tx).get(boardWizardWorldId(input.gameId), requestKey), "The fourth image key already exists without this authority");
        selected.push({ hideId: hide.id, rowId: row.id, sceneId: scene.sceneId, targetInstanceId: row.targetInstanceId,
          directive: directiveFor(hide.id)!, originalAttempt: 3, authorizedAttempt: 4, requestKey, previousJudgeJson: row.judgeJson,
          previousLastError: row.lastError, originalRowSha256: rowHash(row), paid: records });
      } else {
        demand(row.status === "GENERATED" && row.judgeJson, "Unselected appearances must remain generated");
        const current = await image(tc, proof.game.ownerId!, input.gameId, hide.id, row, snapshots.get(row.assetId!));
        if (current.receipt.reviewState === "board-review-complete") await publication(tc, { gameId: input.gameId,
          identityAssetId: proof.identityAssetId, identitySha256: proof.identitySha256 }, hide.id, row, current.imageSha256, current.geometrySha256);
        others.push({ hideId: hide.id, rowId: row.id, sceneId: scene.sceneId, targetInstanceId: row.targetInstanceId, assetId: row.assetId!,
          assetSha256: current.assetSha256, imageSha256: current.imageSha256, geometrySha256: current.geometrySha256,
          invariantSha256: localPatchRepairSiblingInvariantHash(row), judgeJson: row.judgeJson, reviewState: current.receipt.reviewState });
      }
    }
    demand(selected.length === input.hideIds.length && reviewOnly.length === reviewOnlyIds.length, "Every selected hide must belong to this game");
    const reviewRequestKeys = [...new Set([...selected, ...reviewOnly].map(s => s.sceneId))].map(sceneId => {
      const pin = scenes.find(s => s.sceneId === sceneId)!;
      const vector = localPatchBoardForVersion(pin.boardId, 9)!.hides.map(h => selected.some(s => s.hideId === h.id) ? 4
        : all.find(r => r.targetInstance.gameSceneId === sceneId && r.targetInstance.targetId === h.targetId)!.attempts);
      return `board:${pin.boardId}:five-review:v9:${vector.join("-")}:${LOCAL_PATCH_COMPOSITION_VERSION.replaceAll("/", ".")}:evidence-v5:visible-body-v1`;
    });
    for (const key of reviewRequestKeys) demand(!await proof.budget.readRequest(boardWizardWorldId(input.gameId), key)
      && !await new PrismaRetainedPurchaseStore(tx).get(boardWizardWorldId(input.gameId), key), "The fresh review key already exists without this authority");
    const body = bodySchema.parse({ version: 1, gameId: input.gameId, requestedBy: input.operatorId, reason: input.reason.trim(),
      ownerId: proof.game.ownerId, childId: proof.child.id, childSha256: hash(proof.child), ordersSha256: ordersHash(proof.game.orders),
      identityAssetId: proof.identityAssetId, identitySha256: proof.identitySha256, ageYears: proof.child.ageYears,
      scenes, selected, others, reviewOnly, reviewRequestKeys, approvalGranted: false });
    const plan: LocalPatchExtraAttemptPlan = { ...body, authorizationId: `lpea_${hash(body)}` };
    await tx.auditLog.create({ data: { id: auditId(input.gameId), actorType: "ADMIN", actorId: input.operatorId,
      action: LOCAL_PATCH_EXTRA_ATTEMPT_ACTION, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(plan) } });
    await transitionGame(tc, input.gameId, "TARGETS_GENERATING", SYSTEM, { source: LOCAL_PATCH_EXTRA_ATTEMPT_ACTION, authorizationId: plan.authorizationId });
    await tx.game.update({ where: { id: input.gameId }, data: { lastError: null } });
    await tx.generationJob.update({ where: { id: `job_${input.gameId}` }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null } });
    return plan;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}

/** Read-only authority check, also callable with the worker's transaction
 * container. It authorizes exactly4, never a reset or a fifth purchase. */
export async function requireLocalPatchExtraAttempt(c: Container, input: RequireInput) {
  const plan = await readLocalPatchExtraAttemptPlan(c, input.gameId);
  demand(plan && plan.authorizationId === input.authorizationId, "The exact persisted authorization is required");
  const selected = plan.selected.find(s => s.hideId === input.hideId && s.rowId === input.rowId);
  demand(selected, "This appearance has no extra-attempt authority");
  await validatePlan(c, plan);
  return { authorizedAttempt: 4 as const, directive: selected.directive };
}

/** The short worker transaction follows a full require() outside it. Recheck
 * durable authority, lifecycle and the row/asset CAS without decoding nine
 * backgrounds and42 rasters while holding a database write lock. Private image
 * writes also take the game lifecycle lock; no other game is ever enrolled. */
export async function fenceLocalPatchExtraAttempt(tx: Prisma.TransactionClient, input: RequireInput) {
  const plan = await readLocalPatchExtraAttemptPlan({ db: tx as Container["db"] }, input.gameId);
  const selected = plan?.selected.find(s => s.hideId === input.hideId && s.rowId === input.rowId);
  demand(env().APP_ENV === "qa" && plan && selected && plan.authorizationId === input.authorizationId, "Exact scoped worker authority required");
  const locked = await tx.game.updateMany({ where: { id: input.gameId, styleVersion: STYLE, status: "TARGETS_GENERATING",
    ownerId: plan.ownerId, childProfileId: plan.childId, deletedAt: null, configJson: null, readyAt: null, deliveredAt: null }, data: { styleVersion: STYLE } });
  demand(locked.count === 1, "Game changed before the authorized worker write");
  const game = await tx.game.findUniqueOrThrow({ where: { id: input.gameId }, include: { childProfile: true, orders: true, scenes: true } });
  demand(game.paidAt && game.childProfile && !game.childProfile.deletedAt && game.childProfile.ownerId === plan.ownerId
    && game.childProfile.identityAssetId === plan.identityAssetId && hash(game.childProfile) === plan.childSha256
    && ordersHash(game.orders) === plan.ordersSha256 && game.orders.some(o => o.paymentStatus === "PAID" && o.paidAt && o.userId === plan.ownerId && !o.refundedAt)
    && !game.orders.some(o => o.refundedAt || o.paymentStatus === "REFUNDED"), "Identity, ownership or paid order changed before the worker write");
  demand(game.scenes.length === plan.scenes.length && game.scenes.every(s => plan.scenes.some(p => p.sceneId === s.id
    && p.boardId === s.sceneSlug && p.sceneVersion === s.sceneVersion)), "Authored scene scope changed before the worker write");
  const all = await tx.targetVariantAsset.findMany({ where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId: input.gameId } } },
    include: { targetInstance: { select: { gameSceneId: true, targetId: true } } }, orderBy: { id: "asc" } });
  demand(all.length === 45, "The authored world changed before the worker write");
  const assets = await tx.asset.findMany({ where: { id: { in: [plan.identityAssetId, ...plan.others.map(o => o.assetId), ...plan.reviewOnly.map(o => o.assetId)] } } });
  const identity = assets.find(a => a.id === plan.identityAssetId);
  demand(identity && identity.ownerId === plan.ownerId && identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE"
    && identity.status === "READY" && !identity.deletedAt, "Canonical identity lifecycle changed before the worker write");
  for (const frozen of plan.others) {
    const row = all.find(r => r.id === frozen.rowId), asset = assets.find(a => a.id === frozen.assetId);
    demand(row && asset && hash(asset) === frozen.assetSha256 && localPatchRepairSiblingInvariantHash(row) === frozen.invariantSha256
      && (row.judgeJson === frozen.judgeJson || frozen.reviewState === "pending-board-review"), "An unselected appearance changed before the worker write");
    if (row.judgeJson !== frozen.judgeJson) {
      const current = JSON.parse(row.judgeJson ?? "null");
      demand(current?.reviewState === "board-review-complete" && current.hide === frozen.hideId
        && current.judgedSha256 === frozen.imageSha256 && current.geometrySha256 === frozen.geometrySha256,
      "A pending sibling changed without a bound first review");
      await publication({ db: tx as Container["db"] }, plan, frozen.hideId, row, frozen.imageSha256, frozen.geometrySha256);
    }
  }
  for (const scope of plan.selected) {
    const row = all.find(r => r.id === scope.rowId);
    demand(row && row.provider === LOCAL_PATCH_PROVIDER && row.targetInstanceId === scope.targetInstanceId
      && row.targetInstance.gameSceneId === scope.sceneId && (row.attempts === 3 && row.status === "FAILED" && rowHash(row) === scope.originalRowSha256
        || row.attempts === 4 && ["PENDING", "GENERATED", "FAILED"].includes(row.status)), "A selected attempt changed before the worker write");
    if (row.status === "PENDING") demand(row.judgeJson === scope.previousJudgeJson, "Interrupted attempt evidence changed before the worker write");
  }
  for (const frozen of plan.reviewOnly) {
    const row = all.find(r => r.id === frozen.rowId), asset = assets.find(a => a.id === frozen.assetId);
    demand(row && asset && hash(asset) === frozen.assetSha256, "Review-only asset ownership changed before the worker write");
    await reviewOnlyCompletion({ db: tx as Container["db"] }, plan, frozen, row);
  }
  return { authorizedAttempt: 4 as const, directive: selected.directive };
}

/** The review-only Amazon row gains no image permission. A board may acquire
 * only its frozen new contextual question, still at the existing world cap. */
export async function requireLocalPatchExtraReview(c: Container, input: ReviewInput) {
  const plan = await readLocalPatchExtraAttemptPlan(c, input.gameId);
  demand(plan && plan.authorizationId === input.authorizationId && [...plan.selected, ...plan.reviewOnly].some(s => s.sceneId === input.sceneId),
    "This board has no scoped review authority");
  await validatePlan(c, plan);
  return { authorizationId: plan.authorizationId, assessmentMode: "visible-body-v1" as const };
}

export async function fenceLocalPatchExtraReview(tx: Prisma.TransactionClient, input: ReviewInput) {
  const plan = await readLocalPatchExtraAttemptPlan({ db: tx as Container["db"] }, input.gameId);
  demand(plan && plan.authorizationId === input.authorizationId && [...plan.selected, ...plan.reviewOnly].some(s => s.sceneId === input.sceneId),
    "This board has no scoped review authority");
  const selected = plan.selected[0]!;
  await fenceLocalPatchExtraAttempt(tx, { gameId: input.gameId, hideId: selected.hideId, rowId: selected.rowId, authorizationId: input.authorizationId });
  return { authorizationId: plan.authorizationId, assessmentMode: "visible-body-v1" as const };
}

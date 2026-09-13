import sharp from "sharp";
import type { Prisma, Asset, TargetVariantAsset } from "@prisma/client";
import type { Container } from "../container";
import { SpriteRefSchema } from "../../domain/game/config";
import { cropOf, maskForHide, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { isLocalPatchAdvisoryVersion, isLocalPatchAgeVersion, isLocalPatchStrictVersion, localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { LOCAL_PATCH_MAX_ATTEMPTS } from "../../domain/scene/local-patch-attempts";
import { CURRENT_JUDGE_PRICING_VERSION, judgeCharge } from "../../infra/generation/judge";
import { assertGenerationSpendAllowed, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { prepareLocalPatchIdentityReferences } from "./local-patch-identity-reference";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, readShippedBoardArt } from "./local-patch-hide";
import { localPatchBoardJudgeSettings, localPatchQualityDisposition, isTheModelWeAsked, judgeLocalPatchBoard, localPatchBoardJudgePrompt, localPatchBoardJudgeImages, localPatchBoardJudgeImageLabels, localPatchBoardEvidenceIds, parseLocalPatchBoardVerdicts,
  type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "./local-patch-judge";
import { localPatchPublicationGeometryHash, recordLocalPatchPublicationPolicy } from "./local-patch-publication-policy";
import { LOCAL_PATCH_PHASE_MARGIN_MS, LOCAL_PATCH_MIN_PROVIDER_MS } from "./local-patch-render";
import { purchaseOnce } from "./paid-operation";
import { sha256Bytes } from "./fixed-sprite";
import { sceneBySlug } from "../scene-catalog.service";
import type { BudgetJson } from "./world-budget";
import { LOCAL_PATCH_COMPOSITION_VERSION, LOCAL_PATCH_RETURN_GUARD } from "./local-patch-seam";

export const LOCAL_PATCH_BOARD_REVIEW_VERSION = "local-patch-board-five-luna-low/v1";
export const LOCAL_PATCH_STRICT_BOARD_REVIEW_VERSION = "local-patch-board-five-quality/v3-head-safe";
export const LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION = "local-patch-board-five-quality/v5-evidence-labeled";
export const LOCAL_PATCH_REVIEW_CONTEXT_PX = 64;
export const LOCAL_PATCH_REVIEW_CLOSEUP_GUARD_PX = LOCAL_PATCH_RETURN_GUARD;
// Historical paid replies remain addressable for deletion/reconciliation even
// after a new deterministic compositor gives the same attempt a new question.
export const LOCAL_PATCH_REVIEW_COMPOSITION_HISTORY = [null, "bounded-return/v2-head-safe"] as const;
export const localPatchBoardReviewKey = (boardId: string, attempts?: readonly number[], compositionVersion: string | null = LOCAL_PATCH_COMPOSITION_VERSION, contentVersion = 8) => {
  if (!attempts) return `board:${boardId}:five-review:1`;
  if (attempts.length !== 5 || attempts.some(n => !Number.isInteger(n) || n < 1 || n > LOCAL_PATCH_MAX_ATTEMPTS)) throw new Error("Invalid board-review attempt revision");
  if (compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION && !LOCAL_PATCH_REVIEW_COMPOSITION_HISTORY.some(version => version === compositionVersion)) throw new Error("Unsupported board-review composition revision");
  return `board:${boardId}:five-review:v${isLocalPatchAgeVersion(contentVersion) ? 9 : 8}:${attempts.join("-")}${compositionVersion === null ? "" : `:${compositionVersion.replaceAll("/", ".")}`}${isLocalPatchAgeVersion(contentVersion) ? ":evidence-v5" : ""}`;
};
/** All bounded candidates, including a paid reply retained before its row commit. */
export function localPatchBoardReviewKeys(boardId: string, contentVersion = 8): string[] {
  const vectors: number[][] = [[]];
  for (let position = 0; position < 5; position++) {
    const prior = vectors.splice(0);
    for (const vector of prior) for (let attempt = 1; attempt <= LOCAL_PATCH_MAX_ATTEMPTS; attempt++) vectors.push([...vector, attempt]);
  }
  const versions = [...new Set<string | null>([...LOCAL_PATCH_REVIEW_COMPOSITION_HISTORY, LOCAL_PATCH_COMPOSITION_VERSION])];
  const current = vectors.flatMap(vector => versions.map(version => localPatchBoardReviewKey(boardId, vector, version, contentVersion)));
  // V4's unlabelled paid evidence remains discoverable. It is never reparsed as
  // the new labelled question, nor forgotten by privacy deletion/reconciliation.
  return [localPatchBoardReviewKey(boardId), ...current,
    ...(isLocalPatchAgeVersion(contentVersion) ? current.map(key => key.replace(/:evidence-v5$/, "")) : [])];
}
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
function demand(value: unknown, message: string): asserts value { if (!value) throw new Error(`LOCAL_PATCH_BOARD_REVIEW: ${message}`); }
export type LocalPatchBoardReviewOutcome = { state: "done" | "pending" | "held" | "retry" | "blocked"; reason: string | null; replayed: boolean; costCents: number };
export type LocalPatchBoardReviewDeps = {
  fence(tx: Prisma.TransactionClient): Promise<void>;
  apiKey?: string;
  judge?(request: LocalPatchBoardJudgeRequest): Promise<LocalPatchBoardJudgeResult>;
  readBoardArt?(relativePath: string, expectedSha256: string): Promise<Buffer>;
};

/** One paid review of the actual five-patch board; no per-hide review purchases.
 * The response is retained before settlement, and all five findings + publication
 * bindings commit together behind the existing lifecycle and queue fences. */
export async function reviewLocalPatchBoard(c: Container, input: { gameId: string; sceneId: string; deadlineAt?: number },
  deps: LocalPatchBoardReviewDeps): Promise<LocalPatchBoardReviewOutcome> {
  const scene = await c.db.gameScene.findUniqueOrThrow({ where: { id: input.sceneId },
    include: { game: { include: { childProfile: true } }, targets: { include: { variants: true } } } });
  const game = scene.game, child = game.childProfile;
  const strict = isLocalPatchStrictVersion(scene.sceneVersion);
  const reviewVersion = isLocalPatchAgeVersion(scene.sceneVersion) ? LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION
    : strict ? LOCAL_PATCH_STRICT_BOARD_REVIEW_VERSION : LOCAL_PATCH_BOARD_REVIEW_VERSION;
  const settings = localPatchBoardJudgeSettings(scene.sceneVersion);
  demand(game.id === input.gameId && game.styleVersion === "local-patch-world-v1" && game.status === "TARGETS_GENERATING"
    && !game.deletedAt && game.ownerId && child && !child.deletedAt && child.ownerId === game.ownerId
    && isLocalPatchAdvisoryVersion(scene.sceneVersion), "A live catalog-7 owned game is required");
  const board = localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion);
  const versions = await c.db.gameScene.findMany({ where: { gameId: game.id }, select: { sceneVersion: true } });
  demand(versions.length > 0 && versions.every(row => row.sceneVersion === scene.sceneVersion), "Mixed content versions cannot acquire an advisory review");
  demand(board?.hides.length === 5 && scene.targets.length === 5, "Five authored targets are required");
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(game.id);
  demand(child.identityAssetId && child.ageYears, "Identity source is missing");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  demand(identity.ownerId === game.ownerId && identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE"
    && identity.status === "READY" && !identity.deletedAt, "Identity is unavailable or unrelated");
  const sheet = await c.storage.get(identity.storagePath);
  const references = await prepareLocalPatchIdentityReferences(sheet, scene.sceneVersion);
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  await requireBoardWizardIdentityApproval(c, budget, { gameId: game.id, identityAssetId: identity.id,
    sheetSha256: sha256Bytes(sheet), catalogSha256, photoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears,
    crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null, contentVersion: scene.sceneVersion });
  const definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
  demand(`public${definition.art.base}` === board.art, "The scene ships a different original board");
  const before = await (deps.readBoardArt ?? readShippedBoardArt)(board.art, definition.art.sha256 ?? "");
  const meta = await sharp(before, { limitInputPixels: 8_294_400 }).metadata();
  demand(meta.width === definition.art.width && meta.height === definition.art.height, "Original board dimensions changed");
  const entries: { hide: LocalPatchHide; row: TargetVariantAsset; asset: Asset; bytes: Buffer;
    crop: ReturnType<typeof cropOf>; imageSha256: string; geometrySha256: string }[] = [];
  for (const hide of board.hides) {
    const target = scene.targets.find(t => t.targetId === hide.targetId);
    const row = target?.variants.find(v => v.variant === LOCAL_PATCH_VARIANT);
    if (!row || row.status !== "GENERATED" || !row.assetId) return { state: "pending", reason: "Five usable patches are not ready", costCents: 0, replayed: false };
    demand(row.provider === LOCAL_PATCH_PROVIDER && row.rectJson && row.hitRectJson && row.headAnchorJson, "Patch metadata is incomplete");
    const asset = await c.db.asset.findUniqueOrThrow({ where: { id: row.assetId } });
    demand(asset.ownerId === game.ownerId && asset.type === "TARGET_SPRITE" && asset.visibility === "GAME" && asset.status === "READY"
      && !asset.deletedAt && asset.provider === LOCAL_PATCH_PROVIDER && asset.providerRequestId === game.id, "Patch belongs to another game or is unavailable");
    const bytes = await c.storage.get(asset.storagePath), crop = cropOf(hide);
    let completed: Record<string, unknown> | null = null;
    try { completed = JSON.parse(row.judgeJson ?? "null"); } catch { /* refused below */ }
    const imageSha256 = sha256Bytes(bytes), geometrySha256 = localPatchPublicationGeometryHash(row);
    // This is evidence produced at render completion, not a new binding minted
    // from whatever bytes happened to be present when a review first started.
    demand(completed && completed.hide === hide.id && completed.pose === hide.pose
      && completed.judgedSha256 === imageSha256 && completed.geometrySha256 === geometrySha256
      && ["pending-board-review", "board-review-complete"].includes(String(completed.reviewState)),
    "Shipping image or geometry no longer matches its render-completion binding");
    if (strict && completed.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION) return {
      state: "pending", reason: "Retained image awaits the current head-safe compositor", costCents: 0, replayed: false,
    };
    const dimensions = await sharp(bytes, { limitInputPixels: 8_294_400 }).metadata();
    demand(dimensions.width === crop.width && dimensions.height === crop.height && (dimensions.pages ?? 1) === 1, "Patch raster differs from its shipping rectangle");
    const sprite = SpriteRefSchema.parse({ kind: "image", url: "https://example.invalid/retained.png", width: asset.width, height: asset.height,
      rect: JSON.parse(row.rectJson), hitRect: JSON.parse(row.hitRectJson), anchor: JSON.parse(row.headAnchorJson) });
    demand(sprite.kind === "image" && sprite.rect && sprite.rect.x === crop.left / meta.width! && sprite.rect.y === crop.top / meta.height!
      && sprite.rect.w === crop.width / meta.width! && sprite.rect.h === crop.height / meta.height!, "Shipping placement differs from the authored crop");
    entries.push({ hide, row, asset, bytes, crop, imageSha256, geometrySha256 });
  }
  // Historical v7 reviews its five-patch composition. V8 plays serially: the
  // original board provides context, and each AFTER is its own base+one patch.
  const composed = strict ? before : await sharp(before).composite(entries.map(e => ({ input: e.bytes, left: e.crop.left, top: e.crop.top }))).png().toBuffer();
  const request: LocalPatchBoardJudgeRequest = { boardId: board.board, ...(strict ? { contentVersion: scene.sceneVersion } : {}),
    boardPng: await sharp(composed).resize(1536, 1024, { fit: "inside" }).png().toBuffer(),
    identityPng: references.judgeIdentityPng,
    hides: await Promise.all(entries.map(async e => {
      const left = Math.max(0, e.crop.left - LOCAL_PATCH_REVIEW_CONTEXT_PX), top = Math.max(0, e.crop.top - LOCAL_PATCH_REVIEW_CONTEXT_PX);
      const context = strict ? { left, top,
        width: Math.min(meta.width!, e.crop.left + e.crop.width + LOCAL_PATCH_REVIEW_CONTEXT_PX) - left,
        height: Math.min(meta.height!, e.crop.top + e.crop.height + LOCAL_PATCH_REVIEW_CONTEXT_PX) - top,
      } : e.crop;
      const beforePng = await sharp(before).extract(context).png().toBuffer();
      // Keep untouched pixels on both sides of the rectangle boundary visible.
      // Compositing the extracted context is pixel-equivalent to extracting it
      // from base+this single patch; no sibling patch may enter the evidence.
      const afterPng = strict ? await sharp(beforePng).composite([{ input: e.bytes,
        left: e.crop.left - context.left, top: e.crop.top - context.top }]).png().toBuffer()
        : await sharp(composed).extract(e.crop).png().toBuffer();
      let closeupPng: Buffer | undefined, afterEvidencePng: Buffer | undefined;
      if (strict) {
        const mask = maskForHide(e.hide), guard = LOCAL_PATCH_REVIEW_CLOSEUP_GUARD_PX;
        const detailLeft = e.crop.left + Math.max(0, mask.left - guard), detailTop = e.crop.top + Math.max(0, mask.top - guard);
        const detail = { left: detailLeft, top: detailTop,
          width: e.crop.left + Math.min(e.crop.width, mask.left + mask.width + guard) - detailLeft,
          height: e.crop.top + Math.min(e.crop.height, mask.top + mask.height + guard) - detailTop };
        // Native pixels: no resizing and no generated sibling can mask a flat
        // scalp cut. Extract the actual serial player image, not the raw render.
        closeupPng = await sharp(e.bytes).extract({ left: detail.left - e.crop.left, top: detail.top - e.crop.top,
          width: detail.width, height: detail.height }).png().toBuffer();
        // Keep the same bounded twelve-image wire. The right panel repeats the
        // native head region for deliberate inspection; neither panel is scaled.
        afterEvidencePng = await sharp({ create: { width: context.width + 24 + detail.width,
          height: Math.max(context.height, detail.height), channels: 4, background: "white" } }).composite([
          { input: afterPng, left: 0, top: 0 }, { input: closeupPng, left: context.width + 24, top: 0 },
        ]).png().toBuffer();
      }
      return { hideId: e.hide.id, beforePng, afterPng, ...(closeupPng && afterEvidencePng ? { closeupPng, afterEvidencePng } : {}),
        expectation: { ageYears: child.ageYears, support: `${e.hide.pose} on ${board.ground}` } };
    })),
  };
  const fingerprint = hash({ version: reviewVersion, sceneId: scene.id, contentVersion: scene.sceneVersion,
    settings, prompt: localPatchBoardJudgePrompt(request),
    identitySha256: sha256Bytes(sheet), originalSha256: sha256Bytes(before), composedSha256: sha256Bytes(composed),
    wireHashes: localPatchBoardJudgeImages(request).map(sha256Bytes),
    ...(isLocalPatchAgeVersion(scene.sceneVersion) ? { evidenceIds: localPatchBoardEvidenceIds(request), imageLabels: localPatchBoardJudgeImageLabels(request) } : {}),
    ...(strict ? { compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION } : {}),
    hides: entries.map(e => ({ hide: e.hide.id, target: e.row.targetInstanceId, attempts: e.row.attempts, asset: e.asset.id,
      imageSha256: e.imageSha256, geometrySha256: e.geometrySha256 })),
  });
  const requestKey = localPatchBoardReviewKey(board.board, strict ? entries.map(e => e.row.attempts) : undefined, LOCAL_PATCH_COMPOSITION_VERSION, scene.sceneVersion);
  demand(deps.judge || deps.apiKey?.trim(), "Configured existing judge credential is required");
  // Unlike a replay, a new dispatch must consult the current kill switch/owner.
  await assertGenerationSpendAllowed(c, game.ownerId);
  await c.db.$transaction(async tx => { await fenceLocalPatchImages(tx, game.id); await deps.fence(tx); });
  const bought = await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, game.id, budget) }, {
    worldId, requestKey, scope: "judge", operationFingerprint: fingerprint, reserveMicroUsd: 30_000,
    ...(input.deadlineAt === undefined ? {} : { dispatchWindow: { deadlineAt: input.deadlineAt,
      needMs: LOCAL_PATCH_MIN_PROVIDER_MS.judge + LOCAL_PATCH_PHASE_MARGIN_MS, retainMs: LOCAL_PATCH_PHASE_MARGIN_MS } }),
    buy: async ({ timeoutMs }) => {
      const reply = await (deps.judge ?? (r => judgeLocalPatchBoard(deps.apiKey!, r)))({ ...request,
        ...(timeoutMs === null ? {} : { timeoutMs: Math.min(timeoutMs, settings.timeoutMs) }) });
      // Reparse retained raw text on every replay; an adapter cannot mint passes.
      const keep = { raw: reply.raw, usage: reply.usage, requestId: reply.requestId, model: reply.model,
        finishReason: reply.finishReason, wireFault: reply.wireFault, costUnknown: reply.costUnknown };
      const bytes = Buffer.from(JSON.stringify(keep)), charge = judgeCharge(reply.model ?? "", reply.usage ?? undefined, CURRENT_JUDGE_PRICING_VERSION);
      if (reply.costUnknown || charge.costUnknown || !reply.requestId) return { bytes, unknownReason: "Grouped review charge could not be verified" };
      return { bytes, evidence: { providerNamespace: "openai:find-me-existing", providerRequestId: reply.requestId,
        usageId: hash(reply.usage), rawUsage: reply.usage as BudgetJson, model: reply.model!, amountMicroUsd: Math.ceil(charge.costCents * 10_000),
        costBasis: "conservative-upper-estimate" as const } };
    },
  });
  if (bought.kind !== "bought") return { state: bought.kind === "unresolved" || (bought.kind === "deferred" && bought.reserved) ? "held" : "pending",
    reason: bought.reason, replayed: false, costCents: 0 };
  const keep = JSON.parse(bought.bytes.toString()) as { raw: string | null; wireFault: string | null; model: string | null; finishReason: string | null };
  const readable = !keep.wireFault && isTheModelWeAsked(keep.model, settings.model) && keep.finishReason === "stop";
  const verdicts = parseLocalPatchBoardVerdicts(readable ? keep.raw : null, entries.map(e => e.hide.id), scene.sceneVersion);
  const dispositions = entries.map(e => strict ? localPatchQualityDisposition(verdicts[e.hide.id] ?? null, scene.sceneVersion) : { state: "acceptable" as const, faults: [] });
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, game.id); await deps.fence(tx);
    for (const [index, e] of entries.entries()) {
      const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: e.row.id } });
      demand(current.status === "GENERATED" && current.assetId === e.asset.id && current.attempts === e.row.attempts
        && localPatchPublicationGeometryHash(current) === e.geometrySha256, "Target changed while its board was reviewed");
      const prior = JSON.parse(current.judgeJson ?? "{}");
      const disposition = dispositions[index]!;
      const judgeJson = JSON.stringify({ ...prior, reviewState: "board-review-complete", verdict: verdicts[e.hide.id] ?? null,
        wireFault: keep.wireFault ?? (verdicts[e.hide.id] ? null : "schema"), judgedSha256: e.imageSha256,
        ...(strict ? { qualityDisposition: disposition, compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION } : {}),
        boardReview: { version: reviewVersion, fingerprint, requestKey, composedSha256: sha256Bytes(composed),
          ...(strict ? { compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION, wireHashes: localPatchBoardJudgeImages(request).map(sha256Bytes) } : {}),
          ...(isLocalPatchAgeVersion(scene.sceneVersion) ? { evidenceIds: localPatchBoardEvidenceIds(request), imageLabels: localPatchBoardJudgeImageLabels(request) } : {}),
          model: keep.model, effort: settings.effort, raw: keep.raw, costMicroUsd: bought.evidence.amountMicroUsd },
      });
      const rejected = disposition.state !== "acceptable";
      const retainedIds: unknown = JSON.parse(current.rejectedAssetIdsJson ?? "[]");
      demand(Array.isArray(retainedIds) && retainedIds.every(id => typeof id === "string"), "Rejected image inventory is malformed");
      await tx.targetVariantAsset.update({ where: { id: e.row.id }, data: { judgeJson, ...(rejected ? {
        status: "FAILED", lastError: `quality-${disposition.state}: ${disposition.faults.join("; ") || "Required quality evidence is unresolved"}`.slice(0, 500),
        rejectedAssetIdsJson: JSON.stringify([...new Set([...retainedIds, e.asset.id])]),
      } : {}) } });
      if (rejected) await tx.targetInstance.update({ where: { id: e.row.targetInstanceId }, data: { status: "FAILED" } });
      if (!rejected) await recordLocalPatchPublicationPolicy(tx, { gameId: game.id, sceneVersion: scene.sceneVersion, hideId: e.hide.id,
        variantId: e.row.id, attempts: e.row.attempts, identityAssetId: identity.id, identitySha256: sha256Bytes(sheet),
        assetId: e.asset.id, imageSha256: e.imageSha256, geometrySha256: e.geometrySha256, judgeJson });
    }
  }, { timeout: 30_000 });
  const blocked = dispositions.some(d => d.state === "unresolved");
  const retry = dispositions.some(d => d.state === "retry");
  return { state: blocked ? "blocked" : retry ? "retry" : "done",
    reason: blocked ? "Required quality evidence is unresolved" : retry ? (isLocalPatchAgeVersion(scene.sceneVersion)
      ? "Required visual quality defect requires a bounded replacement" : "Severe seam or face defect requires a bounded replacement") : null,
    replayed: bought.replayed, costCents: bought.evidence.amountMicroUsd / 10_000 };
}

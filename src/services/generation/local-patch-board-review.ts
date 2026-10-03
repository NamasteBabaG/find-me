import sharp from "sharp";
import { prepareNeighborComparisons, prepareBoundaryComparisons } from "./local-patch-integration-evidence";
import type { Prisma, Asset, TargetVariantAsset } from "@prisma/client";
import type { Container } from "../container";
import { SpriteRefSchema } from "../../domain/game/config";
import { cropOf, maskForHide, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { isCollectionVersion, localPatchHidesPerBoard, isLocalPatchAdvisoryVersion, isLocalPatchAgeVersion, isLocalPatchStrictVersion, localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { LOCAL_PATCH_MAX_ATTEMPTS } from "../../domain/scene/local-patch-attempts";
import { CURRENT_JUDGE_PRICING_VERSION, judgeCharge } from "../../infra/generation/judge";
import { assertGenerationSpendAllowed, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { identityStyleCatalogSha256 } from "./local-patch-identity-catalog";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { prepareLocalPatchIdentityReferences } from "./local-patch-identity-reference";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, readShippedBoardArt } from "./local-patch-hide";
import { LOCAL_PATCH_JUDGE, requestJudgeWire, localPatchBoardJudgeSettings, localPatchQualityDisposition, isTheModelWeAsked, judgeLocalPatchBoard, localPatchBoardJudgePrompt, localPatchBoardJudgeImages, localPatchBoardJudgeImageLabels, localPatchBoardEvidenceIds, parseLocalPatchBoardVerdicts,
  type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "./local-patch-judge";
import { localPatchPublicationGeometryHash, recordLocalPatchPublicationPolicy, hasLocalPatchPublicationPolicy } from "./local-patch-publication-policy";
import { SELF_REPAIR_COMPOSITION_VERSION, selfRepairDecisionSchema } from "../../domain/scene/local-patch-self-repair";
import { inventorySelfRepairRequest } from "./local-patch-self-repair";
import { LOCAL_PATCH_PHASE_MARGIN_MS, LOCAL_PATCH_MIN_PROVIDER_MS } from "./local-patch-render";
import { purchaseOnce } from "./paid-operation";
import { sha256Bytes } from "./fixed-sprite";
import { sceneBySlug } from "../scene-catalog.service";
import type { BudgetJson } from "./world-budget";
import { LOCAL_PATCH_COMPOSITION_VERSION, LOCAL_PATCH_RETURN_GUARD } from "./local-patch-seam";
import { readLocalPatchExtraAttemptPlan, requireLocalPatchExtraReview, fenceLocalPatchExtraReview } from "./local-patch-extra-attempt";
import { localPatchEvidenceRecovery } from "./local-patch-review-recovery";
import { recoverPreparedLocalPatchReview } from "./local-patch-review-interruption-recovery";
import { needsPlayerReview, playerReviewEnabled, PLAYER_REVIEW_MODE, PLAYER_REVIEW_VERSION } from "./local-patch-player-review";

export const LOCAL_PATCH_BOARD_REVIEW_VERSION = "local-patch-board-five-luna-low/v1";
export const LOCAL_PATCH_STRICT_BOARD_REVIEW_VERSION = "local-patch-board-five-quality/v3-head-safe";
export const LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION = "local-patch-board-five-quality/v5-evidence-labeled";
export const LOCAL_PATCH_REVIEW_CONTEXT_PX = 64;
export const LOCAL_PATCH_REVIEW_CLOSEUP_GUARD_PX = LOCAL_PATCH_RETURN_GUARD;
// Historical paid replies remain addressable for deletion/reconciliation even
// after a new deterministic compositor gives the same attempt a new question.
export const LOCAL_PATCH_REVIEW_COMPOSITION_HISTORY = [null, "bounded-return/v2-head-safe"] as const;
export const localPatchBoardReviewKey = (boardId: string, attempts?: readonly number[], compositionVersion: string | null = LOCAL_PATCH_COMPOSITION_VERSION, contentVersion = 8, maximumAttempt: 3 | 4 = LOCAL_PATCH_MAX_ATTEMPTS) => {
  if (!attempts) return `board:${boardId}:five-review:1`;
  if (attempts.length !== localPatchHidesPerBoard(contentVersion) || attempts.some(n => !Number.isInteger(n) || n < 1 || n > maximumAttempt)) throw new Error("Invalid board-review attempt revision");
  if (compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION && !LOCAL_PATCH_REVIEW_COMPOSITION_HISTORY.some(version => version === compositionVersion)) throw new Error("Unsupported board-review composition revision");
  return `board:${boardId}:${isCollectionVersion(contentVersion) ? "three" : "five"}-review:v${isCollectionVersion(contentVersion) ? contentVersion : isLocalPatchAgeVersion(contentVersion) ? 9 : 8}:${attempts.join("-")}${compositionVersion === null ? "" : `:${compositionVersion.replaceAll("/", ".")}`}${isLocalPatchAgeVersion(contentVersion) ? ":evidence-v5" : ""}`;
};
/** All bounded candidates, including a paid reply retained before its row commit. */
export function localPatchBoardReviewKeys(boardId: string, contentVersion = 8): string[] {
  const vectors: number[][] = [[]];
  for (let position = 0; position < localPatchHidesPerBoard(contentVersion); position++) {
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

/** Read-only reconstruction of the exact question. Recovery may inspect FAILED
 * v9 rows, but gets no authority to dispatch, settle or publish from this API. */
export async function prepareLocalPatchBoardReview(c: Container, input: { gameId: string; sceneId: string },
  deps: Pick<LocalPatchBoardReviewDeps, "readBoardArt">, options: { recovery?: boolean; includePlayerCandidates?: boolean; playerReview?: boolean; skipApprovedEvidence?: boolean } = {}) {
  const scene = await c.db.gameScene.findUniqueOrThrow({ where: { id: input.sceneId },
    include: { game: { include: { childProfile: true } }, targets: { include: { variants: true } } } });
  const game = scene.game, child = game.childProfile;
  const strict = isLocalPatchStrictVersion(scene.sceneVersion);
  const reviewVersion = options.playerReview ? PLAYER_REVIEW_VERSION : isLocalPatchAgeVersion(scene.sceneVersion) ? LOCAL_PATCH_AGE_BOARD_REVIEW_VERSION
    : strict ? LOCAL_PATCH_STRICT_BOARD_REVIEW_VERSION : LOCAL_PATCH_BOARD_REVIEW_VERSION;
  let settings: { model: string; effort: "low" | "medium"; maxOutputTokens: number; endpoint: string; timeoutMs: number } = localPatchBoardJudgeSettings(scene.sceneVersion);
  demand(game.id === input.gameId && game.styleVersion === "local-patch-world-v1"
    && (game.status === "TARGETS_GENERATING" || options.recovery && isLocalPatchAgeVersion(scene.sceneVersion) && game.status === "GENERATION_FAILED")
    && !game.deletedAt && game.ownerId && child && !child.deletedAt && child.ownerId === game.ownerId
    && isLocalPatchAdvisoryVersion(scene.sceneVersion), "A live catalog-7 owned game is required");
  const board = localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion);
  const stagedExtra = isLocalPatchAgeVersion(scene.sceneVersion) ? await readLocalPatchExtraAttemptPlan(c, game.id) : null;
  const extraPlan = stagedExtra && [...stagedExtra.selected, ...stagedExtra.reviewOnly].some(entry => entry.sceneId === scene.id) ? stagedExtra : null;
  const incremental = scene.sceneVersion === 12 && !extraPlan && !options.recovery;
  demand(!options.playerReview || incremental, "Player calibration requires an ordinary v12 review");
  const versions = await c.db.gameScene.findMany({ where: { gameId: game.id }, select: { sceneVersion: true } });
  demand(versions.length > 0 && versions.every(row => row.sceneVersion === scene.sceneVersion), "Mixed content versions cannot acquire an advisory review");
  demand(board?.hides.length === localPatchHidesPerBoard(scene.sceneVersion)
    && (incremental ? scene.targets.length <= board.hides.length
      && scene.targets.every(target => board.hides.some(hide => hide.targetId === target.targetId))
      : scene.targets.length === board.hides.length), "Every target must belong to the authored board");
  const budget = boardWizardBudgetOf(c), worldId = boardWizardWorldId(game.id);
  demand(child.identityAssetId && child.ageYears, "Identity source is missing");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  demand(identity.ownerId === game.ownerId && identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE"
    && identity.status === "READY" && !identity.deletedAt, "Identity is unavailable or unrelated");
  const sheet = await c.storage.get(identity.storagePath);
  const references = await prepareLocalPatchIdentityReferences(sheet, scene.sceneVersion);
  const catalogSha256 = await identityStyleCatalogSha256(scene.sceneSlug, scene.sceneVersion);
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
    if (!row || !(row.status === "GENERATED" || incremental && (localPatchEvidenceRecovery(row)?.retry
      || options.includePlayerCandidates && needsPlayerReview(row)) || (options.recovery && isLocalPatchAgeVersion(scene.sceneVersion)
      || extraPlan?.reviewOnly.some(entry => entry.rowId === row.id)) && row.status === "FAILED") || !row.assetId)
      { if (incremental) continue; return { ready: false as const, reason: "Usable patches are not ready" }; }
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
    if (strict && completed.compositionVersion !== LOCAL_PATCH_COMPOSITION_VERSION
      && !(isCollectionVersion(scene.sceneVersion) && completed.compositionVersion === SELF_REPAIR_COMPOSITION_VERSION
        && selfRepairDecisionSchema.safeParse((completed.selfRepair as { decision?: unknown } | undefined)?.decision).success))
      return { ready: false as const, reason: "Retained image awaits the current head-safe compositor" };
    const dimensions = await sharp(bytes, { limitInputPixels: 8_294_400 }).metadata();
    demand(dimensions.width === crop.width && dimensions.height === crop.height && (dimensions.pages ?? 1) === 1, "Patch raster differs from its shipping rectangle");
    const sprite = SpriteRefSchema.parse({ kind: "image", url: "https://example.invalid/retained.png", width: asset.width, height: asset.height,
      rect: JSON.parse(row.rectJson), hitRect: JSON.parse(row.hitRectJson), anchor: JSON.parse(row.headAnchorJson) });
    demand(sprite.kind === "image" && sprite.rect && sprite.rect.x === crop.left / meta.width! && sprite.rect.y === crop.top / meta.height!
      && sprite.rect.w === crop.width / meta.width! && sprite.rect.h === crop.height / meta.height!, "Shipping placement differs from the authored crop");
    entries.push({ hide, row, asset, bytes, crop, imageSha256, geometrySha256 });
  }
  if (!entries.length) return { ready: false as const, reason: "No ready appearance awaits review" };
  if (entries.some(entry => entry.row.attempts > LOCAL_PATCH_MAX_ATTEMPTS)) {
    demand(extraPlan, "A fourth-attempt review requires its original scoped authority");
  }
  if (extraPlan) await requireLocalPatchExtraReview(c, { gameId: game.id, sceneId: scene.id, authorizationId: extraPlan.authorizationId });
  // A new candidate does not retire the original approvals of unchanged
  // siblings. Previously unreviewed siblings DO receive their first real review.
  const protectedRows = new Set(extraPlan?.others.filter(entry => entry.reviewState === "board-review-complete").map(entry => entry.rowId));
  const recovering = isCollectionVersion(scene.sceneVersion) && entries.some(e => JSON.parse(e.row.judgeJson!).compositionVersion === SELF_REPAIR_COMPOSITION_VERSION);
  if (recovering && scene.sceneVersion !== 12) settings = LOCAL_PATCH_JUDGE;
  if (recovering || incremental) for (const e of entries) {
    if (await hasLocalPatchPublicationPolicy(c, { gameId: game.id, sceneVersion: scene.sceneVersion, hideId: e.hide.id,
      variantId: e.row.id, attempts: e.row.attempts, identityAssetId: identity.id, identitySha256: sha256Bytes(sheet),
      assetId: e.asset.id, imageSha256: e.imageSha256, geometrySha256: e.geometrySha256, judgeJson: e.row.judgeJson })) protectedRows.add(e.row.id);
  }
  // Keep ownership, bytes, geometry and original approvals checked. Avoid
  // rebuilding eight large evidence panels for an unchanged approved sibling.
  if (options.skipApprovedEvidence && (recovering || incremental) && protectedRows.size === entries.length) {
    return { ready: false as const, reason: "Other appearances await generation or review", alreadyReviewed: true as const,
      boardComplete: entries.length === board.hides.length };
  }
  let evidenceReviewAttempt = 1;
  let requestEntries = entries;
  let readyScope = false;
  // New ordinary reviews need only the selected evidence. Do not reconstruct
  // all three large native panels unless replay requires the old full question.
  if (incremental && (!recovering || options.playerReview)) {
    const unapproved = entries.filter(e => !protectedRows.has(e.row.id));
    const oldKey = entries.length === board.hides.length ? localPatchBoardReviewKey(board.board, entries.map(e => e.row.attempts),
      LOCAL_PATCH_COMPOSITION_VERSION, scene.sceneVersion) : null;
    if (options.playerReview || !oldKey || unapproved.some(e => localPatchEvidenceRecovery(e.row)) || !await budget.readRequest(worldId, oldKey)) {
      requestEntries = [(unapproved.length ? unapproved : entries).sort((a, b) => (localPatchEvidenceRecovery(a.row)?.nextAttempt ?? 1)
        - (localPatchEvidenceRecovery(b.row)?.nextAttempt ?? 1))[0]!];
      evidenceReviewAttempt = localPatchEvidenceRecovery(requestEntries[0]!.row)?.nextAttempt ?? 1;
      if (evidenceReviewAttempt > 1) settings = { ...settings, effort: "medium" };
      readyScope = true;
    }
  }
  // Historical v7 reviews its five-patch composition. V8 plays serially: the
  // original board provides context, and each AFTER is its own base+one patch.
  const composed = strict ? before : await sharp(before).composite(entries.map(e => ({ input: e.bytes, left: e.crop.left, top: e.crop.top }))).png().toBuffer();
  let request: LocalPatchBoardJudgeRequest = { boardId: board.board, ...(strict ? { contentVersion: scene.sceneVersion } : {}),
    ...(options.playerReview ? { assessmentMode: PLAYER_REVIEW_MODE } : {}),
    ...(readyScope ? { reviewScope: "ready-only/v1" as const } : {}),
    ...(extraPlan ? { assessmentMode: "visible-body-v1" as const } : {}),
    boardPng: await sharp(composed).resize(1536, 1024, { fit: "inside" }).png().toBuffer(),
    identityPng: references.judgeIdentityPng,
    hides: await Promise.all(requestEntries.map(async e => {
      const padding = options.playerReview ? 192 : LOCAL_PATCH_REVIEW_CONTEXT_PX;
      const left = Math.max(0, e.crop.left - padding), top = Math.max(0, e.crop.top - padding);
      const context = strict ? { left, top,
        width: Math.min(meta.width!, e.crop.left + e.crop.width + padding) - left,
        height: Math.min(meta.height!, e.crop.top + e.crop.height + padding) - top,
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
        const receipt = JSON.parse(e.row.judgeJson!);
        const mask = receipt.compositionVersion === SELF_REPAIR_COMPOSITION_VERSION
          ? selfRepairDecisionSchema.parse(receipt.selfRepair.decision).faceRect : maskForHide(e.hide);
        const guard = LOCAL_PATCH_REVIEW_CLOSEUP_GUARD_PX;
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
      const receipt = JSON.parse(e.row.judgeJson!);
      const mask = maskForHide(e.hide), guard = LOCAL_PATCH_RETURN_GUARD;
      const returned = receipt.compositionVersion === SELF_REPAIR_COMPOSITION_VERSION
        ? selfRepairDecisionSchema.parse(receipt.selfRepair.decision).returnWindow
        : { left: Math.max(0, mask.left - guard), top: Math.max(0, mask.top - guard),
          width: Math.min(e.crop.width, mask.left + mask.width + guard) - Math.max(0, mask.left - guard),
          height: Math.min(e.crop.height, mask.top + mask.height + guard) - Math.max(0, mask.top - guard) };
      return { hideId: e.hide.id, beforePng, afterPng, ...(closeupPng && afterEvidencePng ? { closeupPng, afterEvidencePng } : {}),
        ...(options.playerReview ? { boundaryComparisons: await prepareBoundaryComparisons(beforePng, afterPng,
          { ...returned, left: e.crop.left - context.left + returned.left, top: e.crop.top - context.top + returned.top }) }
          : scene.sceneVersion === 12 ? { neighborComparisons: await prepareNeighborComparisons(beforePng, afterPng) } : {}),
        expectation: { ageYears: child.ageYears, support: `${e.hide.pose} on ${board.ground}` } };
    })),
  };
  const question = (request: LocalPatchBoardJudgeRequest) => {
    const independent = request.reviewScope === "ready-only/v1";
    const supplied = independent ? entries.filter(e => request.hides.some(h => h.hideId === e.hide.id)) : entries;
    const repairingSupplied = independent ? supplied.some(e => JSON.parse(e.row.judgeJson!).compositionVersion === SELF_REPAIR_COMPOSITION_VERSION) : recovering;
    const prompt = localPatchBoardJudgePrompt(request) + (repairingSupplied ? " AUTONOMOUS REPAIR REVIEW: inspect the actual repaired output independently of its diagnosis. A generic child is insufficient: require the same canonical facial proportions, eyes, jaw and hair silhouette at native scale. Inspect the complete head, all visible limbs, replaced bystanders and the entire new join. Reject clipping, orphan limbs, severe seams, wrong identity, age or scale. The diagnosis is not an approval." : "")
      + (request.reviewScope === "ready-only/v1" && evidenceReviewAttempt > 1 ? " EVIDENCE RECOVERY: the previous response was unreadable, not a visual refusal. Independently inspect these exact unchanged pixels. Return only the exact JSON schema with every supplied hide and evidence ID; no prose or markdown. Do not infer the previous verdict." : "");
    const fingerprint = hash({ version: reviewVersion, sceneId: scene.id, contentVersion: scene.sceneVersion,
    settings, prompt,
    ...(request.reviewScope === "ready-only/v1" ? { evidenceReviewAttempt } : {}),
    identitySha256: sha256Bytes(sheet), originalSha256: sha256Bytes(before), composedSha256: sha256Bytes(composed),
    wireHashes: localPatchBoardJudgeImages(request).map(sha256Bytes),
    ...(isLocalPatchAgeVersion(scene.sceneVersion) ? { evidenceIds: localPatchBoardEvidenceIds(request), imageLabels: localPatchBoardJudgeImageLabels(request) } : {}),
    ...(strict ? { compositionVersion: LOCAL_PATCH_COMPOSITION_VERSION } : {}),
    ...(extraPlan ? { extraAttemptAuthorizationId: extraPlan.authorizationId, protectedRows: [...protectedRows].sort() } : {}),
    ...(repairingSupplied ? { selfRepair: supplied.map(e => JSON.parse(e.row.judgeJson!).selfRepair ?? null),
      ...(!independent ? { protectedRows: [...protectedRows].sort() } : {}) } : {}),
    hides: supplied.map(e => ({ hide: e.hide.id, target: e.row.targetInstanceId, attempts: e.row.attempts, asset: e.asset.id,
      imageSha256: e.imageSha256, geometrySha256: e.geometrySha256 })),
  });
    const requestKey = recovering || request.reviewScope === "ready-only/v1" ? `self-repair:board:${board.board}:${fingerprint}` : localPatchBoardReviewKey(board.board, strict ? entries.map(e => e.row.attempts) : undefined, LOCAL_PATCH_COMPOSITION_VERSION, scene.sceneVersion, extraPlan ? 4 : 3)
      + (extraPlan ? ":visible-body-v1" : "");
    return { prompt, fingerprint, requestKey };
  };
  // Reconstruct historical full questions only when all of their inputs exist.
  // An already-purchased question stays addressable and is replayed verbatim.
  const fullQuestion = !request.reviewScope && entries.length === board.hides.length ? question(request) : null;
  let selected = entries;
  if (incremental) {
    const unapproved = entries.filter(e => !protectedRows.has(e.row.id));
    if (unapproved.length && (!fullQuestion || unapproved.some(e => localPatchEvidenceRecovery(e.row))
      || !await budget.readRequest(worldId, fullQuestion.requestKey))) {
      selected = [unapproved.sort((a, b) => (localPatchEvidenceRecovery(a.row)?.nextAttempt ?? 1)
        - (localPatchEvidenceRecovery(b.row)?.nextAttempt ?? 1))[0]!];
      evidenceReviewAttempt = localPatchEvidenceRecovery(selected[0]!.row)?.nextAttempt ?? 1;
      if (evidenceReviewAttempt > 1) settings = { ...settings, effort: "medium" };
      const ids = new Set(selected.map(e => e.hide.id));
      request = { ...request, reviewScope: "ready-only/v1", hides: request.hides.filter(h => ids.has(h.hideId)) };
    }
    if (!fullQuestion && !request.reviewScope) request = { ...request, reviewScope: "ready-only/v1" };
  }
  let { prompt, fingerprint, requestKey } = request.reviewScope ? question(request) : fullQuestion ?? question(request);
  // Preserve any already-paid full question on replay. A new repair question
  // can omit ONLY siblings with matching image/geometry/identity approvals.
  if (!incremental && recovering && scene.sceneVersion === 12 && !extraPlan && protectedRows.size > 0 && protectedRows.size < entries.length
    && !await budget.readRequest(worldId, requestKey)) {
    const unapproved = new Set(entries.filter(e => !protectedRows.has(e.row.id)).map(e => e.hide.id));
    request = { ...request, reviewScope: "unapproved-only/v1", hides: request.hides.filter(h => unapproved.has(h.hideId)) };
    ({ prompt, fingerprint, requestKey } = question(request));
  }
  if (extraPlan) demand(extraPlan.reviewRequestKeys.includes(requestKey), "The review is outside its scoped authority");
  return { ready: true as const, scene, game, child, board, budget, worldId, identity, sheet, entries, request, fingerprint,
    requestKey, settings, strict, reviewVersion, composed, extraPlan, protectedRows, recovering, prompt, evidenceReviewAttempt };
}

/** Historical board questions replay intact. New v12 questions review one ready
 * appearance; absent siblings receive no writes or invented publication proof. */
export async function reviewLocalPatchBoard(c: Container, input: { gameId: string; sceneId: string; deadlineAt?: number },
  deps: LocalPatchBoardReviewDeps): Promise<LocalPatchBoardReviewOutcome> {
  const calibrated = playerReviewEnabled();
  const preparation = { includePlayerCandidates: calibrated, skipApprovedEvidence: true };
  let prepared = await prepareLocalPatchBoardReview(c, input, deps, preparation);
  if (prepared.ready && calibrated && prepared.scene.sceneVersion === 12 && !prepared.extraPlan) {
    const suppliedIds = new Set(prepared.request.hides.map(h => h.hideId));
    const selected = prepared.entries.filter(e => suppliedIds.has(e.hide.id));
    // Existing purchases, including unknown/pending ones, keep their exact
    // historical question. A concluded visual refusal gets ONE new assessment.
    if (selected.some(e => needsPlayerReview(e.row)) || !await prepared.budget.readRequest(prepared.worldId, prepared.requestKey))
      prepared = await prepareLocalPatchBoardReview(c, input, deps, { ...preparation, playerReview: true });
  }
  if (!prepared.ready) return { state: "alreadyReviewed" in prepared && prepared.boardComplete ? "done" : "pending",
    reason: "alreadyReviewed" in prepared && prepared.boardComplete ? null : prepared.reason, costCents: 0,
    replayed: "alreadyReviewed" in prepared };
  const { scene, game, budget, worldId, identity, sheet, entries, request, fingerprint,
    requestKey, settings, strict, reviewVersion, composed, extraPlan, protectedRows, recovering, prompt, evidenceReviewAttempt } = prepared;
  const boardComplete = entries.length === prepared.board.hides.length;
  if ((recovering || scene.sceneVersion === 12) && protectedRows.size === entries.length)
    return { state: boardComplete ? "done" : "pending", reason: boardComplete ? null : "Other appearances await generation or review", costCents: 0, replayed: true };
  demand(game.ownerId, "A review requires its verified owner");
  demand(deps.judge || deps.apiKey?.trim(), "Configured existing judge credential is required");
  // Unlike a replay, a new dispatch must consult the current kill switch/owner.
  await assertGenerationSpendAllowed(c, game.ownerId);
  await c.db.$transaction(async tx => { await fenceLocalPatchImages(tx, game.id); await deps.fence(tx); });
  if (recovering || request.reviewScope === "ready-only/v1") await inventorySelfRepairRequest(c, game.id, requestKey, deps.fence);
  const bought = await purchaseOnce({ ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, game.id, budget) }, {
    worldId, requestKey, scope: "judge", operationFingerprint: fingerprint,
    reserveMicroUsd: request.reviewScope ? 200_000 + 100_000 * request.hides.length : recovering || scene.sceneVersion === 11 || scene.sceneVersion === 12 ? 500_000 : 30_000,
    ...(input.deadlineAt === undefined ? {} : { dispatchWindow: { deadlineAt: input.deadlineAt,
      needMs: LOCAL_PATCH_MIN_PROVIDER_MS.judge + LOCAL_PATCH_PHASE_MARGIN_MS, retainMs: LOCAL_PATCH_PHASE_MARGIN_MS } }),
    buy: async ({ timeoutMs }) => {
      const reply = await (deps.judge ?? (async r => recovering ? { ...await requestJudgeWire(deps.apiKey!, {
        prompt, images: localPatchBoardJudgeImages(r), imageLabels: localPatchBoardJudgeImageLabels(r), settings, timeoutMs: r.timeoutMs,
      }, fetch), verdicts: {} } : judgeLocalPatchBoard(deps.apiKey!, r)))({ ...request,
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
  if (bought.kind !== "bought") {
    if (bought.kind === "unresolved" && await recoverPreparedLocalPatchReview(c, prepared, deps.fence))
      return { state: "pending", reason: "Interrupted review retained its full unknown charge; unchanged pixels await a new evidence question", replayed: false, costCents: 0 };
    return { state: bought.kind === "unresolved" || (bought.kind === "deferred" && bought.reserved) ? "held" : "pending",
      reason: bought.reason, replayed: false, costCents: 0 };
  }
  const keep = JSON.parse(bought.bytes.toString()) as { raw: string | null; wireFault: string | null; model: string | null; finishReason: string | null };
  const readable = !keep.wireFault && isTheModelWeAsked(keep.model, settings.model) && keep.finishReason === "stop";
  const verdicts = parseLocalPatchBoardVerdicts(readable ? keep.raw : null, request.hides.map(h => h.hideId), scene.sceneVersion, request.reviewScope, request.assessmentMode);
  const reviewedIds = new Set(request.hides.map(h => h.hideId));
  const committedEntries = entries.filter(e => protectedRows.has(e.row.id) || reviewedIds.has(e.hide.id));
  const dispositions = committedEntries.map(e => strict ? localPatchQualityDisposition(protectedRows.has(e.row.id)
    ? JSON.parse(e.row.judgeJson!).verdict : verdicts[e.hide.id] ?? null, scene.sceneVersion, { hideId: e.hide.id }) : { state: "acceptable" as const, faults: [] });
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, game.id); await deps.fence(tx);
    if (extraPlan) await fenceLocalPatchExtraReview(tx, { gameId: game.id, sceneId: scene.id, authorizationId: extraPlan.authorizationId });
    for (const [index, e] of committedEntries.entries()) {
      const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: e.row.id } });
      const reviewOnly = extraPlan?.reviewOnly.some(entry => entry.rowId === current.id);
      const evidenceOnly = request.reviewScope === "ready-only/v1" && (localPatchEvidenceRecovery(e.row)?.retry
        || request.assessmentMode === PLAYER_REVIEW_MODE && needsPlayerReview(e.row));
      demand((current.status === "GENERATED" || (reviewOnly || evidenceOnly) && current.status === "FAILED") && current.assetId === e.asset.id && current.attempts === e.row.attempts
        && current.judgeJson === e.row.judgeJson
        && localPatchPublicationGeometryHash(current) === e.geometrySha256, "Target changed while its board was reviewed");
      if (protectedRows.has(e.row.id)) {
        demand(current.judgeJson === e.row.judgeJson
          && dispositions[index]!.state === "acceptable", "An existing approval changed during the scoped review");
        continue;
      }
      const prior = JSON.parse(current.judgeJson ?? "{}");
      const compositionVersion = prior.compositionVersion === SELF_REPAIR_COMPOSITION_VERSION ? SELF_REPAIR_COMPOSITION_VERSION : LOCAL_PATCH_COMPOSITION_VERSION;
      const disposition = dispositions[index]!;
      const judgeJson = JSON.stringify({ ...prior, reviewState: "board-review-complete", verdict: verdicts[e.hide.id] ?? null,
        ...(request.assessmentMode === PLAYER_REVIEW_MODE && prior.boardReview ? { reviewHistory: [
          ...(Array.isArray(prior.reviewHistory) ? prior.reviewHistory : []),
          { boardReview: prior.boardReview, verdict: prior.verdict, qualityDisposition: prior.qualityDisposition, wireFault: prior.wireFault },
        ] } : {}),
        wireFault: keep.wireFault ?? (verdicts[e.hide.id] ? null : "schema"), judgedSha256: e.imageSha256,
        ...(strict ? { qualityDisposition: disposition, compositionVersion } : {}),
        boardReview: { version: reviewVersion, fingerprint, requestKey, composedSha256: sha256Bytes(composed),
          ...(request.assessmentMode === PLAYER_REVIEW_MODE ? { assessmentMode: PLAYER_REVIEW_MODE } : {}),
          ...(request.reviewScope ? { reviewScope: request.reviewScope, reviewedHideIds: request.hides.map(h => h.hideId), evidenceReviewAttempt,
            evidenceReviewedAt: new Date().toISOString() } : {}),
          ...(extraPlan ? { assessmentMode: "visible-body-v1", extraAttemptAuthorizationId: extraPlan.authorizationId } : {}),
          ...(strict ? { compositionVersion, wireHashes: localPatchBoardJudgeImages(request).map(sha256Bytes) } : {}),
          ...(isLocalPatchAgeVersion(scene.sceneVersion) ? { evidenceIds: localPatchBoardEvidenceIds(request), imageLabels: localPatchBoardJudgeImageLabels(request) } : {}),
          model: keep.model, effort: settings.effort, raw: keep.raw, costMicroUsd: bought.evidence.amountMicroUsd },
      });
      const rejected = disposition.state !== "acceptable";
      const retainedIds: unknown = JSON.parse(current.rejectedAssetIdsJson ?? "[]");
      demand(Array.isArray(retainedIds) && retainedIds.every(id => typeof id === "string"), "Rejected image inventory is malformed");
      await tx.targetVariantAsset.update({ where: { id: e.row.id }, data: { judgeJson, ...(rejected ? {
        status: "FAILED", lastError: `quality-${disposition.state}: ${disposition.faults.join("; ") || "Required quality evidence is unresolved"}`.slice(0, 500),
        rejectedAssetIdsJson: JSON.stringify([...new Set([...retainedIds, e.asset.id])]),
      } : reviewOnly || evidenceOnly ? { status: "GENERATED", lastError: null } : {}) } });
      if (rejected) await tx.targetInstance.update({ where: { id: e.row.targetInstanceId }, data: { status: "FAILED" } });
      else if (reviewOnly || evidenceOnly) await tx.targetInstance.update({ where: { id: e.row.targetInstanceId }, data: { status: "GENERATED" } });
      if (!rejected) await recordLocalPatchPublicationPolicy(tx, { gameId: game.id, sceneVersion: scene.sceneVersion, hideId: e.hide.id,
        variantId: e.row.id, attempts: e.row.attempts, identityAssetId: identity.id, identitySha256: sha256Bytes(sheet),
        assetId: e.asset.id, imageSha256: e.imageSha256, geometrySha256: e.geometrySha256, judgeJson });
    }
  }, { timeout: 30_000 });
  const blocked = dispositions.some(d => d.state === "unresolved");
  const retry = dispositions.some(d => d.state === "retry");
  const complete = boardComplete && committedEntries.length === entries.length;
  return { state: blocked ? "blocked" : retry ? "retry" : complete ? "done" : "pending",
    reason: blocked ? "Required quality evidence is unresolved" : retry ? (isLocalPatchAgeVersion(scene.sceneVersion)
      ? "Required visual quality defect requires a bounded replacement" : "Severe seam or face defect requires a bounded replacement") : complete ? null : "Other appearances await generation or review",
    replayed: bought.replayed, costCents: bought.evidence.amountMicroUsd / 10_000 };
}

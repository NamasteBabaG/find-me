import sharp from "sharp";
import type { Prisma, Asset, TargetVariantAsset } from "@prisma/client";
import type { Container } from "../container";
import { SpriteRefSchema } from "../../domain/game/config";
import { cropOf, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { isLocalPatchAdvisoryVersion, localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { CURRENT_JUDGE_PRICING_VERSION, judgeCharge } from "../../infra/generation/judge";
import { assertGenerationSpendAllowed, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { normalizeBoardWizardIdentity } from "./board-wizard-identity";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, readShippedBoardArt } from "./local-patch-hide";
import { ADVISORY_LOCAL_PATCH_JUDGE, isTheModelWeAsked, judgeLocalPatchBoard, localPatchBoardJudgePrompt, parseLocalPatchBoardVerdicts,
  type LocalPatchBoardJudgeRequest, type LocalPatchBoardJudgeResult } from "./local-patch-judge";
import { localPatchPublicationGeometryHash, recordLocalPatchPublicationPolicy } from "./local-patch-publication-policy";
import { LOCAL_PATCH_PHASE_MARGIN_MS, LOCAL_PATCH_MIN_PROVIDER_MS } from "./local-patch-render";
import { purchaseOnce } from "./paid-operation";
import { sha256Bytes } from "./fixed-sprite";
import { sceneBySlug } from "../scene-catalog.service";
import type { BudgetJson } from "./world-budget";

export const LOCAL_PATCH_BOARD_REVIEW_VERSION = "local-patch-board-five-luna-low/v1";
export const localPatchBoardReviewKey = (boardId: string) => `board:${boardId}:five-review:1`;
const hash = (value: unknown) => sha256Bytes(Buffer.from(JSON.stringify(value)));
function demand(value: unknown, message: string): asserts value { if (!value) throw new Error(`LOCAL_PATCH_BOARD_REVIEW: ${message}`); }
export type LocalPatchBoardReviewOutcome = { state: "done" | "pending" | "held"; reason: string | null; replayed: boolean; costCents: number };
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
  const sheet = await c.storage.get(identity.storagePath), normalized = await normalizeBoardWizardIdentity(sheet);
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
    const dimensions = await sharp(bytes, { limitInputPixels: 8_294_400 }).metadata();
    demand(dimensions.width === crop.width && dimensions.height === crop.height && (dimensions.pages ?? 1) === 1, "Patch raster differs from its shipping rectangle");
    const sprite = SpriteRefSchema.parse({ kind: "image", url: "https://example.invalid/retained.png", width: asset.width, height: asset.height,
      rect: JSON.parse(row.rectJson), hitRect: JSON.parse(row.hitRectJson), anchor: JSON.parse(row.headAnchorJson) });
    demand(sprite.kind === "image" && sprite.rect && sprite.rect.x === crop.left / meta.width! && sprite.rect.y === crop.top / meta.height!
      && sprite.rect.w === crop.width / meta.width! && sprite.rect.h === crop.height / meta.height!, "Shipping placement differs from the authored crop");
    entries.push({ hide, row, asset, bytes, crop, imageSha256, geometrySha256 });
  }
  // Matches composeLocalPatchGame/SceneViewport target order, not database order.
  const composed = await sharp(before).composite(entries.map(e => ({ input: e.bytes, left: e.crop.left, top: e.crop.top }))).png().toBuffer();
  const request: LocalPatchBoardJudgeRequest = { boardId: board.board,
    boardPng: await sharp(composed).resize(1536, 1024, { fit: "inside" }).png().toBuffer(),
    identityPng: await sharp(normalized.png).resize(256, 256, { fit: "inside" }).png().toBuffer(),
    hides: await Promise.all(entries.map(async e => ({ hideId: e.hide.id,
      beforePng: await sharp(before).extract(e.crop).png().toBuffer(), afterPng: await sharp(composed).extract(e.crop).png().toBuffer(),
      expectation: { ageYears: child.ageYears, support: `${e.hide.pose} on ${board.ground}` },
    }))),
  };
  const fingerprint = hash({ version: LOCAL_PATCH_BOARD_REVIEW_VERSION, sceneId: scene.id, contentVersion: scene.sceneVersion,
    settings: ADVISORY_LOCAL_PATCH_JUDGE, prompt: localPatchBoardJudgePrompt(request),
    identitySha256: sha256Bytes(sheet), originalSha256: sha256Bytes(before), composedSha256: sha256Bytes(composed),
    wireHashes: [request.boardPng, request.identityPng, ...request.hides.flatMap(h => [h.beforePng, h.afterPng])].map(sha256Bytes),
    hides: entries.map(e => ({ hide: e.hide.id, target: e.row.targetInstanceId, attempts: e.row.attempts, asset: e.asset.id,
      imageSha256: e.imageSha256, geometrySha256: e.geometrySha256 })),
  });
  const requestKey = localPatchBoardReviewKey(board.board);
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
        ...(timeoutMs === null ? {} : { timeoutMs: Math.min(timeoutMs, ADVISORY_LOCAL_PATCH_JUDGE.timeoutMs) }) });
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
  const readable = !keep.wireFault && isTheModelWeAsked(keep.model, ADVISORY_LOCAL_PATCH_JUDGE.model) && keep.finishReason === "stop";
  const verdicts = parseLocalPatchBoardVerdicts(readable ? keep.raw : null, entries.map(e => e.hide.id));
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, game.id); await deps.fence(tx);
    for (const e of entries) {
      const current = await tx.targetVariantAsset.findUniqueOrThrow({ where: { id: e.row.id } });
      demand(current.status === "GENERATED" && current.assetId === e.asset.id && current.attempts === e.row.attempts
        && localPatchPublicationGeometryHash(current) === e.geometrySha256, "Target changed while its board was reviewed");
      const prior = JSON.parse(current.judgeJson ?? "{}");
      const judgeJson = JSON.stringify({ ...prior, reviewState: "board-review-complete", verdict: verdicts[e.hide.id] ?? null,
        wireFault: keep.wireFault ?? (verdicts[e.hide.id] ? null : "schema"), judgedSha256: e.imageSha256,
        boardReview: { version: LOCAL_PATCH_BOARD_REVIEW_VERSION, fingerprint, requestKey, composedSha256: sha256Bytes(composed),
          model: keep.model, effort: "low", raw: keep.raw, costMicroUsd: bought.evidence.amountMicroUsd },
      });
      await tx.targetVariantAsset.update({ where: { id: e.row.id }, data: { judgeJson } });
      await recordLocalPatchPublicationPolicy(tx, { gameId: game.id, sceneVersion: scene.sceneVersion, hideId: e.hide.id,
        variantId: e.row.id, attempts: e.row.attempts, identityAssetId: identity.id, identitySha256: sha256Bytes(sheet),
        assetId: e.asset.id, imageSha256: e.imageSha256, geometrySha256: e.geometrySha256, judgeJson });
    }
  }, { timeout: 30_000 });
  return { state: "done", reason: null, replayed: bought.replayed, costCents: bought.evidence.amountMicroUsd / 10_000 };
}

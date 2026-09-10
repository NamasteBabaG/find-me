import { Prisma } from "@prisma/client";
import { z } from "zod";
import sharp from "sharp";
import type { Container } from "../container";
import { env, spendGuard } from "../../lib/env";
import { spendAllowedFor, underDailyCeiling } from "../../domain/spend-policy";
import { composeGame, composeScene, composeWorld } from "../../domain/game/compose";
import { GameConfigSchema } from "../../domain/game/config";
import { sceneBySlug } from "../scene-catalog.service";
import { worldBySlug } from "../world-catalog.service";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { PrismaBoardConditionedCheckpointStore, boardConditionedCheckpointKeys } from "../../infra/db/board-conditioned-checkpoints";
import { BudgetedOpenAiFixedSourceProvider, type FixedSourcePolicy } from "../../infra/generation/openai-fixed-source";
import { BudgetedBoardPoseObserver, BoardPoseObservationError, prepareBoardPoseObservation, type BoardPoseObserverPolicy } from "../../infra/generation/board-pose-observer";
import { boardConditionedCatalogSchema, readBoardConditionedCatalog, loadBoardConditionedCatalogBoard } from "./board-conditioned-catalog";
import { boardConditioningHash, prepareBoardConditionedSource } from "./board-conditioned-source";
import { generateBoardConditionedAppearances, type BoardConditionedCheckpointStore } from "./board-conditioned-generation";
import { prepareBoardConditionedPlayerBoard, bindBoardConditionedPlayerGame, type BoardConditionedPrivateAsset } from "./board-conditioned-player";
import { boardWizardBudget, BOARD_WIZARD_CAP_MICRO_USD } from "./board-wizard-budget";
import { auditWorldBudget, type BudgetJson } from "./world-budget";
import { sha256Bytes } from "./fixed-sprite";
import type { Actor } from "../audit.service";
import { boardWizardVisualKeys, judgeBoardWizardAppearance } from "./board-wizard-visual-judge";
import { boardWizardContextKey, prepareBoardWizardReviews } from "./board-wizard-review-input";
import { BOARD_WIZARD_IDENTITY_VERSION, normalizeBoardWizardIdentity } from "./board-wizard-identity";
import { needsBoardStandingRemeasurement } from "./board-wizard-remeasurement";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";

/** Distinct from the admin probe and legacy fixed import: never published automatically. */
export const BOARD_WIZARD_STYLE = "fixed-sprite-board-wizard-v1";
export const BOARD_WIZARD_SOURCE_POLICY: FixedSourcePolicy = { quality: "medium", reserveMicroUsd: 200_000, providerNamespace: "openai:find-me-existing", timeoutMs: 120_000,
  rateCard: { id: "existing-reviewed-image2-5-8-30-microusd-v1", textInput: 5, imageInput: 8, imageOutput: 30 } };
export const BOARD_WIZARD_OBSERVER_POLICY: BoardPoseObserverPolicy = { reserveMicroUsd: 400_000, providerNamespace: "openai:find-me-existing", timeoutMs: 90_000 };
export const boardWizardEnabled = () => env().APP_ENV === "qa" && process.env.QA_BOARD_CONDITIONED_WIZARD === "true";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const visualSchema = z.object({ slotId: z.string(), patchAssetId: z.string(), patchSha256: digest, contextKey: z.string(), contextSha256: digest,
  recipe: z.object({ pose: z.string(), support: z.string(), occlusion: z.string(), occlusionMode: z.enum(["open", "clipped", "layer"]), comparators: z.string() }).strict(),
  state: z.enum(["pending", "pass", "review-required"]), verdict: z.enum(["ok", "bad", "unknown"]).optional(), reason: z.string().optional(), receiptKey: z.string().optional(), fingerprint: digest.optional(),
}).strict();
const progressSchema = z.object({ boardId: z.string(), state: z.enum(["pending", "geometry-ok", "needs-repair"]), reason: z.string().nullable(),
  attempts: z.number().int().min(0).max(2),
  awaitingMeasurement: z.boolean().optional(),
  remeasurements: z.array(z.object({ sourceAttempt: z.union([z.literal(1), z.literal(2)]), state: z.enum(["pending", "done"]),
    kind: z.literal("transport-recovery").optional(), approvalId: z.string().min(1).max(240).optional(),
  }).strict().refine(r => Boolean(r.kind) === Boolean(r.approvalId), "Transport recovery requires its approval identifier")).max(2).optional(),
  contractSha256: digest.optional(), assetIds: z.array(z.string()), playerBindingSha256: digest.optional(), visual: z.array(visualSchema).max(3),
}).strict().superRefine((board, ctx) => {
  const retries = board.remeasurements ?? [];
  if (board.awaitingMeasurement && (board.attempts === 0 || board.state !== "pending" || retries.some(r => r.state === "pending"))) {
    ctx.addIssue({ code: "custom", message: "Retained source measurement must use its existing pending attempt" });
  }
  if (new Set(retries.map(r => r.sourceAttempt)).size !== retries.length
    || retries.some(r => r.sourceAttempt > board.attempts || r.state === "pending" && (r.sourceAttempt !== board.attempts || board.state !== "pending"))) {
    ctx.addIssue({ code: "custom", message: "One remeasurement per retained source attempt; pending recovery cannot advance the source" });
  }
});
const capsuleSchema = z.object({ version: z.literal("board-conditioned-wizard/v1"), gameId: z.string(), childProfileId: z.string(), ownerId: z.string(),
  identityAssetId: z.string(), identitySha256: digest, identitySourceSha256: digest, identityNormalization: z.literal(BOARD_WIZARD_IDENTITY_VERSION), avatarAssetId: z.string(), ageYears: z.number().int().min(2).max(10), childName: z.string(),
  catalog: boardConditionedCatalogSchema, catalogSha256: digest, capMicroUsd: z.literal(4_000_000), sourcePolicySha256: digest, observerPolicySha256: digest,
  boards: z.array(progressSchema).length(9), state: z.enum(["running", "held", "review-required"]), automaticRelease: z.literal(false),
}).strict().superRefine((record, ctx) => {
  if (new Set(record.boards.map(b => b.boardId)).size !== 9 || record.boards.some(b => !record.catalog.boards.some(c => c.boardId === b.boardId))) ctx.addIssue({ code: "custom", message: "Progress must cover the same nine frozen boards exactly" });
});
type Capsule = z.infer<typeof capsuleSchema>;
function demand(value: unknown, message: string): asserts value { if (!value) throw new Error(`BOARD_WIZARD: ${message}`); }
export function readBoardWizard(raw: string): Capsule {
  const envelope = JSON.parse(raw) as { boardWizard?: unknown };
  const record = capsuleSchema.parse(envelope.boardWizard);
  demand(boardConditioningHash(record.catalog) === record.catalogSha256, "Frozen catalog was changed");
  return record;
}
const scope = (gameId: string) => `${gameId}:board-wizard`;
const assetId = (gameId: string, key: string) => `ast_bcw_${boardConditioningHash([gameId, key])}`;
const assetPath = (id: string) => `private/board-wizard/${id}.png`;
function budgetOf(c: Container, attempt = 1) { return boardWizardBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(c.db)), attempt); }

async function spendCheck(c: Container, ownerId: string) {
  demand(boardWizardEnabled() && c.storage.id === "db" && env().GENERATION_ENABLED === "on", "QA generation is not explicitly enabled with durable storage");
  demand(env().GENERATION_PROVIDER === "openai" && env().GENERATION_MODEL === "gpt-image-2" && env().GENERATION_QUALITY === "medium", "The QA wizard requires GPT Image 2 MEDIUM, including identity generation");
  const user = await c.db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  demand(user && spendAllowedFor({ ...spendGuard(), realGeneration: true }, user.email), "Owner is not a permitted QA tester");
  if (env().GENERATION_DAILY_CENTS > 0) {
    const date = new Date(); date.setUTCHours(0, 0, 0, 0);
    const [assets, spots, ledgers] = await Promise.all([
      c.db.asset.aggregate({ where: { createdAt: { gte: date } }, _sum: { costCents: true } }),
      c.db.targetVariantAsset.aggregate({ where: { updatedAt: { gte: date } }, _sum: { costCents: true } }),
      c.db.worldBudgetLedger.findMany({ where: { updatedAt: { gte: date } } }),
    ]);
    const cents = (assets._sum.costCents ?? 0) + (spots._sum.costCents ?? 0) + ledgers.reduce((sum, l) => sum + auditWorldBudget(JSON.parse(l.snapshotJson)).committedMicroUsd / 10_000, 0);
    demand(underDailyCeiling(cents, env().GENERATION_DAILY_CENTS), "Daily ceiling reached");
  }
}

/** Free route/asset preflight before identity spend. Unsupported worlds never fall through to the old painter. */
export async function preflightBoardConditionedWizard(c: Container, gameId: string) {
  const { catalog } = await readBoardConditionedCatalog();
  const g = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { scenes: true } });
  demand(g.ownerId && !g.deletedAt, "Owned QA game required");
  await spendCheck(c, g.ownerId);
  demand(g.packageTier === "ONE_WORLD" && g.scenes.length === 9 && g.scenes.every(s => catalog.boards.some(b => b.boardId === s.sceneSlug && b.sceneVersion === s.sceneVersion)), "Unsupported world selection for this QA catalog");
  // Verify every static hash before the first model call, not midway through a paid world.
  const dummy = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#557799" } }).png().toBuffer();
  for (const board of catalog.boards) await loadBoardConditionedCatalogBoard(catalog, board.boardId,
    { profileId: "preflight", ageYears: 8, referenceRole: "illustrated-identity", illustratedIdentity: { png: dummy, sha256: sha256Bytes(dummy) } });
}

/** Reserve before the existing identity provider is invoked. A lost response must
 * be reconciled against its saved asset/audit, never bought a second time. */
export async function reserveBoardWizardIdentity(c: Container, gameId: string, fingerprintInput: unknown) {
  const result = await budgetOf(c).reserve(scope(gameId), { requestKey: "wizard:identity:1", scope: "identity", operationFingerprint: boardConditioningHash(fingerprintInput), reserveMicroUsd: 500_000 });
  demand(result.acquired, "Identity dispatch is already reserved or paid; recover its retained output instead of buying again");
}

/** Called only after the ordinary wizard has created this upload's illustrated identity.
 * No legacy painter may run after this atomic opt-in. Existing operator jobs stay untouched. */
export async function enrollBoardConditionedWizard(c: Container, gameId: string, claimedJobId: string, claimedAttempt?: number) {
  const { catalog, sha256 } = await readBoardConditionedCatalog();
  const g = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } } });
  const child = g.childProfile;
  demand(g.ownerId && child && child.ownerId === g.ownerId && !child.deletedAt && child.identityAssetId && child.avatarAssetId && child.ageYears && !g.deletedAt, "Live owned illustrated identity and avatar are required");
  await spendCheck(c, g.ownerId);
  demand(g.packageTier === "ONE_WORLD" && g.scenes.length === 9 && g.scenes.every(s => catalog.boards.some(b => b.boardId === s.sceneSlug && b.sceneVersion === s.sceneVersion)), "This QA catalog supports exactly the selected nine-board world");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId } });
  demand(identity.ownerId === g.ownerId && identity.visibility === "PRIVATE" && identity.type === "IDENTITY_SHEET" && identity.status === "READY" && !identity.deletedAt, "Identity asset is not private and owned");
  const image = await c.storage.get(identity.storagePath);
  // Match the pilot's face-only identity role, but with automatic per-child
  // portrait selection. Canonical sheet and exact charge remain unchanged.
  const normalized = await normalizeBoardWizardIdentity(image);
  await requireBoardWizardIdentityApproval(c, budgetOf(c), { gameId, identityAssetId: identity.id, sheetSha256: normalized.sourceSha256,
    catalogSha256: sha256, photoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears, crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null });
  const record = capsuleSchema.parse({ version: "board-conditioned-wizard/v1", gameId, childProfileId: child.id, ownerId: g.ownerId,
    identityAssetId: identity.id, identitySha256: normalized.sha256, identitySourceSha256: normalized.sourceSha256, identityNormalization: normalized.version, avatarAssetId: child.avatarAssetId, ageYears: child.ageYears, childName: child.displayName,
    catalog, catalogSha256: sha256, capMicroUsd: BOARD_WIZARD_CAP_MICRO_USD, sourcePolicySha256: boardConditioningHash(BOARD_WIZARD_SOURCE_POLICY), observerPolicySha256: boardConditioningHash(BOARD_WIZARD_OBSERVER_POLICY),
    boards: g.scenes.map(s => ({ boardId: s.sceneSlug, state: "pending", reason: null, assetIds: [], visual: [], attempts: 0 })), state: "running", automaticRelease: false });
  const charge = await c.db.auditLog.findFirst({ where: { action: "sheet:painted", entityType: "Asset", entityId: identity.id }, orderBy: { createdAt: "desc" } });
  const receipt = charge?.metaJson ? JSON.parse(charge.metaJson) as { costUnknown?: boolean; costCents?: number; requestId?: string; usage?: BudgetJson; model?: string } : null;
  demand(receipt && !receipt.costUnknown && typeof receipt.costCents === "number" && receipt.costCents > 0 && receipt.requestId && receipt.usage && receipt.model, "Identity cost needs its original known provider receipt; it is never treated as free");
  const budget = budgetOf(c), evidence = { providerNamespace: "openai:find-me-existing", providerRequestId: receipt.requestId, usageId: boardConditioningHash(receipt.usage), rawUsage: receipt.usage,
    model: receipt.model, amountMicroUsd: Math.ceil(receipt.costCents * 10_000), costBasis: "conservative-upper-estimate" as const };
  if (await budget.readRequest(scope(gameId), "wizard:identity:1")) await budget.settle(scope(gameId), "wizard:identity:1", evidence);
  else await budget.importSettled(scope(gameId), { scope: "identity", operationFingerprint: boardConditioningHash([identity.id, record.identitySha256]), evidence });
  await c.db.$transaction(async tx => {
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: claimedJobId } });
    const current = await tx.childProfile.findUniqueOrThrow({ where: { id: child.id } });
    demand(current.identityAssetId === identity.id && !current.deletedAt && current.ownerId === record.ownerId, "Child changed during enrollment");
    // Refunds/owner stops can leave the identity job's lease RUNNING. Check the
    // live game status atomically as well: a paid approval is not authority to
    // restart a game stopped between the review and this enrollment commit.
    const changed = await tx.game.updateMany({ where: { id: gameId, ownerId: record.ownerId, childProfileId: child.id, deletedAt: null,
      status: { in: ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED"] }, styleVersion: g.styleVersion, configJson: null }, data: { styleVersion: BOARD_WIZARD_STYLE, status: "TARGETS_GENERATING", lastError: null } });
    demand(changed.count === 1 && job.gameId === gameId && job.status === "RUNNING" && (claimedAttempt === undefined || job.attempts === claimedAttempt), "Lost wizard enrollment claim");
    const envelope = JSON.parse(job.stepsJson) as { avatar?: object };
    envelope.avatar = { ...envelope.avatar, status: "done", finishedAt: new Date().toISOString() };
    await tx.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: null, stepsJson: JSON.stringify({ ...envelope, boardWizard: record }) } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function persistPlayerAsset(tx: Prisma.TransactionClient, record: Capsule, a: BoardConditionedPrivateAsset) {
  const id = assetId(record.gameId, a.key), key = assetPath(id);
  const old = await tx.asset.findUnique({ where: { id } }), blob = await tx.fileBlob.findUnique({ where: { key } });
  if (old || blob) demand(old && blob && old.ownerId === record.ownerId && old.visibility === "PRIVATE" && old.storagePath === key && old.status === "READY" && old.providerRequestId === record.gameId && Buffer.from(blob.data).equals(a.png), "Private player asset changed at its immutable address");
  else {
    await tx.fileBlob.create({ data: { key, contentType: "image/png", data: new Uint8Array(a.png) } });
    await tx.asset.create({ data: { id, ownerId: record.ownerId, visibility: "PRIVATE", type: a.kind === "static-board" ? "BOARD_ART" : "TARGET_SPRITE", mimeType: "image/png", storagePath: key, bytes: a.png.length, width: a.width, height: a.height, provider: "board-conditioned-wizard", providerRequestId: record.gameId, costCents: 0 } });
  }
  return id;
}

/** One independently checkpointed board per tick. A rejected board does not starve the remaining eight. */
export async function runBoardConditionedWizardSlice(c: Container, gameId: string, options: { hardDeadlineAt?: number } = {}) {
  // A fresh tick owns one paid operation; do not start on an almost-expired request.
  if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < 240_000) return { pending: true };
  const g = await c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } });
  demand(g && !g.deletedAt && g.styleVersion === BOARD_WIZARD_STYLE && g.ownerId && g.childProfile, "Live QA wizard game required");
  const job = await c.db.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } }), record = readBoardWizard(job.stepsJson);
  // A refund or operator status stop is a dispatch barrier even if an older
  // capsule still says running. Never resurrect it through a direct tick.
  if (record.state !== "running" || g.status !== "TARGETS_GENERATING") return { pending: false };
  demand(g.ownerId === record.ownerId && g.childProfileId === record.childProfileId && g.childProfile.ageYears === record.ageYears && g.childProfile.displayName === record.childName && g.childProfile.identityAssetId === record.identityAssetId && !g.childProfile.deletedAt, "Uploaded child identity changed; do not use another child's cache");
  const claimed = await c.db.generationJob.updateMany({ where: { id: job.id, stepsJson: job.stepsJson, OR: [{ status: { not: "RUNNING" } }, { updatedAt: { lt: new Date(Date.now() - 6 * 60_000) } }] }, data: { status: "RUNNING", attempts: { increment: 1 }, currentStep: "board-wizard", lastError: null } });
  if (!claimed.count) return { pending: true };
  const write = async <T>(action: (tx: Prisma.TransactionClient) => Promise<T>) => c.db.$transaction(async tx => {
    const gameFence = await tx.game.updateMany({ where: { id: gameId, status: "TARGETS_GENERATING", deletedAt: null, styleVersion: BOARD_WIZARD_STYLE, ownerId: record.ownerId, childProfileId: record.childProfileId }, data: { styleVersion: BOARD_WIZARD_STYLE } });
    const jobFence = await tx.generationJob.updateMany({ where: { id: job.id, attempts: job.attempts + 1, status: "RUNNING", currentStep: "board-wizard", stepsJson: job.stepsJson }, data: { currentStep: "board-wizard" } });
    demand(gameFence.count === 1 && jobFence.count === 1, "Stale/deleted QA job cannot write child imagery");
    return action(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  // Review a board's exact composed pixels before purchasing another board.
  // A bad/uncertain visual result is recorded, not a global stop or a repaint.
  const nextVisualBoard = record.boards.find(b => b.state === "geometry-ok" && b.visual.some(v => v.state === "pending"));
  // Among sources, visit untouched boards before retries so one hard hide
  // cannot starve the world. Visual work runs in separate bounded ticks.
  const awaiting = (b: Capsule["boards"][number]) => Boolean(b.awaitingMeasurement || b.remeasurements?.some(r => r.state === "pending"));
  const next = !nextVisualBoard ? [...record.boards].filter(b => b.state === "pending")
    .sort((a, b) => Number(awaiting(b)) - Number(awaiting(a)) || a.attempts - b.attempts)[0] : undefined;
  let stagedAssets: BoardConditionedPrivateAsset[] = [];
  let stagedContexts: { key: string; png: Buffer }[] = [];
  let stagedScene: string | null = null;
  try {
    // These failures must be durably held under this exact job claim, rather
    // than returning a perpetual running/pending capsule before the try block.
    await spendCheck(c, g.ownerId);
    // Existing pre-gate capsules do not acquire approval merely by surviving a
    // deployment. Preserve their paid assets and hold before any further spend.
    await requireBoardWizardIdentityApproval(c, budgetOf(c), { gameId, identityAssetId: record.identityAssetId, sheetSha256: record.identitySourceSha256,
      catalogSha256: record.catalogSha256, photoAssetId: g.childProfile.originalPhotoAssetId, ageYears: record.ageYears,
      crop: g.childProfile.photoCropJson ? JSON.parse(g.childProfile.photoCropJson) : null });
    demand(record.sourcePolicySha256 === boardConditioningHash(BOARD_WIZARD_SOURCE_POLICY) && record.observerPolicySha256 === boardConditioningHash(BOARD_WIZARD_OBSERVER_POLICY), "Paid generation policy changed during the run");
    if (next || nextVisualBoard) {
      const identity = await c.db.asset.findUniqueOrThrow({ where: { id: record.identityAssetId } });
      demand(identity.ownerId === record.ownerId && identity.status === "READY" && !identity.deletedAt && identity.visibility === "PRIVATE", "Identity was removed or changed");
      const normalized = await normalizeBoardWizardIdentity(await c.storage.get(identity.storagePath)), identityPng = normalized.png;
      demand(normalized.sha256 === record.identitySha256 && normalized.sourceSha256 === record.identitySourceSha256, "Identity image bytes changed");
      if (nextVisualBoard) {
        // One final-composite Sol HIGH review per later tick. No repaint or
        // observer is re-bought; persisted exact player pixels are the evidence.
        const v = nextVisualBoard.visual.find(v => v.state === "pending")!;
        demand(nextVisualBoard.playerBindingSha256 && nextVisualBoard.assetIds.includes(v.patchAssetId), "Visual review is not bound to player assets");
        const patch = await c.db.asset.findUniqueOrThrow({ where: { id: v.patchAssetId } });
        const context = await c.db.fileBlob.findUniqueOrThrow({ where: { key: v.contextKey } });
        demand(patch.ownerId === record.ownerId && patch.visibility === "PRIVATE" && patch.status === "READY" && !patch.deletedAt && patch.providerRequestId === gameId, "Review target ownership changed");
        const patchPng = await c.storage.get(patch.storagePath);
        demand(sha256Bytes(patchPng) === v.patchSha256 && context.contentType === "image/png" && sha256Bytes(context.data) === v.contextSha256, "Final player review pixels changed");
        const budget = budgetOf(c, nextVisualBoard.attempts);
        const judged = await judgeBoardWizardAppearance({ db: c.db, budget, apiKey: env().OPENAI_API_KEY!, write,
          beforeDispatch: async () => { await spendCheck(c, record.ownerId); await write(async () => undefined); } },
        { worldId: scope(gameId), boardId: nextVisualBoard.boardId, slotId: v.slotId, attempt: nextVisualBoard.attempts, playerBindingSha256: nextVisualBoard.playerBindingSha256,
          input: { patchPng, boardCrop: Buffer.from(context.data), reference: identityPng, childName: record.childName, ageYears: record.ageYears, label: `${nextVisualBoard.boardId}/${v.slotId}`, recipe: v.recipe } });
        v.state = judged.judgement.verdict === "ok" ? "pass" : "review-required"; v.verdict = judged.judgement.verdict;
        v.reason = judged.judgement.reason; v.receiptKey = judged.receiptKey; v.fingerprint = judged.fingerprint;
        nextVisualBoard.reason = nextVisualBoard.visual.every(v => v.state === "pass") ? "All three final composites passed Sol HIGH; human QA still required" : "Final visual checks recorded; no automatic approval or style reroll";
        if ((await budget.audit(scope(gameId))).held) record.state = "held";
      } else if (next) {
      const input = await loadBoardConditionedCatalogBoard(record.catalog, next.boardId, { profileId: record.childProfileId, ageYears: record.ageYears, referenceRole: "illustrated-identity", illustratedIdentity: { png: identityPng, sha256: record.identitySha256 } });
      const remeasurement = next.remeasurements?.find(r => r.state === "pending");
      const attempt = remeasurement ? remeasurement.sourceAttempt : next.awaitingMeasurement ? next.attempts : next.attempts + 1;
      demand(attempt <= 2, "At most two source generations per board");
      const prepared = await prepareBoardConditionedSource(input, BOARD_WIZARD_SOURCE_POLICY), budget = budgetOf(c, attempt), worldId = scope(gameId);
      const checkpointBoard = (boardId: string) => attempt === 1 ? boardId : `${boardId}--attempt-2`;
      const store = new PrismaBoardConditionedCheckpointStore(c.db);
      const checkpoints: BoardConditionedCheckpointStore = { getSource: (w, b) => store.getSource(w, checkpointBoard(b)), getMeasurement: (w, b, a) => store.getMeasurement(w, checkpointBoard(b), a),
        putSource: (w, b, s) => write(tx => new PrismaBoardConditionedCheckpointStore(tx).putSource(w, checkpointBoard(b), s)),
        putMeasurement: (w, b, m, a) => write(tx => new PrismaBoardConditionedCheckpointStore(tx).putMeasurement(w, checkpointBoard(b), m, a)) };
      demand(env().OPENAI_API_KEY, "Existing OpenAI credential is missing");
      const provider = new BudgetedOpenAiFixedSourceProvider(env().OPENAI_API_KEY!, budget, BOARD_WIZARD_SOURCE_POLICY, fetch,
        receipt => write(tx => new PrismaBoardConditionedCheckpointStore(tx).putSourceFailure(worldId, checkpointBoard(next.boardId), receipt)));
      const observer = new BudgetedBoardPoseObserver(env().OPENAI_API_KEY!, budget, BOARD_WIZARD_OBSERVER_POLICY, fetch, { transportTimeoutMs: 180_000 });
      const dispatch = async () => { await spendCheck(c, record.ownerId); await write(async () => undefined); };
      const result = await generateBoardConditionedAppearances({ sourcePolicy: BOARD_WIZARD_SOURCE_POLICY, observerPolicy: BOARD_WIZARD_OBSERVER_POLICY, budget, checkpoints,
        sources: { generate: async request => { demand(!remeasurement, "Observer recovery must never purchase a replacement image"); await dispatch(); return provider.generate(request); } },
        measure: async request => { await dispatch(); const p = await prepareBoardPoseObservation(request, BOARD_WIZARD_OBSERVER_POLICY);
          let result;
          try { result = await observer.observe({ ...request, expectedFingerprint: p.fingerprint }); }
          catch (error) {
            // Keep only the bounded diagnostic projection; full provider text is
            // not checkpointed. The existing Game/Job fence also prevents a late
            // failure from restoring private data after stop/deletion.
            if (error instanceof BoardPoseObservationError && error.diagnostic) {
              demand(error.diagnostic.fingerprint === p.fingerprint, "Observer diagnostic fingerprint changed");
              await write(tx => new PrismaBoardConditionedCheckpointStore(tx).putObservationFailure(worldId, checkpointBoard(next.boardId), error.diagnostic!, remeasurement ? 2 : 1));
            }
            throw error; // same held billing state and retry prohibition
          }
          return result.kind === "already-recorded" ? null : { sheetSha256: result.receipt.sourceImageSha256, fingerprint: result.receipt.fingerprint, status: result.status, sources: result.sources, evidence: result.evidence, receipt: result.receipt, completenessDeferred: result.completenessDeferred }; },
      }, { worldId, input, expectedContractSha256: prepared.contractSha256, yieldAfterNewSource: true,
        ...(remeasurement ? { measurementAttempt: 2 as const,
          ...(remeasurement.kind === "transport-recovery" ? { transportRecoveryApprovalId: remeasurement.approvalId } : {}) } : {}) });
      next.contractSha256 = prepared.contractSha256;
      next.attempts = attempt;
      next.awaitingMeasurement = result.state === "source-ready";
      if (remeasurement) remeasurement.state = "done";
      if (result.state === "source-ready") {
        next.state = "pending";
        next.reason = "Paid source retained; measurement runs on a fresh tick without image regeneration";
      } else if (result.state === "review-required" && !result.previewIsDiagnostic) {
        const request = { worldId, input, expectedContractSha256: prepared.contractSha256, sourcePolicy: BOARD_WIZARD_SOURCE_POLICY, observerPolicy: BOARD_WIZARD_OBSERVER_POLICY, result };
        const player = await prepareBoardConditionedPlayerBoard(request);
        const def = sceneBySlug(next.boardId, record.catalog.boards.find(b => b.boardId === next.boardId)!.sceneVersion), locale = g.locale === "he" ? "he" : "en";
        const child = { name: record.childName, avatarUrl: `/api/assets/${record.avatarAssetId}` };
        // Temporary scaffolding is replaced by exact replay-qualified PNGs before it is ever persisted.
        const scene = composeScene(def, child, def.targets.map(t => ({ targetId: t.id, sprite: { kind: "composed" as const, faceUrl: child.avatarUrl, bodyTemplate: t.bodyTemplate } })), locale);
        const template = composeGame({ gameId, child, packageTier: "ONE_WORLD", styleVersion: BOARD_WIZARD_STYLE, locale, scenes: [scene] });
        const slots = record.catalog.boards.find(b => b.boardId === next.boardId)!.slots;
        const bound = await bindBoardConditionedPlayerGame({ boards: [request], template, mode: "private-review",
          targetSlots: def.targets.map((t, i) => ({ boardId: next.boardId, targetId: t.id, slotId: slots[i]!.slot.id, hintText: slots[i]!.hintText[locale] })),
          receipts: player.assetWrites.map(a => ({ key: a.key, sha256: a.sha256, rgbaSha256: a.rgbaSha256, width: a.width, height: a.height, url: `/api/assets/${assetId(gameId, a.key)}`, access: "authenticated-private" as const })) });
        stagedAssets = player.assetWrites;
        const reviews = await prepareBoardWizardReviews(worldId, attempt, input, player);
        stagedContexts = reviews.map(r => ({ key: r.contextKey, png: r.context }));
        next.visual = reviews.map(r => ({ slotId: r.slotId, patchAssetId: assetId(gameId, r.assetKey), patchSha256: r.patchSha256, contextKey: r.contextKey,
          contextSha256: r.contextSha256, recipe: r.recipe, state: "pending" }));
        stagedScene = JSON.stringify(bound.privateReviewConfig.scenes[0]);
        next.assetIds = stagedAssets.map(a => assetId(gameId, a.key));
        next.state = "geometry-ok"; next.playerBindingSha256 = player.playerBindingSha256; next.reason = "Visual review pending; no semantic approval has been claimed";
      } else {
        if (result.state === "reconciliation-required") throw new Error("Paid checkpoint requires reconciliation; never spend on a replacement");
        const observeAgain = !remeasurement && await needsBoardStandingRemeasurement(input, result);
        if (observeAgain) {
          // A separate queue tick avoids source120s + observer90s + recovery90s
          // exceeding the request deadline. Preserve this paid source attempt.
          next.remeasurements = [...(next.remeasurements ?? []), { sourceAttempt: attempt as 1 | 2, state: "pending" }];
        }
        next.state = remeasurement || !observeAgain && attempt === 2 ? "needs-repair" : "pending";
        next.reason = result.state === "review-required"
          ? result.appearances.filter(a => a.state !== "visual-review-required").map(a => `${a.slotId}: ${"reason" in a ? a.reason : Object.entries(a.composite?.checks ?? {}).filter(([, ok]) => !ok).map(([key]) => key).join(", ")}`).join("; ").slice(0, 2000)
          : "extractionFailure" in result && result.extractionFailure ? `Source extraction: ${result.extractionFailure.code}` : result.state;
        if (observeAgain) next.reason = `Same paid source awaits one landmark remeasurement; no image rerender. ${next.reason}`;
        if (remeasurement) next.reason = `Remeasurement exhausted; source retained without image rerender. ${next.reason}`;
      }
      }
    }
    const geometryFinished = !record.boards.some(b => b.state === "pending");
    const finished = record.state === "held" || geometryFinished && !record.boards.some(b => b.visual.some(v => v.state === "pending"));
    if (finished && record.state !== "held") record.state = "review-required";
    await write(async tx => {
      // Assets, exact deletion inventory, scene and progress become durable in
      // one transaction; a lost commit cannot leave untracked child sprites.
      for (const a of stagedAssets) await persistPlayerAsset(tx, record, a);
      for (const context of stagedContexts) {
        const old = await tx.fileBlob.findUnique({ where: { key: context.key } });
        if (old) demand(old.contentType === "image/png" && Buffer.from(old.data).equals(context.png), "Private final-composite context changed");
        else await tx.fileBlob.create({ data: { key: context.key, contentType: "image/png", data: new Uint8Array(context.png) } });
      }
      if (next && stagedScene) await tx.gameScene.update({ where: { gameId_sceneSlug: { gameId, sceneSlug: next.boardId } }, data: { generationStatus: "GENERATED", configJson: stagedScene } });
      let configJson: string | null = null;
      if (geometryFinished && record.boards.every(b => b.state === "geometry-ok")) {
        const scenes = await tx.gameScene.findMany({ where: { gameId }, orderBy: { orderIndex: "asc" } });
        demand(scenes.length === 9 && scenes.every(s => s.configJson), "Nine verified scene configs required");
        const locale = g.locale === "he" ? "he" : "en", child = { name: record.childName, avatarUrl: `/api/assets/${record.avatarAssetId}` };
        configJson = JSON.stringify(GameConfigSchema.parse(composeGame({ gameId, child, packageTier: "ONE_WORLD", styleVersion: BOARD_WIZARD_STYLE, locale,
          scenes: scenes.map(s => ({ ...JSON.parse(s.configJson!), worldSlug: record.catalog.worldSlug })), worlds: [composeWorld(worldBySlug(record.catalog.worldSlug), child, locale)] })));
      }
      await tx.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: null, stepsJson: JSON.stringify({ ...JSON.parse(job.stepsJson), boardWizard: record }) } });
      await tx.game.update({ where: { id: gameId }, data: { status: finished ? "MANUAL_REVIEW" : "TARGETS_GENERATING", ...(configJson ? { configJson } : {}), lastError: finished && !configJson ? "board-wizard: some boards require repair; no fallback sprites" : null } });
    });
    return { pending: !finished };
  } catch (error) {
    record.state = "held";
    await write(async tx => {
      await tx.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: null, lastError: String(error).slice(0, 500), stepsJson: JSON.stringify({ ...JSON.parse(job.stepsJson), boardWizard: record }) } });
      await tx.game.update({ where: { id: gameId }, data: { status: "MANUAL_REVIEW", lastError: "board-wizard: requires operator reconciliation; paid checkpoints retained" } });
    });
    return { pending: false };
  }
}

export { boardConditionedCheckpointKeys };

/** Exact private lifecycle inventory. The same Game -> Job fence blocks late provider writes. */
export async function deleteBoardConditionedWizard(c: Container, gameId: string, actor: Actor, userId?: string) {
  demand(env().APP_ENV === "qa" && c.storage.id === "db", "Wizard cleanup is restricted to durable QA storage");
  return c.db.$transaction(async tx => {
    const g = await tx.game.findUnique({ where: { id: gameId }, include: { childProfile: true } });
    if (!g || g.deletedAt || userId && userId !== g.ownerId) return false;
    demand(g.styleVersion === BOARD_WIZARD_STYLE, "Wrong cleanup engine");
    if (actor.type === "ADMIN") {
      const administrator = await tx.user.findUnique({ where: { id: actor.id }, select: { email: true } });
      demand(administrator && (c.adminEmails ?? []).some(email => email.toLowerCase() === administrator.email.toLowerCase()), "Administrator not authorized");
    } else demand(actor.type === "USER" && actor.id === g.ownerId && userId === g.ownerId, "Owner authorization required");
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: `job_${gameId}` } }), record = readBoardWizard(job.stepsJson);
    demand(record.gameId === gameId && record.ownerId === g.ownerId && record.childProfileId === g.childProfileId, "Cleanup ownership changed");
    const now = new Date();
    const fence = await tx.game.updateMany({ where: { id: gameId, updatedAt: g.updatedAt, deletedAt: null, styleVersion: BOARD_WIZARD_STYLE }, data: { status: "DELETED", deletedAt: now, configJson: null, title: null, giftJson: null } });
    demand(fence.count === 1, "Deletion lost game fence");
    await tx.generationJob.update({ where: { id: job.id }, data: { status: "DONE", stepsJson: "{}", currentStep: null, lastError: null } });
    const keys: string[] = [], ids = record.boards.flatMap(b => b.assetIds);
    for (const board of record.boards) for (const id of [board.boardId, `${board.boardId}--attempt-2`]) for (const measurementAttempt of [1, 2] as const) {
      keys.push(...Object.values(boardConditionedCheckpointKeys(scope(gameId), id, measurementAttempt)));
    }
    for (const board of record.catalog.boards) for (const slot of board.slots) for (const attempt of [1, 2]) {
      keys.push(boardWizardContextKey(scope(gameId), board.boardId, slot.slot.id, attempt), ...Object.values(boardWizardVisualKeys(scope(gameId), board.boardId, slot.slot.id, attempt)));
    }
    for (const id of ids) {
      const a = await tx.asset.findUniqueOrThrow({ where: { id } });
      demand(a.ownerId === record.ownerId && a.visibility === "PRIVATE" && a.storagePath === assetPath(id) && a.providerRequestId === gameId, "Private sprite ownership changed");
      keys.push(a.storagePath);
    }
    const child = g.childProfile;
    if (child && await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: gameId } } }) === 0) {
      for (const id of [child.identityAssetId, child.avatarAssetId, child.originalPhotoAssetId].filter((x): x is string => !!x)) {
        const a = await tx.asset.findUnique({ where: { id } });
        demand(a && a.ownerId === record.ownerId, "Child asset ownership changed");
        const aliases = await tx.asset.findMany({ where: { storagePath: a.storagePath }, select: { id: true } });
        const elsewhere = await tx.childProfile.count({ where: { NOT: { id: child.id }, OR: [{ identityAssetId: { in: aliases.map(a => a.id) } }, { avatarAssetId: { in: aliases.map(a => a.id) } }, { originalPhotoAssetId: { in: aliases.map(a => a.id) } }] } });
        if (aliases.length === 1 && !elsewhere) { ids.push(id); keys.push(a.storagePath); }
      }
      await tx.childProfile.update({ where: { id: child.id }, data: { identityAssetId: null, avatarAssetId: null, originalPhotoAssetId: null, photoCropJson: null, deletedAt: now } });
    }
    await tx.fileBlob.deleteMany({ where: { key: { in: keys } } });
    await tx.asset.updateMany({ where: { id: { in: ids } }, data: { status: "DELETED", deletedAt: now } });
    await tx.gameScene.updateMany({ where: { gameId }, data: { configJson: null } });
    await tx.shareLink.updateMany({ where: { gameId }, data: { active: false, revokedAt: now } });
    // The separate metadata-only charge ledger is deliberately retained.
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

import { Prisma } from "@prisma/client";
import { z } from "zod";
import sharp from "sharp";
import type { Container } from "../container";
import type { Actor } from "../audit.service";
import { env, spendGuard } from "../../lib/env";
import { spendAllowedFor, underDailyCeiling } from "../../domain/spend-policy";
import { newId } from "../../lib/ids";
import { BudgetedOpenAiFixedSourceProvider, type FixedSourcePolicy } from "../../infra/generation/openai-fixed-source";
import { BudgetedBoardPoseObserver, prepareBoardPoseObservation, type BoardPoseObserverPolicy } from "../../infra/generation/board-pose-observer";
import { PrismaWorldBudgetStore } from "../../infra/db/prisma-world-budget-store";
import { CasWorldBudgetRepository } from "../../infra/db/world-budget-repository";
import { PrismaBoardConditionedCheckpointStore } from "../../infra/db/board-conditioned-checkpoints";
import { WorldBudget, auditWorldBudget, WORLD_BUDGET_CAP_MICRO_USD } from "./world-budget";
import { prepareBoardConditionedSource, boardConditioningHash, type BoardConditioningInput } from "./board-conditioned-source";
import { generateBoardConditionedWorld, type BoardConditionedCheckpointStore } from "./board-conditioned-generation";
import { sha256Bytes } from "./fixed-sprite";

export const BOARD_CONDITIONED_QA_STYLE = "fixed-sprite-board-conditioned-v1";
export interface BoardConditionedQaBoard { sceneVersion: number; input: BoardConditioningInput; expectedContractSha256: string; referenceAssetId?: string }
export interface BoardConditionedQaEnrollmentInput { gameId: string; childProfileId: string; boards: BoardConditionedQaBoard[]; sourcePolicy: FixedSourcePolicy }
export class BoardConditionedQaJobError extends Error {
  constructor(readonly code: "permission" | "unsupported" | "identity" | "conflict" | "integrity" | "budget" | "spend_disabled", message: string) { super(message); this.name = "BoardConditionedQaJobError"; }
}
function demand(v: unknown, code: BoardConditionedQaJobError["code"], message: string): asserts v { if (!v) throw new BoardConditionedQaJobError(code, message); }
const id = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/), digest = z.string().regex(/^[a-f0-9]{64}$/);
const recordSchema = z.object({
  version: z.literal("board-conditioned-qa-enrollment/v1"), gameId: id, worldId: z.string(), childProfileId: id, ownerId: z.string().min(1),
  childAgeYears: z.number().int().min(2).max(10), childDisplayName: z.string().min(2).max(80), childIdentityAssetId: z.string().nullable(),
  sourcePolicySha256: digest, createdAt: z.string().datetime(), budgetCapMicroUsd: z.literal(5_000_000),
  boards: z.array(z.object({ boardId: id, sceneVersion: z.number().int().positive(), contractSha256: digest, contract: z.record(z.unknown()),
    referenceAssetId: z.string().min(1), referenceStoragePath: z.string().min(1), referenceSha256: digest, referenceLineageSha256: digest.nullable(),
  }).strict()).min(1).max(9),
}).strict();
type Record = z.infer<typeof recordSchema>;
const progressSchema = z.object({ version: z.literal("board-conditioned-qa-progress/v1"),
  boards: z.array(z.object({ boardId: id, state: z.string(), contractSha256: digest, reviewManifestSha256: digest.optional() }).strict()),
  state: z.enum(["enrolled", "in-progress", "review-required", "reconciliation-required", "held"]), lastErrorCode: z.string().nullable(),
}).strict();
type Progress = z.infer<typeof progressSchema>;
function capsule(raw: string) {
  let data: unknown; try { data = JSON.parse(raw); } catch { throw new BoardConditionedQaJobError("integrity", "Invalid private QA job capsule"); }
  const parsed = z.object({ boardConditionedQa: recordSchema, boardConditionedProgress: progressSchema }).strict().safeParse(data);
  demand(parsed.success, "integrity", "Invalid or mixed QA job capsule"); return parsed.data;
}
const same = (a: unknown, b: unknown) => boardConditioningHash(a) === boardConditioningHash(b);
type AuthDb = Pick<Prisma.TransactionClient, "user">;
type BlobDb = Pick<Prisma.TransactionClient, "fileBlob">;
const privateKey = (kind: string, scope: unknown) => `private/board-conditioned-qa/${kind}/${boardConditioningHash(scope)}`;
export function boardQaWorldArtifactPrefix(worldId: string) {
  demand(/^[A-Za-z0-9_:-]{1,240}$/.test(worldId), "integrity", "Invalid private world scope");
  return `private/board-conditioned-qa/world/${boardConditioningHash(worldId)}/`;
}
async function putImmutable(db: BlobDb, key: string, data: Buffer, contentType: string) {
  const existing = await db.fileBlob.findUnique({ where: { key } });
  if (existing) { demand(existing.contentType === contentType && Buffer.from(existing.data).equals(data), "integrity", "Private QA artifact changed at an immutable key"); return; }
  try { await db.fileBlob.create({ data: { key, data: new Uint8Array(data), contentType } }); }
  catch (error) {
    const winner = await db.fileBlob.findUnique({ where: { key } });
    if (!winner) throw error;
    demand(winner.contentType === contentType && Buffer.from(winner.data).equals(data), "integrity", "Conflicting private QA artifact");
  }
}
async function ownedIdentity(tx: Pick<Prisma.TransactionClient, "asset" | "fileBlob" | "childProfile">, childId: string, ownerId: string, assetId: string) {
  const asset = await tx.asset.findUnique({ where: { id: assetId } });
  demand(asset && asset.ownerId === ownerId && asset.status === "READY" && !asset.deletedAt && asset.type === "IDENTITY_SHEET" && asset.visibility === "PRIVATE" && asset.mimeType === "image/png", "identity", "Reference must be an owned private ready illustrated IDENTITY_SHEET");
  // Owner equality is not child identity. Also catch aliases at the same storage path.
  const aliases = await tx.asset.findMany({ where: { storagePath: asset.storagePath }, select: { id: true } });
  demand(await tx.childProfile.count({ where: { NOT: { id: childId }, OR: [
    { identityAssetId: { in: aliases.map(a => a.id) } }, { avatarAssetId: { in: aliases.map(a => a.id) } }, { originalPhotoAssetId: { in: aliases.map(a => a.id) } },
  ] } }) === 0, "identity", "Reference is associated with another child, including a sibling");
  const blob = await tx.fileBlob.findUnique({ where: { key: asset.storagePath } });
  demand(blob && blob.contentType === "image/png" && blob.data.byteLength === asset.bytes, "identity", "Illustrated reference bytes are missing or changed");
  return { asset, png: Buffer.from(blob.data), sha256: sha256Bytes(blob.data) };
}
const lineageSchema = z.object({ version: z.literal("board-conditioned-reference-lineage/v1"), childProfileId: id, ownerId: z.string(), assetId: z.string(), assetSha256: digest,
  parentIdentityAssetId: z.string(), parentIdentitySha256: digest, attestation: z.literal("same-child-illustrated-derivative"), approvedBy: z.string(),
}).strict();
export const boardQaReferenceLineageKey = (childId: string, assetId: string) => privateKey("reference-lineage", [childId, assetId]);
const lineageKey = boardQaReferenceLineageKey;
/** Explicit human lineage attestation, not an inference from ownership or a claim of biometric verification. */
export async function registerBoardConditionedQaReference(c: Container, input: {
  childProfileId: string; assetId: string; parentIdentityAssetId: string; expectedAssetSha256: string; expectedParentSha256: string;
  attestation: "same-child-illustrated-derivative";
}, actor: Actor) {
  await requireAdmin(c, c.db, actor);
  demand(input.attestation === "same-child-illustrated-derivative", "identity", "Explicit same-child derivative attestation required");
  return c.db.$transaction(async tx => {
    await requireAdmin(c, tx, actor);
    const child = await tx.childProfile.findUnique({ where: { id: input.childProfileId } });
    demand(child && !child.deletedAt && child.ownerId && child.identityAssetId === input.parentIdentityAssetId && input.assetId !== child.identityAssetId, "identity", "Derivative must descend from this child's current canonical identity");
    const parent = await ownedIdentity(tx, child.id, child.ownerId, input.parentIdentityAssetId), derivative = await ownedIdentity(tx, child.id, child.ownerId, input.assetId);
    demand(parent.sha256 === input.expectedParentSha256 && derivative.sha256 === input.expectedAssetSha256, "identity", "Lineage bytes changed before approval");
    const lineage = lineageSchema.parse({ version: "board-conditioned-reference-lineage/v1", childProfileId: child.id, ownerId: child.ownerId, assetId: derivative.asset.id, assetSha256: derivative.sha256,
      parentIdentityAssetId: parent.asset.id, parentIdentitySha256: parent.sha256, attestation: input.attestation, approvedBy: actor.type === "ADMIN" ? actor.id : "" });
    const bytes = Buffer.from(JSON.stringify(lineage)); await putImmutable(tx, lineageKey(child.id, derivative.asset.id), bytes, "application/json");
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: "ADMIN", actorId: lineage.approvedBy, action: "board_conditioned.reference_lineage", entityType: "ChildProfile", entityId: child.id, metaJson: JSON.stringify({ lineageSha256: sha256Bytes(bytes), automaticRelease: false }) } });
    return { lineageSha256: sha256Bytes(bytes), automaticRelease: false as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
async function requireAdmin(c: Container, db: AuthDb, actor: Actor) {
  demand(process.env.NODE_ENV === "test" || env().APP_ENV === "qa", "unsupported", "Board-conditioned operator jobs are QA-only");
  demand(c.storage.id === "db", "unsupported", "Operator jobs require durable DB storage");
  demand(actor.type === "ADMIN" && actor.id?.trim(), "permission", "An authenticated administrator is required");
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { email: true } });
  demand(user && (c.adminEmails ?? []).map(s => s.trim().toLowerCase()).includes(user.email.trim().toLowerCase()), "permission", "Administrator is not authorized");
}
async function preparedBoards(raw: readonly BoardConditionedQaBoard[], sourcePolicy: FixedSourcePolicy) {
  demand(raw.length >= 1 && raw.length <= 9 && new Set(raw.map(b => b.input.boardId)).size === raw.length, "integrity", "One QA world requires1–9 distinct boards");
  const result = [];
  for (const board of raw) {
    demand(Number.isInteger(board.sceneVersion) && board.sceneVersion > 0, "integrity", "Pinned scene version required");
    const prepared = await prepareBoardConditionedSource(board.input, sourcePolicy);
    demand(prepared.contractSha256 === board.expectedContractSha256, "integrity", "Frozen board/child/pose/lighting contract changed");
    result.push({ sceneVersion: board.sceneVersion, input: prepared.input, expectedContractSha256: prepared.contractSha256, referenceAssetId: board.referenceAssetId, contract: prepared.contract });
  }
  return result;
}
async function verifyChildReferences(tx: Pick<Prisma.TransactionClient, "childProfile" | "asset" | "fileBlob">, childProfileId: string, boards: Awaited<ReturnType<typeof preparedBoards>>) {
  const child = await tx.childProfile.findUnique({ where: { id: childProfileId } });
  demand(child && !child.deletedAt && child.ownerId && Number.isInteger(child.ageYears) && child.ageYears! >= 2 && child.ageYears! <= 10
    && child.displayName === child.displayName.trim() && child.displayName.length >= 2 && child.displayName.length <= 80, "identity", "Live owned child with canonical name and age2–10 required");
  const references = [];
  for (const board of boards) {
    demand(board.input.child.profileId === child.id && board.input.child.ageYears === child.ageYears, "identity", "Board input belongs to another child/age");
    const assetId = board.referenceAssetId ?? child.identityAssetId;
    demand(assetId, "identity", "A ready illustrated identity asset is required, not an uploaded photo");
    const { asset, png, sha256 } = await ownedIdentity(tx, child.id, child.ownerId, assetId);
    demand(sha256 === board.input.child.illustratedIdentity.sha256 && png.equals(board.input.child.illustratedIdentity.png), "identity", "Reference bytes differ from the owned frozen illustration");
    let referenceLineageSha256: string | null = null;
    if (asset.id !== child.identityAssetId) {
      demand(child.identityAssetId, "identity", "An explicit derivative still requires this child's canonical identity");
      const parent = await ownedIdentity(tx, child.id, child.ownerId, child.identityAssetId), row = await tx.fileBlob.findUnique({ where: { key: lineageKey(child.id, asset.id) } });
      demand(row && row.contentType === "application/json" && row.data.byteLength <= 4096, "identity", "Noncanonical reference needs explicit same-child derivative lineage");
      let parsed: unknown; try { parsed = JSON.parse(Buffer.from(row.data).toString()); } catch { throw new BoardConditionedQaJobError("identity", "Invalid reference lineage"); }
      const checked = lineageSchema.safeParse(parsed);
      demand(checked.success && checked.data.childProfileId === child.id && checked.data.ownerId === child.ownerId && checked.data.assetId === asset.id && checked.data.assetSha256 === sha256
        && checked.data.parentIdentityAssetId === child.identityAssetId && checked.data.parentIdentitySha256 === parent.sha256, "identity", "Reference lineage belongs to another child or changed illustration");
      referenceLineageSha256 = sha256Bytes(row.data);
    }
    references.push({ referenceAssetId: asset.id, referenceStoragePath: asset.storagePath, referenceSha256: board.input.child.illustratedIdentity.sha256, referenceLineageSha256 });
  }
  return { child, references };
}

type BoardResult = Awaited<ReturnType<typeof generateBoardConditionedWorld>>["results"][number];
const artifactSchema = z.object({ key: z.string(), sha256: digest, bytes: z.number().int().positive().max(32 * 1024 * 1024) }).strict();
const reviewManifestSchema = z.object({ version: z.literal("board-conditioned-private-review/v1"), gameId: id, worldId: z.string(), boardId: id, contractSha256: digest,
  state: z.enum(["review-required", "source-review-required", "reconciliation-required"]), automaticRelease: z.literal(false), result: z.unknown(), artifacts: z.array(artifactSchema).max(32),
}).strict();
const reviewKey = (record: Record, boardId: string, contractSha256: string) => `${boardQaWorldArtifactPrefix(record.worldId)}review/${boardConditioningHash([record.gameId, boardId, contractSha256])}`;
const pngKey = (worldId: string, sha256: string) => `${boardQaWorldArtifactPrefix(worldId)}png/${sha256}`;

/** Internal deletion inventory: enumerate exact scoped keys, never broad-delete a prefix. */
export async function boardConditionedQaPrivateInventory(db: BlobDb, rawStepsJson: string, gameId: string) {
  const data = capsule(rawStepsJson), record = data.boardConditionedQa;
  demand(record.gameId === gameId && record.worldId === `${gameId}:board-conditioned`, "integrity", "Deletion capsule belongs to another game");
  const prefix = boardQaWorldArtifactPrefix(record.worldId), rows = await db.fileBlob.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } });
  demand(rows.every(row => /^(png|review|recovery)\/[a-f0-9]{64}$/.test(row.key.slice(prefix.length))), "integrity", "Unrecognized private world artifact in deletion inventory");
  // Old pilot-only QA rows used opaque keys. Derive only this exact world's
  // manifests and their hash-bound PNG list; never scan another child's data.
  const keys = new Set(rows.map(row => row.key));
  for (const board of record.boards) {
    const legacyKey = privateKey("review", [gameId, record.worldId, board.boardId, board.contractSha256]), legacy = await db.fileBlob.findUnique({ where: { key: legacyKey } });
    if (!legacy) continue;
    demand(legacy.contentType === "application/json" && legacy.data.byteLength <= 1024 * 1024, "integrity", "Invalid legacy private review");
    const checked = reviewManifestSchema.safeParse(JSON.parse(Buffer.from(legacy.data).toString()));
    demand(checked.success && checked.data.gameId === gameId && checked.data.worldId === record.worldId && checked.data.boardId === board.boardId && checked.data.contractSha256 === board.contractSha256, "integrity", "Unbound legacy private review");
    keys.add(legacyKey);
    for (const png of checked.data.artifacts) {
      demand(png.key === privateKey("png", [record.worldId, png.sha256]), "integrity", "Legacy review points outside its world"); keys.add(png.key);
    }
  }
  return { record, progress: data.boardConditionedProgress, privateKeys: [...keys], prefix };
}

/** Lock order is Game -> GenerationJob, also used by the deletion service. */
async function withQaClaimWrite<T>(c: Container, record: Record, claim: { jobId: string; attempts: number; stepsJson: string; currentStep: string | null; updatedAt?: Date }, write: (tx: Prisma.TransactionClient) => Promise<T>) {
  return c.db.$transaction(async tx => {
    const gameFence = await tx.game.updateMany({ where: { id: record.gameId, deletedAt: null, styleVersion: BOARD_CONDITIONED_QA_STYLE, ownerId: record.ownerId, childProfileId: record.childProfileId,
      status: { in: ["QA_PENDING", "MANUAL_REVIEW"] }, configJson: null, paidAt: null, draftToken: null, readyAt: null, deliveredAt: null }, data: { styleVersion: BOARD_CONDITIONED_QA_STYLE } });
    demand(gameFence.count === 1, "conflict", "Deleted or changed QA game cannot receive late image writes");
    const jobFence = await tx.generationJob.updateMany({ where: { id: claim.jobId, gameId: record.gameId, status: "RUNNING", attempts: claim.attempts, currentStep: claim.currentStep, stepsJson: claim.stepsJson,
      ...(claim.updatedAt ? { updatedAt: claim.updatedAt } : {}) }, data: { currentStep: claim.currentStep } });
    demand(jobFence.count === 1, "conflict", "Stale QA worker cannot write images or complete a newer claim");
    return write(tx);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30_000 });
}

/** Save every lossless source/sprite/context/patch/board image before claiming completion. */
async function persistReview(db: BlobDb, record: Record, result: BoardResult) {
  demand(record.boards.some(b => b.boardId === result.boardId && b.contractSha256 === result.contractSha256) && result.automaticRelease === false, "integrity", "Result is outside frozen QA scope");
  const artifacts = new Map<string, z.infer<typeof artifactSchema>>();
  async function pack(value: unknown, depth = 0): Promise<unknown> {
    demand(depth <= 32, "integrity", "Review result nesting exceeds bound");
    if (Buffer.isBuffer(value)) {
      const bytes = Buffer.from(value), sha256 = sha256Bytes(bytes), key = pngKey(record.worldId, sha256);
      demand(bytes.length > 0 && bytes.length <= 32 * 1024 * 1024, "integrity", "Review image size exceeds bound");
      if (!artifacts.has(key)) {
        const image = sharp(bytes, { limitInputPixels: 32_000_000, failOn: "warning" }), meta = await image.metadata();
        demand(meta.format === "png" && (meta.pages ?? 1) === 1, "integrity", "Review artifact must be one lossless PNG");
        await image.raw().toBuffer();
        await putImmutable(db, key, bytes, "image/png"); artifacts.set(key, { key, sha256, bytes: bytes.length });
      }
      return { __boardQaPng: key };
    }
    if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return Promise.all(value.map(v => pack(v, depth + 1)));
    demand(value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype && !Object.hasOwn(value, "__boardQaPng"), "integrity", "Review result must be plain finite data");
    const out: { [key: string]: unknown } = {};
    for (const [key, v] of Object.entries(value)) if (v !== undefined) out[key] = await pack(v, depth + 1);
    return out;
  }
  const packed = await pack(result), manifest = reviewManifestSchema.parse({ version: "board-conditioned-private-review/v1", gameId: record.gameId, worldId: record.worldId,
    boardId: result.boardId, contractSha256: result.contractSha256, state: result.state, automaticRelease: false, result: packed, artifacts: [...artifacts.values()] });
  const bytes = Buffer.from(JSON.stringify(manifest)); demand(bytes.length <= 1024 * 1024, "integrity", "Review manifest exceeds bound");
  await putImmutable(db, reviewKey(record, result.boardId, result.contractSha256), bytes, "application/json");
  return sha256Bytes(bytes);
}
async function readPrivateReview(db: BlobDb, record: Record, boardId: string, contractSha256: string, expectedSha256?: string) {
  const row = await db.fileBlob.findUnique({ where: { key: reviewKey(record, boardId, contractSha256) } });
  if (!row) { demand(!expectedSha256, "integrity", "Completed review manifest is missing"); return null; }
  const bytes = Buffer.from(row.data), sha256 = sha256Bytes(bytes);
  demand(row.contentType === "application/json" && bytes.length <= 1024 * 1024 && (!expectedSha256 || sha256 === expectedSha256), "integrity", "Review manifest is changed or oversized");
  let raw: unknown; try { raw = JSON.parse(bytes.toString()); } catch { throw new BoardConditionedQaJobError("integrity", "Corrupt review manifest"); }
  const parsed = reviewManifestSchema.safeParse(raw);
  demand(parsed.success && parsed.data.gameId === record.gameId && parsed.data.worldId === record.worldId && parsed.data.boardId === boardId && parsed.data.contractSha256 === contractSha256, "integrity", "Review manifest belongs to another frozen result");
  const manifest = parsed.data, images = new Map<string, Buffer>();
  for (const item of manifest.artifacts) {
    demand(item.key === pngKey(record.worldId, item.sha256) && !images.has(item.key), "integrity", "Review artifact key is unbound or duplicated");
    const image = await db.fileBlob.findUnique({ where: { key: item.key } });
    demand(image && image.contentType === "image/png" && image.data.byteLength === item.bytes && sha256Bytes(image.data) === item.sha256, "integrity", "Review PNG is missing or changed");
    images.set(item.key, Buffer.from(image.data));
  }
  function unpack(value: unknown, depth = 0): unknown {
    demand(depth <= 32, "integrity", "Review result nesting exceeds bound");
    if (Array.isArray(value)) return value.map(v => unpack(v, depth + 1));
    if (value && typeof value === "object") {
      if (Object.hasOwn(value, "__boardQaPng")) {
        const key = (value as { __boardQaPng: unknown }).__boardQaPng;
        demand(Object.keys(value).length === 1 && typeof key === "string" && images.has(key), "integrity", "Unlisted review image reference");
        return Buffer.from(images.get(key)!);
      }
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpack(v, depth + 1)]));
    }
    return value;
  }
  const result = unpack(manifest.result) as BoardResult;
  demand(result && result.boardId === boardId && result.contractSha256 === contractSha256 && result.state === manifest.state && result.automaticRelease === false, "integrity", "Stored result disagrees with its review manifest");
  return { manifestSha256: sha256, manifest, result };
}
async function privateQaGame(c: Container, gameId: string, actor: Actor) {
  await requireAdmin(c, c.db, actor); demand(id.safeParse(gameId).success, "integrity", "Canonical game ID required");
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { jobs: true, scenes: { orderBy: { orderIndex: "asc" } } } });
  demand(game && !game.deletedAt && game.styleVersion === BOARD_CONDITIONED_QA_STYLE && game.jobs.length === 1 && game.jobs[0]!.id === `job_${gameId}`
    && ["QA_PENDING", "MANUAL_REVIEW"].includes(game.status) && !game.configJson && !game.paidAt && !game.draftToken && !game.readyAt && !game.deliveredAt, "conflict", "Only an enrolled private QA game may be inspected");
  const job = game.jobs[0]!, data = capsule(job.stepsJson), record = data.boardConditionedQa;
  demand(record.gameId === gameId && record.worldId === `${gameId}:board-conditioned` && record.ownerId === game.ownerId && record.childProfileId === game.childProfileId, "integrity", "Private QA binding changed");
  return { game, job, data, record };
}
const claimHash = (job: { id: string; status: string; currentStep: string | null; attempts: number; updatedAt: Date; stepsJson: string }) => boardConditioningHash({ id: job.id, status: job.status, currentStep: job.currentStep, attempts: job.attempts, updatedAt: job.updatedAt.toISOString(), stepsJson: job.stepsJson });

/** Authenticated readback works after a lost HTTP response; no game or asset URL is made public. */
export async function readBoardConditionedQaReview(c: Container, gameId: string, actor: Actor) {
  const { job, data, record } = await privateQaGame(c, gameId, actor), reviews = [], checkpoints = [];
  const store = new PrismaBoardConditionedCheckpointStore(c.db);
  for (const board of record.boards) {
    const done = data.boardConditionedProgress.boards.find(b => b.boardId === board.boardId);
    demand(!done || !["review-required", "source-review-required"].includes(done.state) || done.reviewManifestSha256, "integrity", "Completed board has no durable review manifest");
    const review = await readPrivateReview(c.db, record, board.boardId, board.contractSha256, done?.reviewManifestSha256);
    if (review) reviews.push(review);
    checkpoints.push({ boardId: board.boardId, source: await store.getSource(record.worldId, board.boardId), measurement: await store.getMeasurement(record.worldId, board.boardId) });
  }
  return { gameId, worldId: record.worldId, progress: data.boardConditionedProgress, reviews, checkpoints, claim: { status: job.status, updatedAt: job.updatedAt.toISOString(), sha256: claimHash(job) }, automaticRelease: false as const };
}

/** Admin QA bootstrap only. Does not adopt checkout games, buy an image, publish or send mail. */
export async function enrollBoardConditionedQaGame(c: Container, input: BoardConditionedQaEnrollmentInput, actor: Actor) {
  demand(id.safeParse(input.gameId).success && id.safeParse(input.childProfileId).success, "integrity", "Canonical IDs required");
  await requireAdmin(c, c.db, actor);
  const boards = await preparedBoards(input.boards, input.sourcePolicy), policyHash = boardConditioningHash(input.sourcePolicy), worldId = `${input.gameId}:board-conditioned`;
  const priorBudget = await new PrismaWorldBudgetStore(c.db).read(worldId);
  return c.db.$transaction(async tx => {
    await requireAdmin(c, tx, actor);
    const { child, references } = await verifyChildReferences(tx, input.childProfileId, boards);
    const profileFence = await tx.childProfile.updateMany({ where: { id: child.id, ownerId: child.ownerId, deletedAt: null, ageYears: child.ageYears, displayName: child.displayName, identityAssetId: child.identityAssetId }, data: { displayName: child.displayName } });
    demand(profileFence.count === 1, "conflict", "Child changed during enrollment");
    demand(await tx.game.count({ where: { childProfileId: child.id, deletedAt: null, NOT: { id: input.gameId } } }) === 0, "identity", "Use a dedicated QA child profile; existing games are not adopted");
    const game = await tx.game.findUnique({ where: { id: input.gameId }, include: { jobs: true, scenes: { orderBy: { orderIndex: "asc" } } } });
    const ledger = await tx.worldBudgetLedger.findUnique({ where: { worldId } });
    const expected = { version: "board-conditioned-qa-enrollment/v1" as const, gameId: input.gameId, worldId, childProfileId: child.id, ownerId: child.ownerId!, childAgeYears: child.ageYears!, childDisplayName: child.displayName,
      childIdentityAssetId: child.identityAssetId, sourcePolicySha256: policyHash, budgetCapMicroUsd: WORLD_BUDGET_CAP_MICRO_USD,
      boards: boards.map((b, i) => ({ boardId: b.input.boardId, sceneVersion: b.sceneVersion, contractSha256: b.expectedContractSha256, contract: b.contract, ...references[i]! })),
    };
    if (game) {
      demand(game.styleVersion === BOARD_CONDITIONED_QA_STYLE && !game.deletedAt && game.childProfileId === child.id && game.ownerId === child.ownerId && ["QA_PENDING", "MANUAL_REVIEW"].includes(game.status)
        && game.configJson === null && game.paidAt === null && game.draftToken === null && game.readyAt === null && game.deliveredAt === null, "conflict", "Cannot adopt or reset an existing game");
      demand(game.jobs.length === 1 && game.jobs[0]!.id === `job_${game.id}` && game.jobs[0]!.status !== "RUNNING", "conflict", "Job is active or incomplete");
      const old = capsule(game.jobs[0]!.stepsJson).boardConditionedQa;
      demand(same(old, recordSchema.parse({ ...expected, createdAt: old.createdAt })), "conflict", "Enrollment contract or child reference changed");
      demand(game.scenes.length === boards.length && game.scenes.every((s, i) => s.sceneSlug === boards[i]!.input.boardId && s.sceneVersion === boards[i]!.sceneVersion && s.orderIndex === i), "integrity", "Pinned scene route changed");
      demand(ledger && priorBudget && ledger.schemaVersion === 1 && ledger.revision === priorBudget.revision && same(JSON.parse(ledger.snapshotJson), priorBudget.snapshot), "budget", "Existing ledger is missing or changed; never reset it");
      demand(await tx.order.count({ where: { gameId: game.id } }) === 0 && await tx.shareLink.count({ where: { gameId: game.id } }) === 0, "conflict", "QA job must not contain commerce or player links");
      return { gameId: game.id, worldId, status: game.status, reused: true, automaticRelease: false as const };
    }
    demand(!ledger && !priorBudget, "budget", "An orphan budget cannot be adopted or erased");
    const record = recordSchema.parse({ ...expected, createdAt: new Date().toISOString() });
    const progress: Progress = { version: "board-conditioned-qa-progress/v1", boards: [], state: "enrolled", lastErrorCode: null };
    await tx.game.create({ data: { id: input.gameId, ownerId: child.ownerId, childProfileId: child.id, locale: "he", packageTier: "ONE_WORLD", sceneCount: boards.length, status: "QA_PENDING", styleVersion: BOARD_CONDITIONED_QA_STYLE } });
    for (const [i, b] of boards.entries()) await tx.gameScene.create({ data: { id: `gsc_bc_${boardConditioningHash([input.gameId, b.input.boardId])}`, gameId: input.gameId, sceneSlug: b.input.boardId, sceneVersion: b.sceneVersion, orderIndex: i, generationStatus: "PENDING" } });
    await tx.generationJob.create({ data: { id: `job_${input.gameId}`, gameId: input.gameId, status: "DONE", stepsJson: JSON.stringify({ boardConditionedQa: record, boardConditionedProgress: progress }) } });
    await tx.worldBudgetLedger.create({ data: { worldId, schemaVersion: 1, revision: 0, snapshotJson: JSON.stringify({ worldId, requests: [] }) } });
    await tx.auditLog.create({ data: { id: newId("aud"), actorType: "ADMIN", actorId: actor.type === "ADMIN" ? actor.id : null, action: "board_conditioned.enrolled", entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify({ contracts: boards.map(b => b.expectedContractSha256), automaticRelease: false, paidDispatch: false }) } });
    return { gameId: input.gameId, worldId, status: "QA_PENDING", reused: false, automaticRelease: false as const };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 30_000 });
}

async function spendCheck(c: Container, ownerId: string) {
  const e = env();
  demand(e.GENERATION_ENABLED !== "off", "spend_disabled", "Generation is disabled");
  const owner = await c.db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  // This adapter is real even if the legacy avatar container is configured as mock.
  demand(owner && spendAllowedFor({ ...spendGuard(), realGeneration: true }, owner.email), "permission", "Owner is not an authorized QA spender");
  if (e.GENERATION_DAILY_CENTS > 0) {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0);
    const [assets, spots, ledgers] = await Promise.all([
      c.db.asset.aggregate({ _sum: { costCents: true }, where: { createdAt: { gte: start } } }),
      c.db.targetVariantAsset.aggregate({ _sum: { costCents: true }, where: { updatedAt: { gte: start } } }),
      c.db.worldBudgetLedger.findMany({ where: { updatedAt: { gte: start } } }),
    ]);
    // Whole updated ledgers are a deliberately conservative daily upper count.
    // Exact request-level world accounting remains authoritative for its $5 cap.
    const fixedCents = ledgers.reduce((sum, l) => sum + auditWorldBudget(JSON.parse(l.snapshotJson)).committedMicroUsd / 10_000, 0);
    demand(underDailyCeiling((assets._sum.costCents ?? 0) + (spots._sum.costCents ?? 0) + fixedCents, e.GENERATION_DAILY_CENTS), "spend_disabled", "Daily spending ceiling reached");
  }
}
export interface BoardConditionedQaSliceOptions { sourcePolicy: FixedSourcePolicy; observerPolicy: BoardPoseObserverPolicy; maxBoards?: number; fetch?: typeof fetch }

/** Callable operator slice. Public create/checkout and legacy queue remain unchanged. */
export async function runBoardConditionedQaSlice(c: Container, gameId: string, frozenInputs: BoardConditionedQaBoard[], actor: Actor, options: BoardConditionedQaSliceOptions) {
  await requireAdmin(c, c.db, actor);
  demand(id.safeParse(gameId).success, "integrity", "Canonical game ID required");
  const boards = await preparedBoards(frozenInputs, options.sourcePolicy), game = await c.db.game.findUnique({ where: { id: gameId }, include: { jobs: true, scenes: { orderBy: { orderIndex: "asc" } } } });
  demand(game && game.styleVersion === BOARD_CONDITIONED_QA_STYLE && !game.deletedAt && game.ownerId && game.childProfileId && ["QA_PENDING", "MANUAL_REVIEW"].includes(game.status)
    && !game.configJson && !game.paidAt && !game.draftToken && !game.readyAt && !game.deliveredAt && game.jobs.length === 1 && game.jobs[0]!.id === `job_${gameId}`, "conflict", "Only the enrolled nonplayable QA game may run");
  const job = game.jobs[0]!, data = capsule(job.stepsJson), record: Record = data.boardConditionedQa;
  demand(record.gameId === gameId && record.worldId === `${gameId}:board-conditioned` && record.ownerId === game.ownerId && record.childProfileId === game.childProfileId
    && record.sourcePolicySha256 === boardConditioningHash(options.sourcePolicy), "integrity", "Game or source policy changed");
  const current = await verifyChildReferences(c.db, game.childProfileId, boards);
  demand(current.child.displayName === record.childDisplayName && current.child.ageYears === record.childAgeYears && current.child.identityAssetId === record.childIdentityAssetId
    && boards.length === record.boards.length && boards.every((b, i) => same(record.boards[i], { boardId: b.input.boardId, sceneVersion: b.sceneVersion, contractSha256: b.expectedContractSha256, contract: b.contract, ...current.references[i]! })), "identity", "Frozen child/board/reference intent changed");
  demand(game.scenes.length === boards.length && game.scenes.every((s, i) => s.sceneSlug === boards[i]!.input.boardId && s.sceneVersion === boards[i]!.sceneVersion && s.orderIndex === i), "integrity", "QA route changed");
  demand(await c.db.order.count({ where: { gameId } }) === 0 && await c.db.shareLink.count({ where: { gameId } }) === 0, "conflict", "QA generation does not adopt commerce or player links");
  const stored = await new PrismaWorldBudgetStore(c.db).read(record.worldId);
  demand(stored, "budget", "Enrolled budget is missing; never create a replacement");
  const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(c.db))), audit = await budget.audit(record.worldId);
  demand(!audit.held, "budget", "World budget is held for reconciliation");
  if (job.status === "RUNNING") return { state: "busy" as const, gameId, worldId: record.worldId, automaticRelease: false as const };
  demand(data.boardConditionedProgress.state !== "reconciliation-required", "budget", "Missing paid checkpoints need explicit reconciliation; not a fresh request");
  const maxBoards = options.maxBoards ?? 1;
  demand(Number.isInteger(maxBoards) && maxBoards >= 1 && maxBoards <= 9, "integrity", "maxBoards must be1–9");
  const done = new Set(data.boardConditionedProgress.boards.filter(b => ["review-required", "source-review-required"].includes(b.state)).map(b => b.boardId));
  for (const entry of data.boardConditionedProgress.boards.filter(b => done.has(b.boardId))) {
    demand(entry.reviewManifestSha256 && record.boards.some(b => b.boardId === entry.boardId && b.contractSha256 === entry.contractSha256), "integrity", "Completed result is missing its frozen review receipt");
    await readPrivateReview(c.db, record, entry.boardId, entry.contractSha256, entry.reviewManifestSha256);
  }
  const pending = boards.filter(b => !done.has(b.input.boardId));
  if (!pending.length) return { state: "review-required" as const, gameId, worldId: record.worldId, automaticRelease: false as const, audit };
  await spendCheck(c, game.ownerId);
  demand(env().OPENAI_API_KEY?.trim(), "unsupported", "Existing OpenAI credential is required; no mock fallback");
  // Constructors only validate credentials/policies; validate before claiming the
  // job so a bad observer policy cannot strand an unpaid job in RUNNING.
  const fetchOnce = options.fetch ?? fetch, source = new BudgetedOpenAiFixedSourceProvider(env().OPENAI_API_KEY!, budget, options.sourcePolicy, fetchOnce, async receipt => {
    const boardId = /^board:([a-z0-9-]+):source:1$/.exec(receipt.requestKey)?.[1];
    demand(boardId && record.boards.some(b => b.boardId === boardId), "integrity", "Source diagnostic board is outside this QA game");
    await withQaClaimWrite(c, record, writeClaim, tx => new PrismaBoardConditionedCheckpointStore(tx).putSourceFailure(record.worldId, boardId, receipt));
  });
  const observer = new BudgetedBoardPoseObserver(env().OPENAI_API_KEY!, budget, options.observerPolicy, fetchOnce);
  const claimed = await c.db.generationJob.updateMany({ where: { id: job.id, status: job.status, stepsJson: job.stepsJson }, data: { status: "RUNNING", currentStep: "board-conditioned", attempts: { increment: 1 }, lastError: null } });
  if (claimed.count !== 1) return { state: "busy" as const, gameId, worldId: record.worldId, automaticRelease: false as const };
  const baseCheckpoints = new PrismaBoardConditionedCheckpointStore(c.db), progress: Progress = structuredClone(data.boardConditionedProgress);
  const writeClaim = { jobId: job.id, attempts: job.attempts + 1, stepsJson: job.stepsJson, currentStep: "board-conditioned" };
  const checkpoints: BoardConditionedCheckpointStore = {
    getSource: (world, board) => baseCheckpoints.getSource(world, board), getMeasurement: (world, board) => baseCheckpoints.getMeasurement(world, board),
    putSource: (world, board, value) => withQaClaimWrite(c, record, writeClaim, tx => new PrismaBoardConditionedCheckpointStore(tx).putSource(world, board, value)),
    putMeasurement: (world, board, value) => withQaClaimWrite(c, record, writeClaim, tx => new PrismaBoardConditionedCheckpointStore(tx).putMeasurement(world, board, value)),
  };
  async function dispatchGuard() {
    await requireAdmin(c, c.db, actor); await spendCheck(c, record.ownerId);
    const fresh = await c.db.game.findUnique({ where: { id: gameId }, include: { jobs: true } });
    demand(fresh && !fresh.deletedAt && fresh.styleVersion === BOARD_CONDITIONED_QA_STYLE && fresh.ownerId === record.ownerId && fresh.childProfileId === record.childProfileId
      && ["QA_PENDING", "MANUAL_REVIEW"].includes(fresh.status) && !fresh.configJson && !fresh.paidAt && !fresh.draftToken && !fresh.readyAt && !fresh.deliveredAt
      && fresh.jobs.length === 1 && fresh.jobs[0]!.id === job.id && fresh.jobs[0]!.status === "RUNNING" && fresh.jobs[0]!.attempts === job.attempts + 1 && fresh.jobs[0]!.currentStep === "board-conditioned" && fresh.jobs[0]!.stepsJson === job.stepsJson,
    "conflict", "QA game changed before dispatch; no new request sent");
    const live = await verifyChildReferences(c.db, record.childProfileId, boards);
    demand(live.child.ownerId === record.ownerId && live.child.displayName === record.childDisplayName && live.child.ageYears === record.childAgeYears && live.child.identityAssetId === record.childIdentityAssetId
      && live.references.every((ref, i) => { const b = record.boards[i]!; return same(ref, { referenceAssetId: b.referenceAssetId, referenceStoragePath: b.referenceStoragePath, referenceSha256: b.referenceSha256, referenceLineageSha256: b.referenceLineageSha256 }); }),
      "identity", "Child changed before dispatch; paid checkpoints remain intact");
  }
  try {
    const result: Awaited<ReturnType<typeof generateBoardConditionedWorld>> = { version: "board-conditioned-world/v1", worldId: record.worldId, results: [], reviewedPlayableGame: false, automaticRelease: false };
    for (const pendingBoard of pending.slice(0, maxBoards)) {
    const one = await generateBoardConditionedWorld({ sourcePolicy: options.sourcePolicy, observerPolicy: options.observerPolicy, budget, checkpoints,
      sources: { generate: async request => { await dispatchGuard(); return source.generate(request); } },
      measure: async request => {
        await dispatchGuard();
        const prepared = await prepareBoardPoseObservation(request, options.observerPolicy);
        const observed = await observer.observe({ ...request, expectedFingerprint: prepared.fingerprint });
        if (observed.kind === "already-recorded") return null;
        return { sheetSha256: observed.receipt.sourceImageSha256, fingerprint: observed.receipt.fingerprint, status: observed.status, sources: observed.sources, evidence: observed.evidence, receipt: observed.receipt,
          completenessDeferred: observed.completenessDeferred };
      },
    }, { worldId: record.worldId, boards: [pendingBoard], maxBoards: 1 });
    for (const board of one.results) {
      const reviewManifestSha256 = await withQaClaimWrite(c, record, writeClaim, tx => persistReview(tx, record, board));
      result.results.push(board);
      progress.boards = progress.boards.filter(b => b.boardId !== board.boardId);
      progress.boards.push({ boardId: board.boardId, state: board.state, contractSha256: board.contractSha256, reviewManifestSha256 });
    }
    if (one.results.some(b => b.state === "reconciliation-required")) break;
    }
    progress.state = result.results.some(b => b.state === "reconciliation-required") ? "reconciliation-required" : boards.every(b => progress.boards.some(p => p.boardId === b.input.boardId && ["review-required", "source-review-required"].includes(p.state))) ? "review-required" : "in-progress";
    progress.lastErrorCode = null;
    await withQaClaimWrite(c, record, writeClaim, async tx => {
      const fresh = await tx.game.findUnique({ where: { id: gameId }, select: { deletedAt: true, styleVersion: true } });
      demand(fresh && !fresh.deletedAt && fresh.styleVersion === BOARD_CONDITIONED_QA_STYLE, "conflict", "QA game changed during generation; paid checkpoints remain intact");
      const written = await tx.generationJob.updateMany({ where: { id: job.id, status: "RUNNING", attempts: job.attempts + 1, currentStep: "board-conditioned", stepsJson: job.stepsJson }, data: { status: "DONE", currentStep: null, stepsJson: JSON.stringify({ boardConditionedQa: record, boardConditionedProgress: progress }) } });
      demand(written.count === 1, "conflict", "QA job capsule changed during generation");
      await tx.game.update({ where: { id: gameId }, data: { status: progress.state === "in-progress" ? "QA_PENDING" : "MANUAL_REVIEW" } });
    });
    return { ...result, state: progress.state, gameId, progress, audit: await budget.audit(record.worldId) };
  } catch (error) {
    // Preserve all source/measurement/ledger records; never buy a fresh retry.
    progress.state = "held";
    progress.lastErrorCode = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code.slice(0, 80) : "generation-stage-failed";
    const stopped = await c.db.generationJob.updateMany({ where: { id: job.id, status: "RUNNING", attempts: job.attempts + 1, currentStep: "board-conditioned", stepsJson: job.stepsJson }, data: { status: "DONE", currentStep: null, lastError: progress.lastErrorCode, stepsJson: JSON.stringify({ boardConditionedQa: record, boardConditionedProgress: progress }) } });
    if (stopped.count === 1) await c.db.game.updateMany({ where: { id: gameId, styleVersion: BOARD_CONDITIONED_QA_STYLE, deletedAt: null }, data: { status: "MANUAL_REVIEW" } });
    throw new BoardConditionedQaJobError("conflict", `QA stage stopped (${progress.lastErrorCode}); saved bills and checkpoints remain available for reconciliation`);
  }
}

export const BOARD_QA_STALE_CLAIM_MS = 15 * 60 * 1000;
/**
 * An operator must first stop the old worker and identify the exact stale claim.
 * Recovery has no HTTP transport or credentials. It never expires, settles,
 * clears, or redispatches a pending/unknown/paid-but-missing request.
 */
export async function recoverBoardConditionedQaClaim(c: Container, gameId: string, frozenInputs: BoardConditionedQaBoard[], actor: Actor, options: {
  sourcePolicy: FixedSourcePolicy; observerPolicy: BoardPoseObserverPolicy; expectedClaimSha256: string; workerStopped: true;
}) {
  const { job, game, data, record } = await privateQaGame(c, gameId, actor);
  demand(options.workerStopped === true && digest.safeParse(options.expectedClaimSha256).success && options.expectedClaimSha256 === claimHash(job), "conflict", "Recovery needs explicit stopped-worker confirmation and the exact current claim hash");
  demand(job.status === "RUNNING" && Date.now() - job.updatedAt.getTime() >= BOARD_QA_STALE_CLAIM_MS, "conflict", "Only a stale RUNNING claim can be explicitly recovered");
  const boards = await preparedBoards(frozenInputs, options.sourcePolicy), current = await verifyChildReferences(c.db, record.childProfileId, boards);
  demand(record.sourcePolicySha256 === boardConditioningHash(options.sourcePolicy) && current.child.ownerId === record.ownerId && current.child.displayName === record.childDisplayName
    && current.child.ageYears === record.childAgeYears && current.child.identityAssetId === record.childIdentityAssetId && boards.length === record.boards.length
    && boards.every((b, i) => same(record.boards[i], { boardId: b.input.boardId, sceneVersion: b.sceneVersion, contractSha256: b.expectedContractSha256, contract: b.contract, ...current.references[i]! })), "identity", "Recovery cannot change the frozen child, references or board contracts");
  demand(game.scenes.length === boards.length && game.scenes.every((s, i) => s.sceneSlug === boards[i]!.input.boardId && s.sceneVersion === boards[i]!.sceneVersion && s.orderIndex === i), "integrity", "Recovery scene route changed");
  demand(await c.db.order.count({ where: { gameId } }) === 0 && await c.db.shareLink.count({ where: { gameId } }) === 0, "conflict", "Recovery is private QA only");
  const ledger = await new PrismaWorldBudgetStore(c.db).read(record.worldId);
  demand(ledger, "budget", "Missing ledger cannot be recreated during recovery");
  const budget = new WorldBudget(new CasWorldBudgetRepository(new PrismaWorldBudgetStore(c.db))), audit = await budget.audit(record.worldId);
  const recoveryStep = `board-recovery:${newId("job")}`;
  const claimed = await withQaClaimWrite(c, record, { jobId: job.id, attempts: job.attempts, stepsJson: job.stepsJson, currentStep: job.currentStep, updatedAt: job.updatedAt }, tx =>
    tx.generationJob.updateMany({ where: { id: job.id, status: "RUNNING", currentStep: job.currentStep, attempts: job.attempts, stepsJson: job.stepsJson }, data: { currentStep: recoveryStep } }));
  demand(claimed.count === 1, "conflict", "Stale claim changed before recovery");
  const store = new PrismaBoardConditionedCheckpointStore(c.db), progress: Progress = { ...structuredClone(data.boardConditionedProgress), boards: [] };
  const recoveryClaim = { jobId: job.id, attempts: job.attempts, stepsJson: job.stepsJson, currentStep: recoveryStep };
  const dispositions: { boardId: string; disposition: string }[] = [];
  let reconciliation = false;
  try {
    for (const board of boards) {
      const boardId = board.input.boardId, old = data.boardConditionedProgress.boards.find(b => b.boardId === boardId);
      const saved = await readPrivateReview(c.db, record, boardId, board.expectedContractSha256, old?.reviewManifestSha256);
      if (saved) {
        progress.boards.push({ boardId, state: saved.result.state, contractSha256: board.expectedContractSha256, reviewManifestSha256: saved.manifestSha256 });
        reconciliation ||= saved.result.state === "reconciliation-required";
        dispositions.push({ boardId, disposition: "preserved-private-review" }); continue;
      }
      const source = await store.getSource(record.worldId, boardId), measurement = await store.getMeasurement(record.worldId, boardId);
      const sourceCharge = await budget.readRequest(record.worldId, `board:${boardId}:source:1`), observationCharge = await budget.readRequest(record.worldId, `board:${boardId}:measure:1`);
      if (!audit.held && source && measurement && sourceCharge && observationCharge) {
        // Both paid stages already exist. Core rechecks their exact fingerprints
        // and receipts; the adapters below cannot send even one network request.
        const noDispatch = async (): Promise<never> => { throw new BoardConditionedQaJobError("integrity", "Recovery cannot dispatch a source or observer"); };
        const replay = await generateBoardConditionedWorld({ sourcePolicy: options.sourcePolicy, observerPolicy: options.observerPolicy, budget, checkpoints: store,
          sources: { generate: noDispatch }, measure: noDispatch,
        }, { worldId: record.worldId, boards: [board], maxBoards: 1 });
        const result = replay.results[0]!;
        const reviewManifestSha256 = await withQaClaimWrite(c, record, recoveryClaim, tx => persistReview(tx, record, result));
        progress.boards.push({ boardId, state: result.state, contractSha256: board.expectedContractSha256, reviewManifestSha256 });
        reconciliation ||= result.state === "reconciliation-required";
        dispositions.push({ boardId, disposition: "reconstructed-free-from-paid-checkpoints" }); continue;
      }
      const ambiguous = audit.held || sourceCharge && !source || observationCharge && !measurement || source && !sourceCharge || measurement && !observationCharge;
      if (ambiguous) {
        reconciliation = true;
        progress.boards.push({ boardId, state: "reconciliation-required", contractSha256: board.expectedContractSha256 });
        dispositions.push({ boardId, disposition: "reserved-or-paid-output-needs-reconciliation" });
      } else dispositions.push({ boardId, disposition: source ? "saved-source-observer-never-dispatched" : "never-dispatched" });
    }
    progress.state = reconciliation ? "reconciliation-required" : boards.every(b => progress.boards.some(p => p.boardId === b.input.boardId && ["review-required", "source-review-required"].includes(p.state))) ? "review-required" : "in-progress";
    progress.lastErrorCode = reconciliation ? "manual-checkpoint-reconciliation" : null;
    const recoveryReceipt = { version: "board-conditioned-claim-recovery/v1", gameId, worldId: record.worldId, previousClaimSha256: options.expectedClaimSha256,
      ledgerSha256: boardConditioningHash(ledger.snapshot), ledgerRevision: ledger.revision, dispositions, resultingProgress: progress, automaticRelease: false, paidDispatch: false };
    const receiptBytes = Buffer.from(JSON.stringify(recoveryReceipt)), recoveryReceiptSha256 = sha256Bytes(receiptBytes);
    await withQaClaimWrite(c, record, recoveryClaim, async tx => {
      await putImmutable(tx, `${boardQaWorldArtifactPrefix(record.worldId)}recovery/${options.expectedClaimSha256}`, receiptBytes, "application/json");
      await requireAdmin(c, tx, actor);
      const freshGame = await tx.game.findUnique({ where: { id: gameId } }), freshChild = await tx.childProfile.findUnique({ where: { id: record.childProfileId } });
      demand(freshGame && !freshGame.deletedAt && freshGame.styleVersion === BOARD_CONDITIONED_QA_STYLE && freshGame.childProfileId === record.childProfileId && freshGame.ownerId === record.ownerId
        && !freshGame.configJson && !freshGame.paidAt && !freshGame.draftToken && !freshGame.readyAt && !freshGame.deliveredAt
        && freshChild && !freshChild.deletedAt && freshChild.ownerId === record.ownerId && freshChild.ageYears === record.childAgeYears && freshChild.displayName === record.childDisplayName && freshChild.identityAssetId === record.childIdentityAssetId,
      "identity", "Game or child changed during free recovery");
      const latestLedger = await tx.worldBudgetLedger.findUnique({ where: { worldId: record.worldId } });
      demand(latestLedger && latestLedger.revision === ledger.revision && same(JSON.parse(latestLedger.snapshotJson), ledger.snapshot), "budget", "Ledger changed while recovering; preserve claim for reconciliation");
      const written = await tx.generationJob.updateMany({ where: { id: job.id, status: "RUNNING", currentStep: recoveryStep, stepsJson: job.stepsJson }, data: { status: "DONE", currentStep: null,
        stepsJson: JSON.stringify({ boardConditionedQa: record, boardConditionedProgress: progress }), lastError: progress.lastErrorCode } });
      demand(written.count === 1, "conflict", "Recovery lost its exact claim");
      await tx.game.update({ where: { id: gameId }, data: { status: progress.state === "in-progress" ? "QA_PENDING" : "MANUAL_REVIEW" } });
      await tx.auditLog.create({ data: { id: newId("aud"), actorType: "ADMIN", actorId: actor.type === "ADMIN" ? actor.id : null, action: "board_conditioned.claim_recovered", entityType: "Game", entityId: gameId,
        metaJson: JSON.stringify({ recoveryReceiptSha256, paidDispatch: false, automaticRelease: false }) } });
    });
    return { gameId, state: progress.state, dispositions, recoveryReceiptSha256, automaticRelease: false as const, paidDispatch: false as const };
  } catch (error) {
    // A corrupt checkpoint or live ledger race stays explicitly fenced; do not
    // turn it into a fresh callable job or erase the prior claim/ledger evidence.
    await c.db.generationJob.updateMany({ where: { id: job.id, status: "RUNNING", currentStep: recoveryStep, stepsJson: job.stepsJson }, data: { lastError: "recovery-needs-reconciliation" } });
    throw error;
  }
}

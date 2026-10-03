import sharp from "sharp";
import type { Container } from "../container";
import { sceneBySlug } from "../scene-catalog.service";
import { WORLD_LOCAL_PATCH_HIDES, cropOf } from "../../domain/scene/local-patch-hides";
import { localPatchBoardForVersion } from "../../domain/scene/local-patch-catalog";
import { assertGenerationSpendAllowed, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { LOCAL_PATCH_STYLE } from "./local-patch-world";
import { withBoardWizardIdentityClaim, type BoardWizardIdentityClaim } from "./board-wizard-identity-lifecycle";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { sha256Bytes } from "./fixed-sprite";
import { readShippedBoardArt } from "./local-patch-hide";
import { worldsOwned } from "../world-catalog.service";
import { isRefreshedCollectionVersion } from "../../domain/scene/local-patch-versions";
import { readCollectionArt, MAX_IDENTITY_ART_CACHE_BYTES, type IdentityArtCache } from "./collection-art";

function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`LOCAL_PATCH_IDENTITY: ${message}`);
}
const preflightProofBrand = Symbol("verified-local-patch-static-art");
/** Opaque in-memory evidence, never accepted from HTTP or serialized receipts. */
export type LocalPatchIdentityPreflightProof = Readonly<{ [preflightProofBrand]: true; selectedSha256: string }>;
const successfulPreflights = new WeakSet<LocalPatchIdentityPreflightProof>();

/** A deadline defers an unchanged identity attempt; it is not a failed review. */
export class LocalPatchIdentityDeferred extends Error {
  constructor() { super("Local-patch identity is waiting for a fresh request window"); }
}

export function requireLocalPatchIdentityTime(deadlineAt: number | undefined, needMs: number): void {
  if (deadlineAt !== undefined && deadlineAt - Date.now() < needMs) throw new LocalPatchIdentityDeferred();
}

/** Verify the actual selected local-patch art before buying the first identity.
 * Collection releases may read only hash-pinned static art from the trusted CDN.
 * Other releases keep their exact packaged sources, with no style fallback. */
export async function preflightLocalPatchIdentity(c: Container, gameId: string, root = process.cwd(),
  identityArtCache?: IdentityArtCache, proof?: LocalPatchIdentityPreflightProof): Promise<LocalPatchIdentityPreflightProof> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { scenes: true } });
  demand(game.styleVersion === LOCAL_PATCH_STYLE && game.ownerId && !game.deletedAt, "A live owned local-patch game is required");
  await assertGenerationSpendAllowed(c, game.ownerId);
  demand(c.avatars.id === "openai" && c.avatars.createCharacter, "The board-matched character provider is required; no avatar fallback");
  demand(game.packageTier === "ONE_WORLD" && game.scenes.length === WORLD_LOCAL_PATCH_HIDES.length
    && new Set(game.scenes.map(scene => scene.sceneSlug)).size === WORLD_LOCAL_PATCH_HIDES.length, "Exactly the supported nine-board world is required");
  demand(new Set(game.scenes.map(scene => scene.sceneVersion)).size === 1, "Identity must use one pinned content version across every board");
  demand(worldsOwned(game.scenes.map(scene => scene.sceneSlug)).length === 1, "Identity requires one complete selected world");
  const selected = game.scenes.map(scene => {
    const board = localPatchBoardForVersion(scene.sceneSlug, scene.sceneVersion);
    demand(board && /^public\/(?:scenes|worlds)\//.test(board.art), `Missing packaged art for ${scene.sceneSlug}`);
    const definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
    demand(board.hides.every(hide => definition.targets.some(target => target.id === hide.targetId)), `Unbound local-patch targets for ${scene.sceneSlug}`);
    demand(`public${definition.art.base}` === board.art, `Scene and local-patch artwork disagree for ${scene.sceneSlug}`);
    return { scene, board, definition };
  });
  const selectedSha256 = sha256Bytes(Buffer.from(JSON.stringify({
    boards: selected.map(({ scene, board, definition }) => ({ slug: scene.sceneSlug, version: scene.sceneVersion,
      art: definition.art, targets: definition.targets, board })).sort((a, b) => a.slug.localeCompare(b.slug)),
  })));
  // Fresh ownership, provider, spend, version, complete-world and geometry
  // guards above always run. Only our exact same validated source recipe may
  // skip repeated static I/O after the invocation's public buffers are cleared.
  if (proof && successfulPreflights.has(proof) && proof.selectedSha256 === selectedSha256) return proof;
  let cachedBytes = identityArtCache ? [...identityArtCache.values()].reduce((n, bytes) => n + bytes.length, 0) : 0;
  demand(cachedBytes <= MAX_IDENTITY_ART_CACHE_BYTES, "Public identity art cache exceeds its byte bound");
  const validateBoard = async ({ scene, board, definition }: typeof selected[number]) => {
    const hash = definition.art.sha256 ?? "";
    let bytes: Buffer;
    if (isRefreshedCollectionVersion(scene.sceneVersion) && identityArtCache) {
      const retained = identityArtCache.get(hash);
      demand(!retained || sha256Bytes(retained) === hash, "Retained public identity art changed");
      const source = retained ?? await readCollectionArt(board.art, hash, root);
      demand(source && sha256Bytes(source) === hash, `Unverified public identity art for ${scene.sceneSlug}`);
      if (!retained) {
        demand(cachedBytes + source.length <= MAX_IDENTITY_ART_CACHE_BYTES, "Public identity art cache exceeds its byte bound");
        identityArtCache.set(hash, source); cachedBytes += source.length;
      }
      bytes = source;
    } else bytes = await readShippedBoardArt(board.art, hash, root);
    demand(bytes.length <= 32 * 1024 * 1024, "Board art exceeds the decode bound");
    const meta = await sharp(bytes, { limitInputPixels: 8_294_400 }).metadata();
    demand(meta.width === definition.art.width && meta.height === definition.art.height
      && (meta.pages ?? 1) === 1 && (meta.orientation ?? 1) === 1, `Wrong board raster for ${scene.sceneSlug}`);
    demand(board.hides.every(hide => { const crop = cropOf(hide); return crop.left + crop.width <= meta.width! && crop.top + crop.height <= meta.height!; }), "Hide crop leaves its board");
  };
  // At most three full-board decoders/readers are active. Nine 20-second CDN
  // requests finish in three batches, preserving the portrait's request window.
  // Historical packaged PNG paths keep their original sequential decode load.
  const batchSize = isRefreshedCollectionVersion(game.scenes[0]?.sceneVersion) ? 3 : 1;
  for (let index = 0; index < selected.length; index += batchSize) {
    const results = await Promise.allSettled(selected.slice(index, index + batchSize).map(validateBoard));
    for (const result of results) if (result.status === "rejected") throw result.reason;
  }
  const verified = Object.freeze({ [preflightProofBrand]: true as const, selectedSha256 });
  successfulPreflights.add(verified);
  return verified;
}

/** The approved identity hands off to local patches, never the old sheet engine. */
export async function finishLocalPatchIdentity(c: Container, claim: BoardWizardIdentityClaim, catalogSha256: string): Promise<void> {
  demand(claim.styleVersion === LOCAL_PATCH_STYLE && claim.identityAssetId && claim.avatarAssetId && claim.ageYears, "Complete local-patch identity claim required");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: claim.identityAssetId } });
  demand(identity.ownerId === claim.ownerId && identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE"
    && identity.status === "READY" && !identity.deletedAt, "Identity is not a live owned private sheet");
  const child = await c.db.childProfile.findUniqueOrThrow({ where: { id: claim.childId } });
  const scenes = await c.db.gameScene.findMany({ where: { gameId: claim.gameId }, select: { sceneVersion: true } });
  demand(scenes.length > 0 && new Set(scenes.map(scene => scene.sceneVersion)).size === 1, "Identity handoff requires one pinned content version");
  const budget = boardWizardBudgetOf(c);
  await requireBoardWizardIdentityApproval(c, budget, { gameId: claim.gameId, identityAssetId: identity.id,
    sheetSha256: sha256Bytes(await c.storage.get(identity.storagePath)), catalogSha256, photoAssetId: child.originalPhotoAssetId,
    ageYears: claim.ageYears, crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null, contentVersion: scenes[0]!.sceneVersion });
  demand(!(await budget.audit(boardWizardWorldId(claim.gameId))).held, "Identity spending must be reconciled before hiding");
  await withBoardWizardIdentityClaim(c, claim, async tx => {
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: claim.jobId } });
    const steps = JSON.parse(job.stepsJson || "{}");
    steps.avatar = { ...steps.avatar, status: "done", finishedAt: new Date().toISOString() };
    await tx.game.update({ where: { id: claim.gameId }, data: { status: "TARGETS_GENERATING", lastError: null } });
    await tx.generationJob.update({ where: { id: claim.jobId }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null, stepsJson: JSON.stringify(steps) } });
  });
}

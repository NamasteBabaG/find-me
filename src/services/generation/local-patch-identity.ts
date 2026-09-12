import sharp from "sharp";
import type { Container } from "../container";
import { sceneBySlug } from "../scene-catalog.service";
import { LOCAL_PATCH_BOARD, WORLD_LOCAL_PATCH_HIDES, cropOf } from "../../domain/scene/local-patch-hides";
import { assertGenerationSpendAllowed, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { LOCAL_PATCH_STYLE } from "./local-patch-world";
import { withBoardWizardIdentityClaim, type BoardWizardIdentityClaim } from "./board-wizard-identity-lifecycle";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { sha256Bytes } from "./fixed-sprite";
import { readShippedBoardArt } from "./local-patch-hide";

function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`LOCAL_PATCH_IDENTITY: ${message}`);
}

/** A deadline defers an unchanged identity attempt; it is not a failed review. */
export class LocalPatchIdentityDeferred extends Error {
  constructor() { super("Local-patch identity is waiting for a fresh request window"); }
}

export function requireLocalPatchIdentityTime(deadlineAt: number | undefined, needMs: number): void {
  if (deadlineAt !== undefined && deadlineAt - Date.now() < needMs) throw new LocalPatchIdentityDeferred();
}

/** Verify the actual selected local-patch art before buying the first identity.
 * Missing packaged files never become an HTTP request or a legacy-style fallback. */
export async function preflightLocalPatchIdentity(c: Container, gameId: string, root = process.cwd()): Promise<void> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { scenes: true } });
  demand(game.styleVersion === LOCAL_PATCH_STYLE && game.ownerId && !game.deletedAt, "A live owned local-patch game is required");
  await assertGenerationSpendAllowed(c, game.ownerId);
  demand(c.avatars.id === "openai" && c.avatars.createCharacter, "The board-matched character provider is required; no avatar fallback");
  demand(game.packageTier === "ONE_WORLD" && game.scenes.length === WORLD_LOCAL_PATCH_HIDES.length
    && new Set(game.scenes.map(scene => scene.sceneSlug)).size === WORLD_LOCAL_PATCH_HIDES.length, "Exactly the supported nine-board world is required");
  for (const scene of game.scenes) {
    const board = WORLD_LOCAL_PATCH_HIDES.find(item => item.board === scene.sceneSlug);
    demand(board && /^public\/(?:scenes|worlds)\//.test(board.art), `Missing packaged art for ${scene.sceneSlug}`);
    const definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
    demand(board.hides.every(hide => definition.targets.some(target => target.id === hide.targetId)), `Unbound local-patch targets for ${scene.sceneSlug}`);
    demand(`public${definition.art.base}` === board.art, `Scene and local-patch artwork disagree for ${scene.sceneSlug}`);
    const bytes = await readShippedBoardArt(board.art, definition.art.sha256 ?? "", root);
    demand(bytes.length <= 32 * 1024 * 1024, "Board art exceeds the decode bound");
    const meta = await sharp(bytes, { limitInputPixels: LOCAL_PATCH_BOARD.width * LOCAL_PATCH_BOARD.height }).metadata();
    demand(meta.width === LOCAL_PATCH_BOARD.width && meta.height === LOCAL_PATCH_BOARD.height
      && (meta.pages ?? 1) === 1 && (meta.orientation ?? 1) === 1, `Wrong board raster for ${scene.sceneSlug}`);
    demand(board.hides.every(hide => { const crop = cropOf(hide); return crop.left + crop.width <= meta.width! && crop.top + crop.height <= meta.height!; }), "Hide crop leaves its board");
  }
}

/** The approved identity hands off to local patches, never the old sheet engine. */
export async function finishLocalPatchIdentity(c: Container, claim: BoardWizardIdentityClaim, catalogSha256: string): Promise<void> {
  demand(claim.styleVersion === LOCAL_PATCH_STYLE && claim.identityAssetId && claim.avatarAssetId && claim.ageYears, "Complete local-patch identity claim required");
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: claim.identityAssetId } });
  demand(identity.ownerId === claim.ownerId && identity.type === "IDENTITY_SHEET" && identity.visibility === "PRIVATE"
    && identity.status === "READY" && !identity.deletedAt, "Identity is not a live owned private sheet");
  const child = await c.db.childProfile.findUniqueOrThrow({ where: { id: claim.childId } });
  const budget = boardWizardBudgetOf(c);
  await requireBoardWizardIdentityApproval(c, budget, { gameId: claim.gameId, identityAssetId: identity.id,
    sheetSha256: sha256Bytes(await c.storage.get(identity.storagePath)), catalogSha256, photoAssetId: child.originalPhotoAssetId,
    ageYears: claim.ageYears, crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null });
  demand(!(await budget.audit(boardWizardWorldId(claim.gameId))).held, "Identity spending must be reconciled before hiding");
  await withBoardWizardIdentityClaim(c, claim, async tx => {
    const job = await tx.generationJob.findUniqueOrThrow({ where: { id: claim.jobId } });
    const steps = JSON.parse(job.stepsJson || "{}");
    steps.avatar = { ...steps.avatar, status: "done", finishedAt: new Date().toISOString() };
    await tx.game.update({ where: { id: claim.gameId }, data: { status: "TARGETS_GENERATING", lastError: null } });
    await tx.generationJob.update({ where: { id: claim.jobId }, data: { status: "QUEUED", currentStep: "local-patch", lastError: null, stepsJson: JSON.stringify(steps) } });
  });
}

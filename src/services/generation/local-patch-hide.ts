import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Container } from "../container";
import { newId } from "../../lib/ids";
import { sha256Bytes } from "./fixed-sprite";
import { sceneBySlug } from "../scene-catalog.service";
import {
  LOCAL_PATCH_BOARD, assertPlaceable, cropOf,
  type LocalPatchBoard, type LocalPatchHide,
} from "../../domain/scene/local-patch-hides";
import { fenceLocalPatchImages, LocalPatchRetainedPurchaseStore } from "./local-patch-lifecycle";
import { normalizeBoardWizardIdentity } from "./board-wizard-identity";
import { requireBoardWizardIdentityApproval } from "./board-wizard-identity-gate";
import { readBoardConditionedCatalog } from "./board-conditioned-catalog";
import { assertGenerationSpendAllowed, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { localPatchGeometry, type LocalPatchGeometry } from "./local-patch-geometry";
import { renderLocalPatchHide, type LocalPatchRenderDeps } from "./local-patch-render";
import { LOCAL_PATCH_PROMPT_VERSION, LOCAL_PATCH_BOARD_DRAWN_PROMPT_VERSION, LOCAL_PATCH_FIVE_PROMPT_VERSION, LOCAL_PATCH_CANONICAL_PROMPT_VERSION, LOCAL_PATCH_AGE_PROMPT_VERSION, localPatchRepairChecks } from "./local-patch-prompt";
import { prepareLocalPatchIdentityReferences } from "./local-patch-identity-reference";
import { buildBoardPeopleStyle } from "./board-wizard-identity-style";
import type { PatchGeometry } from "./patch";
import { readPinnedLocalPatchArt } from "./local-patch-art";
import { env } from "../../lib/env";
import { LOCAL_PATCH_MAX_ATTEMPTS, LOCAL_PATCH_NORMAL_ATTEMPTS, nextLocalPatchAttempt } from "../../domain/scene/local-patch-attempts";
import { isLocalPatchAdvisoryVersion, isLocalPatchAgeVersion, isLocalPatchStrictVersion } from "../../domain/scene/local-patch-catalog";
import { localPatchPublicationGeometryHash } from "./local-patch-publication-policy";
export { LOCAL_PATCH_MAX_ATTEMPTS, nextLocalPatchAttempt } from "../../domain/scene/local-patch-attempts";

/**
 * One hide, through the product rather than through a script.
 *
 * Everything below this has been proved on its own: the purchase boundary, the
 * real ledger, the retained store on disk. What was still missing is the part
 * that makes a paid render worth anything - somebody has to decide it may be
 * bought, keep what came back where the game can find it, and write down where
 * the child ended up so a player can tap her. That is this.
 *
 * The order matters and is not decoration:
 *
 *   placements checked ──► identity approved ──► attempt reserved ──► bought
 *                                                                     │
 *                     row written ◄── geometry measured ◄── asset kept ┘
 *
 * Approval comes before the attempt is even counted, because an unapproved
 * identity must cost nothing, and the attempt is counted before the dispatch,
 * because a process killed mid-render must not wake up with a fresh allowance.
 *
 * THE ATTEMPT NUMBER IS PART OF THE REQUEST KEY, which makes counting it a
 * money question rather than bookkeeping. Counting "attempts started" and then
 * resuming at the next number would give a crashed attempt a NEW key - and a new
 * key is a new purchase of a render that was already paid for. So an attempt is
 * started (`attempts = N`, row still PENDING) and only concluded when there is
 * an answer about the picture; a restart finds N unconcluded and runs N again,
 * which is exactly the key `purchaseOnce` replays.
 *
 * Every hide is cut from the board's ORIGINAL art, never from a board with its
 * neighbours already painted in. Two reasons, and the second is the important
 * one: no two hides on a board reach into each other's painted area (that is
 * what `assertPlaceable` guarantees), so there is nothing to see; and a crop
 * that depended on which siblings happened to be finished would change its
 * fingerprint when one of them landed - stranding a render that was already
 * bought, in the name of accuracy nobody can see.
 */

/** The variant a local-patch hide occupies; B is a second world's problem. */
export const LOCAL_PATCH_VARIANT = "A";
export const LOCAL_PATCH_PROVIDER = "local-patch";

export type LocalPatchHideState =
  /** Bought, judged, kept and written down. */
  | "generated"
  /** Already done; nothing was bought. */
  | "already-generated"
  /** The judge said no, or the reply could not be trusted. Another attempt may run. */
  | "refused"
  /** Out of attempts. A person looks now. */
  | "gave-up"
  /** The purchase could not go ahead. Not a statement about the picture. */
  | "stopped"
  /**
   * A reservation is held for something that was never dispatched. Nothing was
   * charged, nothing will get better by waiting, and a person has to release it.
   */
  | "held";

export type LocalPatchHideOutcome = {
  readonly boardId: string;
  readonly hideId: string;
  readonly targetId: string;
  readonly state: LocalPatchHideState;
  readonly reason: string | null;
  readonly attempt: number;
  readonly attempts: number;
  readonly assetId: string | null;
  readonly geometry: PatchGeometry | null;
  readonly geometryBasis: LocalPatchGeometry["basis"] | null;
  readonly renderCents: number;
  readonly judgeCents: number;
  readonly costUnknown: boolean;
  readonly replayed: boolean;
};

export type LocalPatchHideDeps = Pick<LocalPatchRenderDeps, "render" | "judge" | "renderPolicySha256"> & {
  /**
   * The board's own art, by the path the placement declares. Injected because
   * FIVE of the nine boards are still authored out of an untracked `work/`
   * folder that a deployed build does not have - a fact this route has to be
   * able to state plainly rather than discover at runtime.
   */
  readonly readBoardArt?: (art: string, expectedSha256: string) => Promise<Buffer>;
  /** Required unless a judge is supplied; the service never reaches for a credential itself. */
  readonly apiKey?: string;
  /**
   * Proof, inside the transaction that writes the target, that the caller still
   * holds this work. Supplied by the queue slice; a worker whose lease was taken
   * over finishes its render and writes nothing. Throwing is how it says no.
   */
  readonly fence?: (tx: Prisma.TransactionClient) => Promise<void>;
};

function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(`LOCAL_PATCH_HIDE: ${message}`); }

/**
 * One picture, one address, and never bytes that nothing names.
 *
 * The address is keyed on the bytes the judge actually saw, so a re-run after a
 * lost write lands on the same row instead of leaving a second copy of the same
 * child behind - and a DIFFERENT render can never arrive at an address that
 * already holds one, which is the failure that would matter.
 *
 * The row and bytes commit together behind the deletion fence. A row left by
 * an older interrupted write is repaired here, but a deleted game can never
 * gain a row or have its bytes restored.
 */
async function keepHidePicture(c: Container, input: {
  readonly id: string; readonly gameId: string; readonly ownerId: string | null; readonly buffer: Buffer;
  readonly type: "TARGET_SPRITE" | "REJECTED_PATCH"; readonly visibility: "GAME" | "PRIVATE";
  readonly width: number; readonly height: number; readonly costCents: number;
}) {
  const key = `${input.visibility.toLowerCase()}/${input.id}.png`;
  demand(c.storage.id === "db", "local-patch imagery requires DB-backed private storage");
  return c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, input.gameId);
    const existing = await tx.asset.findUnique({ where: { id: input.id } });
    if (existing) {
      demand(existing.storagePath === key && existing.status === "READY" && !existing.deletedAt && existing.type === input.type
        && existing.ownerId === input.ownerId && existing.visibility === input.visibility
        && existing.provider === LOCAL_PATCH_PROVIDER && existing.providerRequestId === input.gameId,
      `${input.id} already exists and is not the picture this hide kept`);
    } else {
      await tx.asset.create({ data: {
        id: input.id, ownerId: input.ownerId, type: input.type, visibility: input.visibility,
        storagePath: key, mimeType: "image/png", width: input.width, height: input.height,
        bytes: input.buffer.byteLength, provider: LOCAL_PATCH_PROVIDER, providerRequestId: input.gameId,
        costCents: Math.round(input.costCents),
      } });
    }
    // Same transaction as the row and lifecycle fence: deletion cannot purge
    // between the row and the blob, then have a late put recreate the picture.
    await tx.fileBlob.upsert({ where: { key }, update: {}, create: {
      key, data: new Uint8Array(input.buffer), contentType: "image/png",
    } });
    return existing ?? await tx.asset.findUniqueOrThrow({ where: { id: input.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
}

/**
 * Shipped art only, and provably the picture the player is going to see.
 *
 * A local patch is a rectangle OF the board, drawn back over the board. If the
 * bytes it was cut from are not the bytes the scene ships, the patch is a piece
 * of a different picture and the join shows - and nothing downstream would
 * notice, because every check in this engine compares the render to the crop it
 * was given rather than to the board the player loads. The scene already
 * publishes the digest of its own art; this is what it is for.
 */
export async function readShippedBoardArt(art: string, expectedSha256: string, root = process.cwd()): Promise<Buffer> {
  demand(art.startsWith("public/") && !art.includes(".."), `${art} is not shipped art; this board cannot be painted from a deployed build`);
  const pinned = await readPinnedLocalPatchArt(art, expectedSha256, root);
  if (pinned) return pinned;
  const bytes = await readFile(path.resolve(root, art));
  demand(sha256Bytes(bytes) === expectedSha256, `${art} is not the art this scene ships; a patch cut from it would be a piece of a different picture`);
  return sharp(bytes, { limitInputPixels: 8_294_400 }).png().toBuffer();
}

const stopped = (base: Omit<LocalPatchHideOutcome, "state" | "reason">, reason: string): LocalPatchHideOutcome =>
  ({ ...base, state: "stopped", reason });

export async function runLocalPatchHide(c: Container, deps: LocalPatchHideDeps, input: {
  readonly gameId: string;
  readonly board: LocalPatchBoard;
  readonly hide: LocalPatchHide;
  /** When this worker's request ends. Each paid phase is refused rather than started late. */
  readonly deadlineAt?: number;
  /** Only the world scheduler can open this after its normal pass is complete. */
  readonly finalRepair?: boolean;
}): Promise<LocalPatchHideOutcome> {
  const { gameId, board, hide } = input;
  demand(c.storage.id === "db", "local-patch imagery requires DB-backed private storage");
  // Free, and before anything else: an authored placement that cannot be held
  // is a fault to find now, not after a render has been paid for.
  assertPlaceable(board);
  demand(board.hides.some(h => h.id === hide.id), `${hide.id} is not a hide of ${board.board}`);

  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, scenes: true } });
  const child = game.childProfile;
  demand(game.ownerId && !game.deletedAt, "an owned, live game is required");
  demand(child && !child.deletedAt && child.ownerId === game.ownerId && child.identityAssetId && child.ageYears, "a live owned child with an illustrated identity is required");

  // The kill switch, the QA tester list and the daily ceiling, asked once, in
  // the one place that answers them for this game.
  await assertGenerationSpendAllowed(c, game.ownerId);

  const scene = game.scenes.find(s => s.sceneSlug === board.board);
  demand(scene, `this game has no ${board.board} board`);
  const definition = sceneBySlug(scene.sceneSlug, scene.sceneVersion);
  const target = definition.targets.find(t => t.id === hide.targetId);
  demand(target, `${board.board} has no ${hide.targetId} mission for ${hide.id} to hide in`);

  // ── The identity, approved, before a single cent ──
  const identity = await c.db.asset.findUniqueOrThrow({ where: { id: child.identityAssetId! } });
  demand(identity.ownerId === game.ownerId && identity.visibility === "PRIVATE" && identity.type === "IDENTITY_SHEET"
    && identity.status === "READY" && !identity.deletedAt, "the identity sheet is not a live private asset of this owner");
  const sheet = await c.storage.get(identity.storagePath);
  const normalized = await normalizeBoardWizardIdentity(sheet);
  const { sha256: catalogSha256 } = await readBoardConditionedCatalog();
  const worldId = boardWizardWorldId(gameId);
  const budget = boardWizardBudgetOf(c);
  // The same gate, at full strength: hash-bound to this sheet, this photograph,
  // this age and this crop, with the review's own charge validated. Not a
  // boolean a caller passes in.
  const identityApproval = await requireBoardWizardIdentityApproval(c, budget, {
    gameId, identityAssetId: identity.id, sheetSha256: normalized.sourceSha256, catalogSha256,
    photoAssetId: child.originalPhotoAssetId, ageYears: child.ageYears!,
    crop: child.photoCropJson ? JSON.parse(child.photoCropJson) : null,
    contentVersion: scene.sceneVersion,
  });
  const boardDrawn = identityApproval.provenance.style.version === "board-matched-identity/v2";
  const promptVersion = isLocalPatchAgeVersion(scene.sceneVersion) ? LOCAL_PATCH_AGE_PROMPT_VERSION
    : isLocalPatchStrictVersion(scene.sceneVersion) ? LOCAL_PATCH_CANONICAL_PROMPT_VERSION
    : isLocalPatchAdvisoryVersion(scene.sceneVersion) ? LOCAL_PATCH_FIVE_PROMPT_VERSION
    : boardDrawn ? LOCAL_PATCH_BOARD_DRAWN_PROMPT_VERSION : LOCAL_PATCH_PROMPT_VERSION;

  // ── The rows that make this restartable ──
  const instance = await c.db.targetInstance.findUnique({ where: { gameSceneId_targetId: { gameSceneId: scene.id, targetId: target.id } } })
    ?? await c.db.targetInstance.create({ data: {
      id: newId("tgt"), gameSceneId: scene.id, targetId: target.id, targetType: target.targetType,
      spriteKind: "image", slotAId: target.slots[0].id, slotBId: target.slots[1].id,
    } });
  const row = await c.db.targetVariantAsset.findUnique({ where: { targetInstanceId_variant: { targetInstanceId: instance.id, variant: LOCAL_PATCH_VARIANT } } })
    ?? await c.db.targetVariantAsset.create({ data: {
      id: newId("tva"), targetInstanceId: instance.id, variant: LOCAL_PATCH_VARIANT, slotId: target.slots[0].id,
      provider: LOCAL_PATCH_PROVIDER, promptVersion,
    } });

  if (input.finalRepair) demand(env().APP_ENV === "qa" && game.styleVersion === "local-patch-world-v1",
    "the final repair pass is enabled only for the QA local-patch engine");
  const attemptLimit = input.finalRepair ? LOCAL_PATCH_MAX_ATTEMPTS : LOCAL_PATCH_NORMAL_ATTEMPTS;
  const { attempt, exhausted } = nextLocalPatchAttempt(row, attemptLimit);
  // judgeJson is intentionally kept while PENDING: clearing lastError must not
  // change the prompt/fingerprint when attempt 2/3 resumes after an interruption.
  // v8 corrects its own located defect on the very next attempt. The old paid
  // recipes still add repair instructions only on their final repair pass.
  const repairChecks = isLocalPatchStrictVersion(scene.sceneVersion)
    ? attempt > 1 ? localPatchRepairChecks(row.judgeJson, scene.sceneVersion) : undefined
    : input.finalRepair ? localPatchRepairChecks(row.judgeJson) : undefined;
  const base = {
    boardId: board.board, hideId: hide.id, targetId: hide.targetId, attempt, attempts: row.attempts,
    assetId: row.assetId, geometry: null, geometryBasis: null,
    renderCents: 0, judgeCents: 0, costUnknown: false, replayed: false,
  } satisfies Omit<LocalPatchHideOutcome, "state" | "reason">;

  if (row.status === "GENERATED" || row.status === "APPROVED") {
    return { ...base, attempt: row.attempts, state: "already-generated", reason: null };
  }
  if (exhausted) {
    return { ...base, attempt: row.attempts, state: "gave-up", reason: row.lastError ?? `gave up after ${row.attempts} attempts` };
  }

  // Old identities keep their exact paid inputs; new board-drawn identities also
  // carry explicit same-board faces, even if this particular crop has none.
  const boardPeoplePng = boardDrawn || isLocalPatchStrictVersion(scene.sceneVersion) ? (await buildBoardPeopleStyle(board.board)).png : undefined;

  demand(deps.judge || deps.apiKey?.trim(), "a credential is required to judge what was painted; an unjudged render is never accepted");
  // The placements and the scene are two authored files, and a patch is only a
  // piece of the world while they name the same picture.
  demand(`public${definition.art.base}` === board.art,
    `${board.board} places hides against ${board.art} while the scene ships ${definition.art.base}`);
  const artwork = await (deps.readBoardArt ?? readShippedBoardArt)(board.art, definition.art.sha256 ?? "");
  const metadata = await sharp(artwork, { limitInputPixels: 8_294_400 }).metadata();
  const art = { width: metadata.width ?? 0, height: metadata.height ?? 0 };
  demand(art.width === LOCAL_PATCH_BOARD.width && art.height === LOCAL_PATCH_BOARD.height,
    `${board.board} is ${art.width}x${art.height}; the placements were authored against ${LOCAL_PATCH_BOARD.width}x${LOCAL_PATCH_BOARD.height}`);
  demand(art.width === definition.art.width && art.height === definition.art.height,
    `${board.board} art does not match the size the scene declares; the geometry would be written in the wrong space`);

  // Started, and written down as started, BEFORE the dispatch. A process killed
  // between here and an answer resumes this same number rather than being handed
  // a fresh allowance - and resuming the number is what lets the retained render
  // answer instead of a second one being bought.
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    await deps.fence?.(tx);
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: {
      attempts: attempt, status: "PENDING", lastError: null,
      provider: LOCAL_PATCH_PROVIDER, promptVersion, slotId: target.slots[0].id,
    } });
  });
  const started = { ...base, attempts: attempt };

  const identityReferences = await prepareLocalPatchIdentityReferences(sheet, scene.sceneVersion);
  const attemptResult = await renderLocalPatchHide({
    ledger: budget, store: new LocalPatchRetainedPurchaseStore(c, gameId, budget),
    renderPolicySha256: deps.renderPolicySha256, render: deps.render, ...(deps.judge ? { judge: deps.judge } : {}),
  }, {
    worldId, board, hide, composedPng: artwork, contentVersion: scene.sceneVersion,
    ...identityReferences,
    ...(boardPeoplePng ? { boardPeoplePng } : {}),
    ageYears: child.ageYears, attempt, apiKey: deps.apiKey ?? "",
    ...(repairChecks === undefined ? {} : { repairChecks }),
    ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt }),
  });

  const money = {
    renderCents: attemptResult.renderCents, judgeCents: attemptResult.judgeCents,
    costUnknown: attemptResult.costUnknown, replayed: attemptResult.replayed,
  };

  if (attemptResult.refusedBecause === "stopped") {
    // Deliberately NOT concluded either way: nothing was learned about the
    // picture, and the next pass has to resume this attempt rather than buy a
    // new one. A held reservation keeps its attempt number for exactly that
    // reason - once a person has released it, the same attempt runs again.
    const reason = attemptResult.stoppedReason ?? "the purchase could not go ahead";
    if (attemptResult.needsOperator) return { ...started, ...money, state: "held", reason };
    return stopped({ ...started, ...money }, reason);
  }

  if (!attemptResult.accepted) {
    const reason = attemptResult.renderFault
      ? `the painter returned nothing usable (${attemptResult.renderFault})`
      : attemptResult.wireFault
        ? `the judge's reply could not be trusted (${attemptResult.wireFault})`
        : attemptResult.verdict?.reason ?? "the judge refused the picture";
    // Kept even though it was refused: it was paid for, and a spot that keeps
    // failing is unreadable without the pictures that failed.
    const crop = cropOf(hide);
    const rejected = attemptResult.shippingPng && attemptResult.judgedSha256
      ? await keepHidePicture(c, { id: pictureId(gameId, hide.id, attemptResult.judgedSha256), gameId, ownerId: game.ownerId,
        buffer: attemptResult.shippingPng, type: "REJECTED_PATCH", visibility: "PRIVATE",
        width: crop.width, height: crop.height, costCents: 0 })
      : null;
    const rejectedIds = [...readIds(row.rejectedAssetIdsJson), ...(rejected ? [rejected.id] : [])];
    await c.db.$transaction(async tx => {
      await fenceLocalPatchImages(tx, gameId);
      await deps.fence?.(tx);
      await tx.targetVariantAsset.update({ where: { id: row.id }, data: {
      status: "FAILED", lastError: reason.slice(0, 500),
      costCents: Math.round(row.costCents + attemptResult.renderCents + attemptResult.judgeCents),
      rejectedAssetIdsJson: rejectedIds.length ? JSON.stringify(rejectedIds) : null,
      judgeJson: JSON.stringify({ verdict: attemptResult.verdict, wireFault: attemptResult.wireFault, seam: attemptResult.seam, promptVersion: attemptResult.promptVersion,
        ...(isLocalPatchStrictVersion(scene.sceneVersion) ? { renderFault: attemptResult.renderFault, compositionPermission: attemptResult.compositionPermission,
          compositionVersion: attemptResult.compositionVersion, hide: hide.id, pose: hide.pose } : {}) }),
      } });
    });
    const exhaustedNow = attempt >= attemptLimit;
    return { ...started, ...money, state: exhaustedNow ? "gave-up" : "refused", reason };
  }

  demand(attemptResult.shippingPng && attemptResult.judgedSha256, "an accepted hide must carry the crop that was judged");
  const shipping = attemptResult.shippingPng;
  // Measured against the board this crop was cut from, so "what changed" means
  // what the painter added rather than what a neighbour did.
  const measured = await localPatchGeometry({ hide, boardPng: artwork, patchPng: shipping, board: art, contentVersion: scene.sceneVersion });

  const crop = cropOf(hide);
  const assetId = pictureId(gameId, hide.id, attemptResult.judgedSha256);
  const key = `game/${assetId}.png`;
  // Retain before the job's publication fence so a lost claim doesn't lose a
  // paid image. The separate lifecycle fence still forbids all writes after
  // deletion, and the atomic row+blob makes every retained image enumerable.
  await keepHidePicture(c, {
    id: assetId, gameId, ownerId: game.ownerId, buffer: shipping,
    type: "TARGET_SPRITE", visibility: "GAME",
    width: crop.width, height: crop.height, costCents: attemptResult.renderCents,
  });

  await c.db.$transaction(async tx => {
    // Still ours? Everything below this line puts a child into a playable game.
    await fenceLocalPatchImages(tx, gameId);
    await deps.fence?.(tx);
    const geometry = {
      rectJson: JSON.stringify(measured.geometry.rect),
      hitRectJson: JSON.stringify(measured.geometry.hitRect),
      headAnchorJson: JSON.stringify(measured.geometry.anchor),
    };
    const judgeJson = JSON.stringify({ verdict: attemptResult.verdict, seam: attemptResult.seam, judgedSha256: attemptResult.judgedSha256,
      ...(isLocalPatchStrictVersion(scene.sceneVersion) ? { compositionPermission: attemptResult.compositionPermission, compositionVersion: attemptResult.compositionVersion } : {}),
      ...(isLocalPatchAdvisoryVersion(scene.sceneVersion) ? { wireFault: attemptResult.wireFault, reviewState: "pending-board-review", geometrySha256: localPatchPublicationGeometryHash(geometry) } : {}),
      geometryBasis: measured.basis, measuredFraction: Number(measured.measuredFraction.toFixed(4)), hide: hide.id, pose: hide.pose });
    await tx.targetVariantAsset.update({ where: { id: row.id }, data: {
      assetId,
      ...geometry,
      status: "GENERATED", lastError: null,
      costCents: Math.round(row.costCents + attemptResult.renderCents + attemptResult.judgeCents),
      promptVersion: attemptResult.promptVersion, provider: LOCAL_PATCH_PROVIDER,
      judgeJson,
    } });
    await tx.targetInstance.update({ where: { id: instance.id }, data: {
      spriteKind: "image", spriteAssetId: assetId, status: "GENERATED",
      costCents: { increment: Math.round(attemptResult.renderCents + attemptResult.judgeCents) },
    } });
  });

  return { ...started, ...money, state: "generated", reason: null, assetId,
    geometry: measured.geometry, geometryBasis: measured.basis };
}

/** The address of one kept picture: this game, this hide, these exact bytes. */
function pictureId(gameId: string, hideId: string, judgedSha256: string): string {
  return `ast_lp_${createHash("sha256").update(JSON.stringify([gameId, hideId, judgedSha256])).digest("hex").slice(0, 24)}`;
}

function readIds(json: string | null): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

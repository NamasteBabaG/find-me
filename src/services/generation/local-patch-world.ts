import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { WORLD_LOCAL_PATCH_HIDES, type LocalPatchBoard, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { GenerationPaused, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { retainedPurchaseKeysFor } from "../../infra/db/prisma-retained-purchase-store";
import { buyLocalPatch, localPatchRenderPolicySha256 } from "../../infra/generation/openai-local-patch";
import { env } from "../../lib/env";
import {
  LOCAL_PATCH_MAX_ATTEMPTS, LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, nextLocalPatchAttempt, runLocalPatchHide,
  type LocalPatchHideDeps, type LocalPatchHideOutcome,
} from "./local-patch-hide";

/**
 * A world's twenty-seven hides, one slice at a time, under a lease.
 *
 * The hide itself is the unit of work and it already survives being interrupted.
 * What this adds is the part a queue needs: deciding WHICH hide is next, holding
 * the work while it runs so two workers cannot paint the same child twice, and
 * letting a dead worker's claim be taken over without anyone declaring it dead
 * by hand.
 *
 * There is no capsule. The state of a world is the rows themselves - a hide is
 * done when its variant row says so - which means there is nothing to keep in
 * step with the truth and nothing that can disagree with it.
 *
 * The lease is a takeover window, not a lock: a worker that stops answering for
 * `LOCAL_PATCH_LEASE_MS` can be replaced. That is safe here precisely because
 * the layer underneath refuses to buy the same request key twice - a taken-over
 * worker's half-finished hide is replayed, not repurchased - so the worst a
 * wrong takeover costs is a duplicated free read.
 */

/** Games this engine owns. Nothing else may route here, and it routes nowhere else. */
export const LOCAL_PATCH_STYLE = "local-patch-world-v1";
/** After this long without a heartbeat, another worker may take the work. */
export const LOCAL_PATCH_LEASE_MS = 6 * 60_000;
/** A slice that cannot finish one paid hide should not start one. */
export const LOCAL_PATCH_MIN_SLICE_MS = 240_000;
/** How many hides one tick paints unless told otherwise. */
export const LOCAL_PATCH_HIDES_PER_SLICE = 1;

export type LocalPatchSliceResult = {
  readonly gameId: string;
  /** There is still runnable work: another tick should come. */
  readonly pending: boolean;
  /** Nothing was claimed - somebody else holds it, or it is not this engine's. */
  readonly claimed: boolean;
  readonly paused: boolean;
  readonly outcomes: readonly LocalPatchHideOutcome[];
  /** Boards this build cannot paint, and why. Named rather than left to fail one by one. */
  readonly blocked: readonly { readonly boardId: string; readonly reason: string }[];
};

const boardsBySlug = new Map(WORLD_LOCAL_PATCH_HIDES.map(board => [board.board, board]));

/**
 * Can this build paint this board at all?
 *
 * Five of the nine boards are still authored against an untracked `work/`
 * folder that exists on one laptop. A deployed box does not have them, and
 * finding that out one board at a time - after an identity has been approved
 * and a tick has been claimed - is worse than saying so up front.
 */
export function localPatchBoardBlockedReason(board: LocalPatchBoard): string | null {
  return board.art.startsWith("public/") ? null
    : `${board.board} is authored from ${board.art}, which is not shipped art`;
}

export function localPatchBoardFor(sceneSlug: string): LocalPatchBoard | null {
  return boardsBySlug.get(sceneSlug) ?? null;
}

/** A hide nobody needs to touch again: painted, or out of attempts. */
function settledHide(row: { status: string; attempts: number } | undefined): boolean {
  if (!row) return false;
  if (row.status === "GENERATED" || row.status === "APPROVED") return true;
  return nextLocalPatchAttempt(row).exhausted;
}

export async function runLocalPatchWorldSlice(c: Container, deps: LocalPatchHideDeps, gameId: string, options: {
  readonly hardDeadlineAt?: number;
  readonly maxHides?: number;
} = {}): Promise<LocalPatchSliceResult> {
  const empty = { gameId, outcomes: [], blocked: [] as { boardId: string; reason: string }[] };
  // A fresh tick owns one paid operation; do not start on an almost-expired request.
  if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < LOCAL_PATCH_MIN_SLICE_MS) {
    return { ...empty, pending: true, claimed: false, paused: false };
  }

  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { scenes: { orderBy: { orderIndex: "asc" } } } });
  if (!game || game.deletedAt || game.styleVersion !== LOCAL_PATCH_STYLE) return { ...empty, pending: false, claimed: false, paused: false };
  // A refund or an operator stop is a dispatch barrier. Never resurrect a
  // stopped game by ticking it directly.
  if (game.status !== "TARGETS_GENERATING") return { ...empty, pending: false, claimed: false, paused: false };

  const job = await c.db.generationJob.findUnique({ where: { id: `job_${gameId}` } });
  if (!job) return { ...empty, pending: false, claimed: false, paused: false };

  // The claim, and the takeover in the same statement: either this job is not
  // running, or whoever had it has not said anything for a lease. `attempts`
  // moves with it, so every write below can prove it belongs to THIS claim.
  //
  // `attempts` is IN THE CONDITION, not only in the increment. Without it the
  // claim succeeded while the token was computed from the earlier read, so a
  // worker that claimed and released in between left this one holding a number
  // that matched nothing: every fence failed, its own release matched no row,
  // and the job sat occupied until the lease ran out. Losing the race is fine -
  // the next tick takes it - but believing you won it with the wrong number is
  // not.
  const claimed = await c.db.generationJob.updateMany({
    where: { id: job.id, attempts: job.attempts,
      OR: [{ status: { not: "RUNNING" } }, { updatedAt: { lt: new Date(Date.now() - LOCAL_PATCH_LEASE_MS) } }] },
    data: { status: "RUNNING", attempts: { increment: 1 }, currentStep: "local-patch", lastError: null },
  });
  if (!claimed.count) return { ...empty, pending: true, claimed: false, paused: false };
  const claim = job.attempts + 1;

  /**
   * Proof, inside the transaction that writes a target, that this worker still
   * holds the work and the game is still one that may receive child imagery.
   * A taken-over worker finishing a slow render writes nothing.
   */
  const fence = async (tx: Prisma.TransactionClient) => {
    const held = await tx.generationJob.updateMany({
      where: { id: job.id, attempts: claim, status: "RUNNING", currentStep: "local-patch" },
      data: { currentStep: "local-patch" },
    });
    const live = await tx.game.updateMany({
      where: { id: gameId, status: "TARGETS_GENERATING", deletedAt: null, styleVersion: LOCAL_PATCH_STYLE },
      data: { styleVersion: LOCAL_PATCH_STYLE },
    });
    if (held.count !== 1 || live.count !== 1) throw new Error("LOCAL_PATCH_WORLD: this claim is no longer ours; a stale worker may not write child imagery");
  };

  const blocked: { boardId: string; reason: string }[] = [];
  const work: { board: LocalPatchBoard; hide: LocalPatchHide; sceneId: string }[] = [];
  for (const scene of game.scenes) {
    const board = localPatchBoardFor(scene.sceneSlug);
    if (!board) { blocked.push({ boardId: scene.sceneSlug, reason: `${scene.sceneSlug} has no authored local-patch placements` }); continue; }
    const reason = localPatchBoardBlockedReason(board);
    if (reason) { blocked.push({ boardId: scene.sceneSlug, reason }); continue; }
    for (const hide of board.hides) work.push({ board, hide, sceneId: scene.id });
  }

  const rows = await c.db.targetVariantAsset.findMany({
    where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { select: { targetId: true, gameSceneId: true } } },
  });
  const stateOf = (sceneId: string, targetId: string) =>
    rows.find(r => r.targetInstance.gameSceneId === sceneId && r.targetInstance.targetId === targetId);

  const todo = work.filter(item => !settledHide(stateOf(item.sceneId, item.hide.targetId)));
  const outcomes: LocalPatchHideOutcome[] = [];
  const limit = Math.max(1, options.maxHides ?? LOCAL_PATCH_HIDES_PER_SLICE);
  let paused = false;

  try {
    for (const item of todo.slice(0, limit)) {
      if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < LOCAL_PATCH_MIN_SLICE_MS) break;
      const outcome = await runLocalPatchHide(c, { ...deps, fence }, { gameId, board: item.board, hide: item.hide });
      outcomes.push(outcome);
      // A world that cannot buy anything is not a world to keep buying in.
      if (outcome.state === "stopped") break;
    }
  } catch (error) {
    if (error instanceof GenerationPaused) paused = true;
    else {
      await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim }, data: { status: "FAILED", lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) } });
      throw error;
    }
  }

  // Per board, once its three hides have all come to rest. Written whether they
  // landed or not: a board with a hide nobody could paint is not GENERATED, and
  // saying it is has already let a board ship with the child missing from it.
  const after = await c.db.targetVariantAsset.findMany({
    where: { variant: LOCAL_PATCH_VARIANT, targetInstance: { gameScene: { gameId } } },
    include: { targetInstance: { select: { targetId: true, gameSceneId: true } } },
  });
  for (const scene of game.scenes) {
    const board = localPatchBoardFor(scene.sceneSlug);
    if (!board || localPatchBoardBlockedReason(board)) continue;
    const mine = board.hides.map(hide => after.find(r => r.targetInstance.gameSceneId === scene.id && r.targetInstance.targetId === hide.targetId));
    if (!mine.every(settledHide)) continue;
    const good = mine.every(row => row && (row.status === "GENERATED" || row.status === "APPROVED"));
    await c.db.gameScene.update({ where: { id: scene.id }, data: { generationStatus: good ? "GENERATED" : "NEEDS_REGENERATION" } });
  }

  const left = todo.filter(item => {
    const row = after.find(r => r.targetInstance.gameSceneId === item.sceneId && r.targetInstance.targetId === item.hide.targetId);
    return !settledHide(row);
  });
  // A world the ledger is holding cannot authorise anything, so another tick
  // would read the same rows, buy nothing and ask again forever. Held is a
  // state for a person, not a state to poll.
  const held = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).held;
  // The claim goes back either way: the next tick re-takes it. Holding it open
  // for the lease would make a paused world wait six minutes for nothing.
  await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim },
    data: { status: left.length ? "QUEUED" : "DONE", currentStep: left.length ? "local-patch" : null } });

  return { gameId, pending: left.length > 0 && !paused && !held, claimed: true, paused, outcomes, blocked };
}

/**
 * The painter this box can buy a local patch with, or nothing.
 *
 * `null` is not a placeholder any more - it is the answer whenever this box is
 * not configured to spend: no key, or a provider that is not the real one. The
 * queue REFUSES the style in that case rather than letting it fall through to
 * the legacy painter, which is the whole reason the route was wired before the
 * adapter existed.
 *
 * The kill switch, the tester list and the daily ceiling are NOT asked here.
 * They are asked per hide, inside the claim, by the same function that answers
 * them for the board engine - so a world that pauses mid-slice stops at the
 * next hide rather than at the next deploy.
 */
export function localPatchPainterDeps(_c: Container): LocalPatchHideDeps | null {
  const e = env();
  const apiKey = e.OPENAI_API_KEY?.trim();
  if (e.GENERATION_PROVIDER !== "openai" || !apiKey) return null;
  return {
    apiKey,
    renderPolicySha256: localPatchRenderPolicySha256(),
    render: async input => buyLocalPatch(apiKey, input),
  };
}

/**
 * Everything private this engine can have written for one game.
 *
 * A local patch is the child drawn into a picture, and a retained purchase is
 * the same child in the bytes that were paid for. Both have to be findable by
 * whoever deletes a game, and "findable" cannot mean "whoever wrote the deletion
 * routine remembered this engine exists" - that is how a resumed attempt once
 * left a child's image behind after a deletion that reported success.
 *
 * Derived from the authored placements rather than from what happens to be in
 * the database, so a row that was written and then lost is still enumerated.
 *
 * NOT yet called by the deletion route: no game carries `LOCAL_PATCH_STYLE`, and
 * wiring it there is the step before one ever does.
 */
export async function localPatchPrivateInventory(c: Container, gameId: string): Promise<{
  readonly assetIds: string[];
  readonly storagePaths: string[];
  readonly retainedPurchaseKeys: string[];
}> {
  const scenes = await c.db.gameScene.findMany({ where: { gameId }, select: { id: true, sceneSlug: true } });
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } } },
    select: { assetId: true, rejectedAssetIdsJson: true },
  });
  const assetIds = new Set<string>();
  for (const row of rows) {
    if (row.assetId) assetIds.add(row.assetId);
    if (!row.rejectedAssetIdsJson) continue;
    try {
      const parsed: unknown = JSON.parse(row.rejectedAssetIdsJson);
      if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === "string") assetIds.add(id);
    } catch { /* an unreadable pointer is reported by the asset scan, not swallowed here */ }
  }
  // Also everything this engine wrote FOR this game, whatever any row says.
  // A picture kept by a worker that then lost its claim is never named by a
  // row - the write that would have named it is the one the fence refused -
  // and a child nobody can find is exactly what deletion must not leave.
  const written = await c.db.asset.findMany({
    where: { provider: LOCAL_PATCH_PROVIDER, providerRequestId: gameId },
    select: { id: true, storagePath: true },
  });
  for (const asset of written) assetIds.add(asset.id);
  const named = assetIds.size
    ? await c.db.asset.findMany({ where: { id: { in: [...assetIds] } }, select: { id: true, storagePath: true } })
    : [];
  const assets = [...new Map([...written, ...named].map(a => [a.id, a])).values()];

  const worldId = boardWizardWorldId(gameId);
  const requestKeys: string[] = [];
  for (const scene of scenes) {
    const board = localPatchBoardFor(scene.sceneSlug);
    if (!board) continue;
    for (const hide of board.hides) {
      for (let attempt = 1; attempt <= LOCAL_PATCH_MAX_ATTEMPTS; attempt++) {
        requestKeys.push(`${hide.id}:${hide.pose}:render:${attempt}`, `${hide.id}:${hide.pose}:judge:${attempt}`);
      }
    }
  }
  return {
    assetIds: [...assetIds],
    storagePaths: assets.map(a => a.storagePath),
    retainedPurchaseKeys: retainedPurchaseKeysFor(worldId, requestKeys),
  };
}

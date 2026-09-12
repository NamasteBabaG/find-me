import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { WORLD_LOCAL_PATCH_HIDES, type LocalPatchBoard, type LocalPatchHide } from "../../domain/scene/local-patch-hides";
import { GenerationPaused, boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { retainedPurchaseKeysFor } from "../../infra/db/prisma-retained-purchase-store";
import { buyLocalPatch, localPatchRenderPolicySha256 } from "../../infra/generation/openai-local-patch";
import { env } from "../../lib/env";
import { finishLocalPatchGame } from "./local-patch-player";
import { deliverGameMail } from "../publish.service";
import { SYSTEM } from "../audit.service";
import { localPatchAttemptPlan, localPatchSettled, LOCAL_PATCH_NORMAL_ATTEMPTS } from "../../domain/scene/local-patch-attempts";
import {
  LOCAL_PATCH_MAX_ATTEMPTS, LOCAL_PATCH_PROVIDER, LOCAL_PATCH_VARIANT, runLocalPatchHide,
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
/**
 * The job is parked here when a reservation is held for something that was
 * never dispatched.
 *
 * A durable marker rather than a returned string, because the distinction is
 * invisible from the ledger: the next tick would see an ordinary pending
 * reservation, read it as a worker still waiting, and queue itself again
 * forever without buying or finishing anything. This is what stops that, and
 * what tells whoever looks why.
 */
export const LOCAL_PATCH_NEEDS_RELEASE = "local-patch:needs-release";

export type LocalPatchSliceResult = {
  readonly gameId: string;
  /** There is still runnable work: another tick should come. */
  readonly pending: boolean;
  /** Nothing was claimed - somebody else holds it, or it is not this engine's. */
  readonly claimed: boolean;
  readonly paused: boolean;
  /** Why this world is waiting for a person, when it is. Durable on the job too. */
  readonly attention: string | null;
  readonly outcomes: readonly LocalPatchHideOutcome[];
  /** Boards this build cannot paint, and why. Named rather than left to fail one by one. */
  readonly blocked: readonly { readonly boardId: string; readonly reason: string }[];
};

const boardsBySlug = new Map(WORLD_LOCAL_PATCH_HIDES.map(board => [board.board, board]));

/**
 * Can this build paint this board at all?
 *
 * Authoring may introduce an unsupported board later. Refuse that explicitly
 * instead of discovering a laptop-only input after a paid identity stage.
 */
export function localPatchBoardBlockedReason(board: LocalPatchBoard): string | null {
  return board.art.startsWith("public/") ? null
    : `${board.board} is authored from ${board.art}, which is not shipped art`;
}

export function localPatchBoardFor(sceneSlug: string): LocalPatchBoard | null {
  return boardsBySlug.get(sceneSlug) ?? null;
}

export async function runLocalPatchWorldSlice(c: Container, deps: LocalPatchHideDeps, gameId: string, options: {
  readonly hardDeadlineAt?: number;
  readonly maxHides?: number;
} = {}): Promise<LocalPatchSliceResult> {
  const empty = { gameId, outcomes: [], blocked: [] as { boardId: string; reason: string }[], attention: null as string | null };
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
  // A job parked for a person is not a job to take. Every OTHER failure stays
  // claimable, because those do get better by trying again.
  if (job.currentStep === LOCAL_PATCH_NEEDS_RELEASE) {
    return { ...empty, pending: false, claimed: false, paused: false, attention: job.lastError ?? LOCAL_PATCH_NEEDS_RELEASE };
  }
  const claimed = await c.db.generationJob.updateMany({
    where: { id: job.id, attempts: job.attempts,
      // Both halves written as explicit alternatives, because `not` on a
      // nullable column does NOT match a null one - SQL compares a null to
      // anything as unknown, so a fresh job whose step is null would have been
      // unclaimable and nothing would ever have been painted again.
      AND: [
        { OR: [{ currentStep: null }, { currentStep: { not: LOCAL_PATCH_NEEDS_RELEASE } }] },
        { OR: [{ status: { not: "RUNNING" } }, { updatedAt: { lt: new Date(Date.now() - LOCAL_PATCH_LEASE_MS) } }] },
      ] },
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

  const allowRepair = env().APP_ENV === "qa";
  const attemptLimit = allowRepair ? LOCAL_PATCH_MAX_ATTEMPTS : LOCAL_PATCH_NORMAL_ATTEMPTS;
  const settledHide = (row: { status: string; attempts: number } | undefined) => localPatchSettled(row, attemptLimit);
  const plan = localPatchAttemptPlan(work.map(item => stateOf(item.sceneId, item.hide.targetId)), allowRepair);
  const todo = plan.indices.map(index => work[index]!);
  const outcomes: LocalPatchHideOutcome[] = [];
  const limit = Math.max(1, options.maxHides ?? LOCAL_PATCH_HIDES_PER_SLICE);
  let paused = false;
  let attention: string | null = null;

  try {
    for (const item of todo.slice(0, limit)) {
      if (options.hardDeadlineAt !== undefined && options.hardDeadlineAt - Date.now() < LOCAL_PATCH_MIN_SLICE_MS) break;
      const outcome = await runLocalPatchHide(c, { ...deps, fence }, { gameId, board: item.board, hide: item.hide,
        finalRepair: plan.finalRepair,
        ...(options.hardDeadlineAt === undefined ? {} : { deadlineAt: options.hardDeadlineAt }) });
      outcomes.push(outcome);
      if (outcome.state === "held") {
        attention = outcome.reason;
        // Written HERE, not with the rest of the bookkeeping at the end. A
        // reservation is committed for something nobody dispatched, and the only
        // record of that is this decision; a failed read on the way to the end of
        // the slice would lose it and leave the job looking like ordinary work.
        await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim },
          data: { status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: (outcome.reason ?? LOCAL_PATCH_NEEDS_RELEASE).slice(0, 500) } });
        break;
      }
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
    if (!attention) await c.db.$transaction(async tx => {
      await fence(tx);
      await tx.gameScene.update({ where: { id: scene.id }, data: { generationStatus: good ? "GENERATED" : "NEEDS_REGENERATION" } });
    });
  }

  // Include failed normal attempts that were deliberately absent from this
  // slice's todo. The final normal completion must queue the repair pass.
  const left = work.filter(item => {
    const row = after.find(r => r.targetInstance.gameSceneId === item.sceneId && r.targetInstance.targetId === item.hide.targetId);
    return !settledHide(row);
  });
  // A world the ledger is holding cannot authorise anything, so another tick
  // would read the same rows, buy nothing and ask again forever. Held is a
  // state for a person, not a state to poll.
  const held = (await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId))).held;
  if (held && !attention) {
    attention = "local-patch: the world ledger is held; reconcile its unresolved charge before continuing";
    await c.db.$transaction(async tx => {
      await fence(tx);
      await tx.generationJob.update({ where: { id: job.id }, data: {
        status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: attention,
      } });
    });
  }
  // Only a complete nine-board world can become a playable product. A refused
  // hide never falls back to an avatar/body sprite and never becomes READY.
  if (!left.length && !paused && !held && !attention && game.scenes.length === 9) {
    const failures = work.filter(item => {
      const row = after.find(r => r.targetInstance.gameSceneId === item.sceneId && r.targetInstance.targetId === item.hide.targetId);
      return !row || !["GENERATED", "APPROVED"].includes(row.status);
    });
    if (!blocked.length && !failures.length && work.length === 27) {
      await finishLocalPatchGame(c, gameId, fence);
      // Readiness is already committed. Notification failure must never turn
      // a playable world back into a failed generation job.
      await deliverGameMail(c, gameId, SYSTEM).catch(error => console.error(`[local-patch] ${gameId}: ready, notification unavailable`, error));
      return { gameId, pending: false, claimed: true, paused: false, attention: null, outcomes, blocked };
    }
    attention = `local-patch: ${failures.length} appearances require review; ${blocked.length} boards unavailable`;
    await c.db.$transaction(async tx => {
      await fence(tx);
      await tx.game.update({ where: { id: gameId }, data: { status: "MANUAL_REVIEW", lastError: attention, configJson: null } });
      await tx.generationJob.update({ where: { id: job.id }, data: { status: "DONE", currentStep: null, lastError: attention } });
    });
  }
  // The claim goes back either way: the next tick re-takes it. Holding it open
  // for the lease would make a paused world wait six minutes for nothing.
  //
  // Unless a person has to look. Then it is parked WITH the reason, where the
  // job status screen reads it, and no tick takes it again until somebody says
  // so - because the thing that is stuck is a committed reservation, and no
  // amount of retrying resolves one of those.
  // A parked job was already written the moment it was parked; leaving it alone
  // here is the point, not an omission.
  if (!attention) {
    await c.db.generationJob.updateMany({ where: { id: job.id, attempts: claim, status: "RUNNING", currentStep: "local-patch" },
      data: { status: left.length ? "QUEUED" : "DONE", currentStep: left.length ? "local-patch" : null } });
  }

  return { gameId, pending: left.length > 0 && !paused && !held && !attention, claimed: true, paused, attention, outcomes, blocked };
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
 * Derived from every authored placement rather than only the current scene
 * rows, so removing a scene or losing its pointer does not hide a paid reply.
 *
 * Called inside the deletion transaction, after its Game -> Job fence.
 */
export async function localPatchPrivateInventory(c: { db: Pick<Prisma.TransactionClient, "gameScene" | "targetInstance" | "targetVariantAsset" | "asset"> }, gameId: string): Promise<{
  readonly assetIds: string[];
  readonly storagePaths: string[];
  readonly retainedPurchaseKeys: string[];
}> {
  const rows = await c.db.targetVariantAsset.findMany({
    where: { targetInstance: { gameScene: { gameId } } },
    select: { assetId: true, rejectedAssetIdsJson: true },
  });
  const assetIds = new Set<string>();
  for (const target of await c.db.targetInstance.findMany({ where: { gameScene: { gameId } }, select: { spriteAssetId: true } })) {
    if (target.spriteAssetId) assetIds.add(target.spriteAssetId);
  }
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
  for (const board of WORLD_LOCAL_PATCH_HIDES) {
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

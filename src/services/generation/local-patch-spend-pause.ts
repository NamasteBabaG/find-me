import type { Container } from "../container";
import { env, spendGuard } from "../../lib/env";
import { spendAllowedFor } from "../../domain/spend-policy";
import { fenceLocalPatchImages } from "./local-patch-lifecycle";

/**
 * local-patch-spend-pause/v1 (18 October 2026). A QA deployment that does not permit a world's owner to
 * spend used to claim that world's job every minute, fail at its first paid step and go round again: no
 * money moved, but nothing was paused either, and the job's claim counter kept climbing. Now the world
 * is not claimed at all while this deployment does not permit its owner: the job is parked, fenced
 * (Game, then Job, never over a live lease), with the reason, and the cron looks again only every ten
 * minutes. Deploying a build that permits the owner resumes it on the next look; nothing else does.
 * Free work (open batch rounds, background answers) waits with it; their reservations stay counted.
 */
export const LOCAL_PATCH_SPEND_PAUSED = "local-patch:spend-paused";
export const LOCAL_PATCH_SPEND_PAUSE_RECHECK_MS = 10 * 60_000;
const REASON = "Paused: this deployment does not permit the world's owner to spend. Nothing is claimed or bought; "
  + "a deployment that permits the owner resumes the world. No parent action is requested.";

/** Whether this deployment may spend for this owner at all (QA, durable storage, the tester list). Reads only. */
export async function localPatchOwnerMaySpend(c: Pick<Container, "db" | "storage">, ownerId: string | null): Promise<boolean> {
  if (!ownerId || env().APP_ENV !== "qa" || c.storage.id !== "db") return false;
  const owner = await c.db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  return !!owner && spendAllowedFor({ ...spendGuard(), realGeneration: true }, owner.email);
}

/**
 * Parks a world in generation whose owner this deployment may not spend for; the parking note, or null when
 * the owner may spend. Never takes a live lease from a worker, and never moves a job a person must look at.
 */
export async function pauseLocalPatchForSpendGuard(c: Pick<Container, "db" | "storage">, gameId: string,
  leaseMs: number, protectedSteps: readonly string[]): Promise<string | null> {
  const game = await c.db.game.findUnique({ where: { id: gameId }, select: { ownerId: true, status: true, deletedAt: true } });
  if (!game || game.status !== "TARGETS_GENERATING" || game.deletedAt || await localPatchOwnerMaySpend(c, game.ownerId)) return null;
  await c.db.$transaction(async tx => {
    await fenceLocalPatchImages(tx, gameId);
    await tx.generationJob.updateMany({ where: { id: `job_${gameId}`, OR: [{ currentStep: null }, { currentStep: { notIn: [...protectedSteps] } }],
      NOT: { status: "RUNNING", updatedAt: { gt: new Date(Date.now() - leaseMs) } } },
    data: { status: "QUEUED", currentStep: LOCAL_PATCH_SPEND_PAUSED, lastError: REASON } });
  });
  return REASON;
}

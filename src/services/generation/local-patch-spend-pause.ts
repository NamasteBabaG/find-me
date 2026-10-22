import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { env, spendGuard } from "../../lib/env";
import { spendAllowedFor } from "../../domain/spend-policy";

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
type SpendPauseStatus = "PAID" | "AVATAR_GENERATING" | "GENERATION_FAILED" | "TARGETS_GENERATING";
const SPEND_PAUSE_STATUSES: readonly SpendPauseStatus[] = ["PAID", "AVATAR_GENERATING", "GENERATION_FAILED", "TARGETS_GENERATING"];
class SpendPauseJobChanged extends Error {}
const REASON = "Paused: this deployment does not permit the world's owner to spend. Nothing is claimed or bought; "
  + "a deployment that permits the owner resumes the world. No parent action is requested.";

/** Whether this deployment may spend for this owner at all (QA, durable storage, the tester list). Reads only. */
export async function localPatchOwnerMaySpend(c: Pick<Container, "db" | "storage">, ownerId: string | null): Promise<boolean> {
  if (!ownerId || env().APP_ENV !== "qa" || c.storage.id !== "db") return false;
  const owner = await c.db.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  return !!owner && spendAllowedFor({ ...spendGuard(), realGeneration: true }, owner.email);
}

/**
 * Parks an identity or world whose owner this deployment may not spend for; the parking note, or null when
 * the owner may spend. Never takes a live lease from a worker, and never moves a job a person must look at.
 */
export async function pauseLocalPatchForSpendGuard(c: Pick<Container, "db" | "storage">, gameId: string,
  leaseMs: number, protectedSteps: readonly string[], eligibleStatuses: readonly SpendPauseStatus[] = ["TARGETS_GENERATING"]): Promise<string | null> {
  const eligible = eligibleStatuses.filter(status => SPEND_PAUSE_STATUSES.includes(status));
  const select = { ownerId: true, status: true, styleVersion: true, deletedAt: true } as const;
  const game = await c.db.game.findUnique({ where: { id: gameId }, select });
  if (!game || game.styleVersion !== "local-patch-world-v1" || !eligible.some(status => status === game.status)
    || game.deletedAt || await localPatchOwnerMaySpend(c, game.ownerId)) return null;
  try {
    const paused = await c.db.$transaction(async tx => {
      const current = await tx.game.findUnique({ where: { id: gameId }, select });
      if (!current || current.ownerId !== game.ownerId || current.styleVersion !== "local-patch-world-v1"
        || !eligible.some(status => status === current.status) || current.deletedAt
        || await localPatchOwnerMaySpend({ ...c, db: tx as Container["db"] }, current.ownerId)) return false;
      const jobId = `job_${gameId}`, leaseBoundary = new Date(Date.now() - leaseMs);
      const job = await tx.generationJob.findUnique({ where: { id: jobId } });
      // A denied owner must not enter the pipeline even when another worker or a
      // protected hold owns the job. Leave both Game and Job completely untouched.
      if (job && (job.gameId !== gameId || protectedSteps.includes(job.currentStep ?? "")
        || job.status === "RUNNING" && job.updatedAt >= leaseBoundary)) return true;
      // Game first, then Job, matching deletion. Unlike an imagery write, a pause
      // also compares the selected stage/owner/engine; READY is never a pause target.
      const live = await tx.game.updateMany({ where: { id: gameId, ownerId: game.ownerId, status: current.status,
        styleVersion: "local-patch-world-v1", deletedAt: null }, data: { deletedAt: null } });
      if (live.count !== 1) return false;
      if (!job) {
        // Identity spend is checked before its first pipeline lease/job exists.
        // A durable pause must also exclude that unstarted identity from cron.
        await tx.generationJob.create({ data: { id: jobId, gameId, status: "QUEUED", currentStep: LOCAL_PATCH_SPEND_PAUSED, lastError: REASON } });
      } else {
        const changed = await tx.generationJob.updateMany({ where: { id: jobId, gameId,
          OR: [{ currentStep: null }, { currentStep: { notIn: [...protectedSteps] } }],
          NOT: { status: "RUNNING", updatedAt: { gte: leaseBoundary } } },
        data: { status: "QUEUED", currentStep: LOCAL_PATCH_SPEND_PAUSED, lastError: REASON } });
        if (changed.count !== 1) throw new SpendPauseJobChanged(); // Roll back the Game fence too.
      }
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return paused ? REASON : null;
  } catch (error) {
    if (error instanceof SpendPauseJobChanged || error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return REASON;
    throw error;
  }
}

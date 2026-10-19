import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { LOCAL_PATCH_NEEDS_RELEASE, LOCAL_PATCH_STYLE } from "./local-patch-world";
import { subjectUpgradeOf } from "./subject-enrollment";

/**
 * local-patch-parked-wake/v1. The scheduled tick never chooses a parked world, and the progress page does not tick a
 * world it shows as held, so a world the engine parked on one of its own review interruptions stayed parked until
 * someone opened `/api/jobs/tick?gameId=…` (the first lean QA world, 19 October). The scheduled tick now gives such a
 * world its own turn, bounded per hold, and its own slice decides (`resumeParkedInterruption`): the hold must name an
 * interruption the automatic continuation admits, or one already continued and recorded on its image, and the job is
 * re-queued only compared on the hold it observed. Nothing is released here and nothing is bought here.
 *
 *  - Only the hold the engine writes when an interrupted review answer's charge cannot be stated (`<requestKey>: … its
 *    charge cannot be stated (…)`), of an enrolled local-patch world in generation. An operator's hold, a refused
 *    enrollment, a question refused before its reservation and a spent continuation are never woken.
 *  - At most `PARKED_WAKE_ATTEMPTS` turns per hold, at least `PARKED_WAKE_SPACING_MS` apart. A hold is the job, its
 *    reason and the moment it was written: a new park is a new hold.
 *  - Each turn is claimed by a receipt whose id is the hold and the attempt number, so two scheduled ticks never take
 *    the same turn, and a turn is counted before its slice runs.
 */
export const LOCAL_PATCH_PARKED_WAKE_POLICY = "local-patch-parked-wake/v1" as const;
export const LOCAL_PATCH_PARKED_WAKE_ACTION = "generation:parked-wake";
export const PARKED_WAKE_ATTEMPTS = 3;
export const PARKED_WAKE_SPACING_MS = 10 * 60_000;
/** Holds looked at per scheduled tick, newest first: an exhausted old hold never crowds out a new one. */
const PARKED_WAKE_SCAN = 50;
/** The hold the engine itself writes when a review answer's charge cannot be stated (`paid-operation.ts`):
 * `<requestKey>: the result is kept but its charge cannot be stated (…)`, or `…: the provider answered and its charge
 * cannot be stated (…)`. A review refused before anything was reserved names its key too, and is not this. */
const ENGINE_INTERRUPTION_HOLD = /^self-repair:board:[a-z0-9-]+:[0-9a-f]{64}: (the result is kept but|the provider answered and) its charge cannot be stated \(/;

export type ParkedWake = { readonly gameId: string; readonly jobId: string; readonly holdSha256: string; readonly attempt: number };

/** One hold: the job, its reason and the moment the reason was written. */
export function parkedHoldSha256(job: { id: string; updatedAt: Date; lastError: string | null }): string {
  return createHash("sha256").update(JSON.stringify([job.id, job.updatedAt.toISOString(), job.lastError])).digest("hex");
}
const receiptPrefix = (holdSha256: string) => `aud_wake_${holdSha256.slice(0, 40)}_`;

/** The parked world whose turn it is, or null. Reads only. */
export async function nextParkedWake(c: Pick<Container, "db">, now = Date.now()): Promise<ParkedWake | null> {
  const jobs = await c.db.generationJob.findMany({
    where: { status: "FAILED", currentStep: LOCAL_PATCH_NEEDS_RELEASE, lastError: { startsWith: "self-repair:board:" },
      game: { status: "TARGETS_GENERATING", deletedAt: null, styleVersion: LOCAL_PATCH_STYLE } },
    orderBy: { updatedAt: "desc" }, take: PARKED_WAKE_SCAN, select: { id: true, gameId: true, lastError: true, updatedAt: true } });
  for (const job of jobs) {
    if (!ENGINE_INTERRUPTION_HOLD.test(job.lastError ?? "") || !await subjectUpgradeOf(c.db, job.gameId)) continue;
    const holdSha256 = parkedHoldSha256(job);
    const turns = await c.db.auditLog.findMany({ where: { id: { startsWith: receiptPrefix(holdSha256) }, action: LOCAL_PATCH_PARKED_WAKE_ACTION },
      select: { createdAt: true } });
    if (turns.length >= PARKED_WAKE_ATTEMPTS || turns.some(turn => now - turn.createdAt.getTime() < PARKED_WAKE_SPACING_MS)) continue;
    return { gameId: job.gameId, jobId: job.id, holdSha256, attempt: turns.length + 1 };
  }
  return null;
}

/** Takes this turn, once: false when another tick already took it. */
export async function claimParkedWake(c: Pick<Container, "db">, wake: ParkedWake): Promise<boolean> {
  try {
    await c.db.auditLog.create({ data: { id: `${receiptPrefix(wake.holdSha256)}${wake.attempt}`, actorType: "SYSTEM", actorId: null,
      action: LOCAL_PATCH_PARKED_WAKE_ACTION, entityType: "Game", entityId: wake.gameId,
      metaJson: JSON.stringify({ policy: LOCAL_PATCH_PARKED_WAKE_POLICY, jobId: wake.jobId, holdSha256: wake.holdSha256, attempt: wake.attempt }) } });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
}

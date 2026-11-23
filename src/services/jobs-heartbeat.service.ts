import type { Prisma } from "@prisma/client";

/**
 * Is the scheduled tick actually running? (Pilot QA, 2026-11-23.)
 *
 * The preparation screen told a parent they could close the window, but where the scheduled tick is off (QA today)
 * only an open page advances a world. Rather than a setting that can drift from the deployment, the scheduled tick
 * writes down when it ran, and a screen makes the promise only while that is recent.
 */
export const CRON_HEARTBEAT_ID = "aud_jobs_cron_heartbeat";
const HEARTBEAT_VERSION = "jobs-cron-heartbeat/v1";
/** The cron runs every minute; three minutes allows a slow or skipped run without promising a stopped one. */
export const CRON_HEARTBEAT_FRESH_MS = 3 * 60_000;
type Db = Pick<Prisma.TransactionClient, "auditLog">;

/** Called only by the scheduled tick (no game id, the cron's own credential). One row, rewritten each run. Never throws. */
export async function recordCronHeartbeat(db: Db | undefined, now = Date.now()): Promise<void> {
  const metaJson = JSON.stringify({ version: HEARTBEAT_VERSION, at: now });
  try {
    await db!.auditLog.upsert({ where: { id: CRON_HEARTBEAT_ID }, update: { metaJson },
      create: { id: CRON_HEARTBEAT_ID, actorType: "SYSTEM", action: "jobs:cron-heartbeat", entityType: "System", entityId: "jobs-cron", metaJson } });
  } catch {
    // A missing heartbeat only means "keep the page open"; it never stops the tick that writes it.
    console.error("[jobs/heartbeat] unavailable");
  }
}

/** True only when the scheduled tick ran within the last three minutes: then a world goes on with its page closed.
 * Unknown (no row, a broken row, no database) is false, so a screen never promises what nothing will keep. */
export async function backgroundWorkRunning(db: Db | undefined, now = Date.now()): Promise<boolean> {
  try {
    const row = await db!.auditLog.findUnique({ where: { id: CRON_HEARTBEAT_ID } });
    const meta = JSON.parse(row?.metaJson ?? "null") as { version?: unknown; at?: unknown } | null;
    if (row?.actorType !== "SYSTEM" || meta?.version !== HEARTBEAT_VERSION || typeof meta.at !== "number") return false;
    const age = now - meta.at;
    return age >= 0 && age < CRON_HEARTBEAT_FRESH_MS;
  } catch {
    return false;
  }
}

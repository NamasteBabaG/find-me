import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { tickGeneration } from "@/services/generation/queue";
import { runRetentionIfDue } from "@/services/retention.service";
import { retryFailedAdminAlerts } from "@/services/admin-alert.service";
import { env } from "@/lib/env";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { safeEqual } from "@/lib/ids";

export const runtime = "nodejs";
/** Generating one hiding spot is ~55s, so the slice needs room for at least one. */
export const maxDuration = 300;

/**
 * Stop starting new hiding spots after this long.
 *
 * This is not the request budget: it is the last moment at which starting more
 * work is safe. A spot takes ~55s and its provider may retry, so the one that
 * starts last can still run for a couple of minutes — and a 240s cutoff against
 * a 300s ceiling produced exactly the "Task timed out after 300 seconds" that
 * killed slices mid-spot and left the lease held.
 */
// Stop launching spots after 30s. A spot is two image calls (painting, then
// pass two) and two judges; each pass is started only if it can finish before
// HARD_MS, and one that cannot is deferred with what came before it kept, so
// provider work stays within the available budget (see slot-patches PASS_*_MIN_MS).
// This is cooperative, not cancellation of arbitrary I/O; the watchdog records
// overruns and the runtime DB client separately bounds its queries.
const SLICE_MS = 30_000;
/** The request's hard limit for generation work: the host's 300s less room for I/O and the answer. */
const HARD_MS = 270_000;

/**
 * Move generation forward.
 *
 * Two callers, on purpose: the cron (so a game finishes even if the parent
 * closes the tab) and the /creating page (so it finishes *quickly* while they
 * are watching). Both are safe to run at once — every step is idempotent and a
 * finished hiding spot is skipped.
 */
export async function POST(req: Request) {
  const startedAt = Date.now();
  const hardDeadlineAt = startedAt + HARD_MS;
  const requestId = crypto.randomUUID();
  let phase = "qa-access";
  // Deliberately no game/child ids, URL, headers, credentials or raw DB error.
  const log = (event: string) => console.info("[jobs/tick]", { requestId, event, phase, elapsedMs: Date.now() - startedAt });
  const enter = (next: string) => { phase = next; log("phase"); };
  log("start");
  const watchdog = setTimeout(() => console.error("[jobs/tick]", { requestId, event: "deadline-exceeded", phase, elapsedMs: Date.now() - startedAt }), HARD_MS);
  // Observation only: never return success while uncancelled DB/provider writes
  // continue. Cancellation belongs to each operation, not Promise.race here.
  watchdog.unref?.();
  try {
    const denied = await qaAccessDenied(req, true);
    if (denied) return denied;
    const c = getContainer();
    const gameId = new URL(req.url).searchParams.get("gameId");
    enter("authorization");
    if (!(await isAllowed(req, gameId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    // Give persisted notification intent a bounded turn before new painting.
    enter("notification-retry");
    if (!gameId) await retryFailedAdminAlerts(c, { deadlineAt: Math.min(hardDeadlineAt, Date.now() + 20_000) });
    if (hardDeadlineAt - Date.now() < SLICE_MS) {
      log("deferred");
      return NextResponse.json({ pending: true, deferred: true }, { status: 202, headers: { "Cache-Control": "no-store", "Retry-After": "30" } });
    }
    enter("generation");
    const result = await tickGeneration(c, gameId, SLICE_MS, Math.max(0, hardDeadlineAt - Date.now()));
    // Retention rides only the cron, with room for its database operations.
    enter("retention");
    const retention = gameId || hardDeadlineAt - Date.now() < 30_000 ? null : await runRetentionIfDue(c).catch(() => {
      console.error("[jobs/tick]", { requestId, event: "retention-failed" });
      return null;
    });
    return NextResponse.json({ ...result, retention }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[jobs/tick]", { requestId, event: "failed", phase, elapsedMs: Date.now() - startedAt });
    throw error;
  } finally {
    clearTimeout(watchdog);
    log("end");
  }
}

/** Vercel Cron sends a GET with the CRON_SECRET bearer token. */
export async function GET(req: Request) {
  return POST(req);
}

async function isAllowed(req: Request, gameId: string | null): Promise<boolean> {
  const secret = env().CRON_SECRET;
  const header = req.headers.get("authorization");
  if (secret && header && safeEqual(`Bearer ${secret}`, header)) return true;
  if (!gameId) return false;
  // Otherwise this only advances a game the caller can already see. A database
  // that is missing or broken means "no", not a 500 on a public endpoint.
  try {
    const c = getContainer();
    const [game, user, draftToken] = await Promise.all([c.db.game.findUnique({ where: { id: gameId }, select: { ownerId: true, draftToken: true } }), currentUser(), draftTokenFromCookie()]);
    if (!game) return false;
    return Boolean((draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email));
  } catch (err) {
    console.warn("[jobs/tick] cannot check access:", err instanceof Error ? err.message.split("\n")[0] : err);
    return false;
  }
}

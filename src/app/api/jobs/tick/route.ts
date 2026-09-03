import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { tickGeneration } from "@/services/generation/queue";
import { env } from "@/lib/env";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { safeEqual } from "@/lib/ids";

export const runtime = "nodejs";
/** Generating one hiding spot is ~55s, so the slice needs room for at least one. */
export const maxDuration = 300;

/** Leave time to write the result and return before the platform kills us. */
const SLICE_MS = 240_000;

/**
 * Move generation forward.
 *
 * Two callers, on purpose: the cron (so a game finishes even if the parent
 * closes the tab) and the /creating page (so it finishes *quickly* while they
 * are watching). Both are safe to run at once — every step is idempotent and a
 * finished hiding spot is skipped.
 */
export async function POST(req: Request) {
  const c = getContainer();
  const url = new URL(req.url);
  const gameId = url.searchParams.get("gameId");

  if (!(await isAllowed(req, gameId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const result = await tickGeneration(c, gameId, SLICE_MS);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
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

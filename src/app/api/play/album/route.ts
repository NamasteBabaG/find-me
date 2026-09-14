import { NextResponse } from "next/server";
import { z } from "zod";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { currentUser } from "@/lib/server/session";
import { getContainer } from "@/services/container";
import { LIMITS, callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { AdventureError } from "@/domain/adventure/compose";
import { AdventureEventSchema } from "@/domain/adventure/progress";
import { ownerAdventureAlbum } from "@/services/adventure-album.service";

export const runtime = "nodejs";

/**
 * The family's album, for the family only.
 *
 * The owner is the session, never the body and never the play link: a child
 * (or a grandparent) on the shared link has no session and gets 401, and keeps
 * playing from the browser's own album. Every find is recorded once, so a
 * refresh, a double tap or a retried request cannot earn a second card; a
 * write that raced another one comes back 409 and the browser reads before it
 * tries the same event again.
 */
const Body = z.object({ gameId: z.string().min(1).max(160), event: AdventureEventSchema.optional() }).strict();

function failure(error: unknown): Response {
  if (error instanceof AdventureError) {
    const status = error.code === "not-owned" ? 403 : error.code === "not-ready" ? 404 : error.code === "invalid-event" ? 400 : error.code === "content-mismatch" ? 409 : 500;
    return NextResponse.json({ ok: false, code: error.code }, { status });
  }
  throw error;
}

async function handle(req: Request, gameId: string, event?: z.infer<typeof AdventureEventSchema>) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const limited = rateLimit(callerKey(req, "album"), LIMITS.album.limit, LIMITS.album.windowMs);
  if (!limited.ok) return tooManyRequests(limited);
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, code: "sign-in" }, { status: 401 });
  try {
    const result = await ownerAdventureAlbum(getContainer().db, user.id, gameId, event);
    return NextResponse.json({ ok: true, progress: result.progress, revision: result.revision, changed: result.changed }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function GET(req: Request) {
  const gameId = new URL(req.url).searchParams.get("gameId") ?? "";
  if (!gameId || gameId.length > 160) return NextResponse.json({ ok: false }, { status: 400 });
  return handle(req, gameId);
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  return handle(req, parsed.data.gameId, parsed.data.event);
}

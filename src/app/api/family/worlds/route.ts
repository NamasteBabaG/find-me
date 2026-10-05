import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getContainer } from "@/services/container";
import { FamilyWorldAccessError, ownerFamilyWorlds } from "@/services/family-worlds.service";

export const runtime = "nodejs";
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const headers = { "cache-control": "private, no-store" };
export async function GET(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  const limit = rateLimit(callerKey(req, "family-worlds"), 90, 60_000); if (!limit.ok) return tooManyRequests(limit);
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401, headers });
  const query = new URL(req.url).searchParams;
  const gameId = Id.safeParse(query.get("gameId"));
  const world = query.has("world") ? Id.safeParse(query.get("world")) : null;
  if (!gameId.success || world && !world.success) return NextResponse.json({ ok: false }, { status: 400, headers });
  try {
    const data = await ownerFamilyWorlds(getContainer(), user.id, gameId.data, world?.success ? world.data : undefined);
    return NextResponse.json({ ok: true, ...data }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false }, { status: error instanceof FamilyWorldAccessError ? 404 : 503, headers });
  }
}

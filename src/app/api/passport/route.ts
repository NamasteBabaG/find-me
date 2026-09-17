import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getContainer } from "@/services/container";
import { ownerPassport, passportSources, PassportAccessError, PassportChoiceSchema, updatePassportPage } from "@/services/passport.service";
import { passportCeremony, passportPhoto } from "@/domain/passport/passport";
import { reconcilePaidFamilyChildren } from "@/services/family.service";

const Id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const Body = z.object({ childId: Id, gameId: Id, board: Id, choice: PassportChoiceSchema }).strict();
const headers = { "cache-control": "private, no-store" };
async function access(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  const limit = rateLimit(callerKey(req, "passport"), 90, 60_000); if (!limit.ok) return tooManyRequests(limit);
  const user = await currentUser();
  return user ?? NextResponse.json({ ok: false }, { status: 401, headers });
}
export async function GET(req: Request) {
  const user = await access(req); if (user instanceof Response) return user;
  const query = new URL(req.url).searchParams;
  let childId = query.get("childId");
  if (!childId && Id.safeParse(query.get("gameId")).success) {
    await reconcilePaidFamilyChildren(getContainer().db, user.id, query.get("gameId")!);
    const game = await getContainer().db.game.findFirst({ where: { id: query.get("gameId")!, ownerId: user.id, deletedAt: null }, select: { familyChildId: true } });
    childId = game?.familyChildId ?? null;
  }
  if (!Id.safeParse(childId).success) return NextResponse.json({ ok: false }, { status: 404, headers });
  try {
    if (query.has("board") && query.has("gameId")) {
      const source = (await passportSources(getContainer().db, user.id, childId!)).sources.find(s => s.game.id === query.get("gameId"));
      if (!source || !source.config.adventure?.boards.some(b => b.boardSlug === query.get("board"))) throw new PassportAccessError();
      const board = query.get("board")!, preference = source.preferences[board];
      return NextResponse.json({ ok: true, childId, pending: passportCeremony(source.progress, board, preference), photoTargetId: passportPhoto(source.progress, board, preference?.photoTargetId)?.targetId ?? null }, { headers });
    }
    return NextResponse.json({ ok: true, childId, book: await ownerPassport(getContainer().db, user.id, childId!) }, { headers });
  }
  catch (error) { return NextResponse.json({ ok: false }, { status: error instanceof PassportAccessError ? 404 : 503, headers }); }
}
export async function POST(req: Request) {
  const user = await access(req); if (user instanceof Response) return user;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ ok: false }, { status: 403, headers });
  let parsed;
  try { parsed = Body.safeParse(await req.json()); } catch { return NextResponse.json({ ok: false }, { status: 400, headers }); }
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400, headers });
  try {
    const { childId, gameId, board, choice } = parsed.data;
    const pending = await updatePassportPage(getContainer().db, user.id, childId, gameId, board, choice);
    return NextResponse.json({ ok: true, pending }, { headers });
  } catch (error) { return NextResponse.json({ ok: false }, { status: error instanceof PassportAccessError ? 404 : 409, headers }); }
}

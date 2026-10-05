import { z } from "zod";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { friendFailure, friendJson, friendOrigin, friendParent, FRIEND_HEADERS } from "@/lib/server/friends";
import { getContainer } from "@/services/container";
import { manageGuestShare } from "@/services/guest-sharing.service";
import { requestMagicLink } from "@/services/auth.service";
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const Body = z.object({ gameId: Id, worldSlug: Id, operation: z.enum(["status", "create", "rotate", "revoke", "reauth"]),
  consent: z.boolean().optional(), locale: z.enum(["en", "he"]).optional() }).strict();
export const runtime = "nodejs";
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  if (!friendOrigin(req)) return friendJson({ ok: false }, 403);
  const limit = rateLimit(callerKey(req, "friends-share"), 30, 60_000); if (!limit.ok) { const response = tooManyRequests(limit); for (const [k, v] of Object.entries(FRIEND_HEADERS)) response.headers.set(k, v); return response; }
  const parsed = Body.safeParse(await req.json().catch(() => null)); if (!parsed.success) return friendJson({ ok: false }, 400);
  try {
    const c = getContainer(), parent = await friendParent(c); if (!parent) return friendJson({ ok: false, code: "sign-in" }, 401);
    const { operation, gameId, worldSlug } = parsed.data;
    if (operation === "reauth") {
      await manageGuestShare(c, parent.user.id, { gameId, worldSlug, operation: "status" });
      const limited = rateLimit(`friends-parent:${parent.user.id}`, 3, 15 * 60_000); if (!limited.ok) return friendJson({ ok: false, code: "rate-limited" }, 429);
      const game = await c.db.game.findUnique({ where: { id: gameId }, select: { familyChildId: true } });
      const next = game?.familyChildId ? `/family/${encodeURIComponent(game.familyChildId)}?friends=${encodeURIComponent(gameId)}&world=${encodeURIComponent(worldSlug)}` : "/family";
      return friendJson(await requestMagicLink(c, parent.user.email, next, parsed.data.locale ?? "en"));
    }
    if (operation !== "status" && !parent.fresh) return friendJson({ ok: true, needsAdult: true });
    if (["create", "rotate"].includes(operation) && !parsed.data.consent) return friendJson({ ok: false, code: "consent-required" }, 403);
    return friendJson({ ok: true, ...await manageGuestShare(c, parent.user.id, { gameId, worldSlug, operation }) });
  } catch (error) { return friendFailure(error); }
}

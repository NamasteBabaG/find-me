import { z } from "zod";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { friendFailure, friendJson, friendOrigin, friendParent, FRIEND_HEADERS } from "@/lib/server/friends";
import { getContainer } from "@/services/container";
import { guestOwnerReport } from "@/services/guest-sharing.service";
const Id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
const Body = z.object({ gameId: Id, worldSlug: Id, operation: z.enum(["read", "seen", "remove"]).default("read"),
  markSeen: z.array(z.object({ shareId: z.string().regex(/^gsr_[a-f0-9]{20}$/), revision: z.number().int().nonnegative() }).strict()).max(100).optional(),
  removeParticipantId: z.string().regex(/^gpt_[a-f0-9]{20}$/).optional() }).strict();
export const runtime = "nodejs";
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  if (!friendOrigin(req)) return friendJson({ ok: false }, 403);
  const limit = rateLimit(callerKey(req, "friends-report"), 90, 60_000); if (!limit.ok) { const response = tooManyRequests(limit); for (const [k, v] of Object.entries(FRIEND_HEADERS)) response.headers.set(k, v); return response; }
  const parsed = Body.safeParse(await req.json().catch(() => null)); if (!parsed.success) return friendJson({ ok: false }, 400);
  try {
    const c = getContainer(), parent = await friendParent(c); if (!parent) return friendJson({ ok: false, code: "sign-in" }, 401);
    const data = parsed.data;
    if (data.operation === "remove" && !parent.fresh) return friendJson({ ok: true, needsAdult: true });
    if (data.operation === "seen" && !data.markSeen || data.operation === "remove" && !data.removeParticipantId) return friendJson({ ok: false }, 400);
    const report = await guestOwnerReport(c, parent.user.id, data.gameId, data.worldSlug, data.operation === "seen" ? { markSeen: data.markSeen } : data.operation === "remove" ? { removeParticipantId: data.removeParticipantId } : undefined);
    return friendJson({ ok: true, report });
  } catch (error) { return friendFailure(error); }
}

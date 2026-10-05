import { cookies } from "next/headers";
import { z } from "zod";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { friendCredential, friendFailure, friendJson, friendOrigin, FRIEND_HEADERS } from "@/lib/server/friends";
import { getContainer } from "@/services/container";
import { guestSession } from "@/services/guest-sharing.service";
import { GuestNicknameId } from "@/domain/guest-sharing";

const Body = z.object({ shareToken: z.string().max(100), operation: z.enum(["inspect", "start", "resume", "another"]),
  participantId: z.string().regex(/^gpt_[a-f0-9]{20}$/).optional(), nicknameId: GuestNicknameId.optional(), joinKey: z.string().regex(/^[A-Za-z0-9_-]{32,80}$/).optional() }).strict();
export const runtime = "nodejs";
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  if (!friendOrigin(req)) return friendJson({ ok: false }, 403);
  const limit = rateLimit(callerKey(req, "friends-session"), 30, 60_000); if (!limit.ok) { const response = tooManyRequests(limit); for (const [k, v] of Object.entries(FRIEND_HEADERS)) response.headers.set(k, v); return response; }
  const parsed = Body.safeParse(await req.json().catch(() => null)); if (!parsed.success) return friendJson({ ok: false }, 400);
  try {
    const { shareToken, ...input } = parsed.data;
    const result = await guestSession(getContainer(), shareToken, await friendCredential(shareToken), input);
    if (result.cookie) (await cookies()).set(result.cookie.name, result.cookie.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: result.cookie.expires });
    return friendJson({ ok: true, ...result.view });
  } catch (error) { return friendFailure(error); }
}

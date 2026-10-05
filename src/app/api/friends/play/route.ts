import { z } from "zod";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { friendCredential, friendFailure, friendJson, friendOrigin, FRIEND_HEADERS } from "@/lib/server/friends";
import { getContainer } from "@/services/container";
import { guestPlay } from "@/services/guest-sharing.service";
const Body = z.object({ shareToken: z.string().max(100), participantId: z.string().regex(/^gpt_[a-f0-9]{20}$/) }).strict();
export const runtime = "nodejs";
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  if (!friendOrigin(req)) return friendJson({ ok: false }, 403);
  const limit = rateLimit(callerKey(req, "friends-play"), 60, 60_000); if (!limit.ok) { const response = tooManyRequests(limit); for (const [k, v] of Object.entries(FRIEND_HEADERS)) response.headers.set(k, v); return response; }
  const parsed = Body.safeParse(await req.json().catch(() => null)); if (!parsed.success) return friendJson({ ok: false }, 400);
  try { return friendJson({ ok: true, ...await guestPlay(getContainer(), parsed.data.shareToken, await friendCredential(parsed.data.shareToken), parsed.data.participantId) }); }
  catch (error) { return friendFailure(error); }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getContainer } from "@/services/container";
import { sharedPassport, sharedPassportMedia } from "@/services/passport-share.service";
import { PassportAccessError } from "@/services/passport.service";

const Body = z.object({ token: z.string().max(100), media: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional() }).strict();
const headers = { "cache-control": "private, no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow, noarchive", "x-content-type-options": "nosniff" };
/** Secret travels in a POST body, never the request URL or analytics. */
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ ok: false }, { status: 403, headers });
  const limit = rateLimit(callerKey(req, "passport-view"), 120, 60_000); if (!limit.ok) return tooManyRequests(limit);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 404, headers });
  try {
    const { token, media } = parsed.data, c = getContainer();
    if (media) return new Response(new Uint8Array(await sharedPassportMedia(c, token, media)), { headers: { ...headers, "content-type": "image/webp" } });
    return NextResponse.json({ ok: true, book: await sharedPassport(c, token) }, { headers });
  } catch (error) { return NextResponse.json({ ok: false }, { status: error instanceof PassportAccessError ? 404 : 503, headers }); }
}

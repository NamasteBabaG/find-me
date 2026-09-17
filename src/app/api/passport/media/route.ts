import { z } from "zod";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { currentUser } from "@/lib/server/session";
import { callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { getContainer } from "@/services/container";
import { ownerPassportMedia } from "@/services/passport-media.service";
import { PassportAccessError } from "@/services/passport.service";

export const runtime = "nodejs";
const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
const Query = z.object({ childId: Id, gameId: Id, board: Id, kind: z.enum(["photo", "discovery"]), id: Id }).strict();
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
export async function GET(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  const limit = rateLimit(callerKey(req, "passport-media"), 120, 60_000); if (!limit.ok) return tooManyRequests(limit);
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401, headers });
  const input = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!input.success) return new Response(null, { status: 400, headers });
  try {
    const bytes = await ownerPassportMedia(getContainer(), user.id, input.data);
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "content-type": "image/webp" } });
  } catch (error) {
    if (error instanceof PassportAccessError) return new Response(null, { status: 404, headers });
    // No source paths, personal names or image request parameters in logs/errors.
    return new Response(null, { status: 503, headers });
  }
}

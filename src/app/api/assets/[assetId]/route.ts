import { getContainer } from "@/services/container";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { readAsset } from "@/services/asset.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { cookies } from "next/headers";
import { guestCookieName, guestMedia } from "@/services/guest-sharing.service";

export const runtime = "nodejs";

/**
 * Serves stored assets with access control:
 *  • GAME assets  — signed URL (?s=…) → cacheable, embedded in play configs
 *  • PRIVATE      — owner or admin session only, never cached
 */
export async function GET(req: Request, ctx: { params: Promise<{ assetId: string }> }) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const { assetId } = await ctx.params;
  const url = new URL(req.url);
  // A friends URL has a separate capability and must never fall through to a
  // session or ordinary GAME signature, even if extra s/e params are supplied.
  if (["guestShare", "guestParticipant", "guestProof"].some(key => url.searchParams.has(key))) {
    const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
    try {
      const shareId = url.searchParams.get("guestShare") ?? "", participantId = url.searchParams.get("guestParticipant") ?? "", proof = url.searchParams.get("guestProof") ?? "";
      if (!/^gsr_[a-f0-9]{20}$/.test(shareId) || !/^gpt_[a-f0-9]{20}$/.test(participantId) || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return new Response(null, { status: 404, headers });
      const participantToken = (await cookies()).get(guestCookieName(shareId))?.value ?? null;
      const result = await guestMedia(getContainer(), { shareId, participantId, participantToken, assetId, proof });
      return new Response(new Uint8Array(result.bytes), { headers: { ...headers, "Content-Type": result.mimeType } });
    } catch { return new Response(null, { status: 404, headers }); }
  }
  const user = await currentUser();
  const result = await readAsset(getContainer(), assetId, { userId: user?.id ?? null, isAdmin: isAdminEmail(user?.email), signature: url.searchParams.get("s"), expires: url.searchParams.get("e") });
  // Every answer states its own caching: the QA gate leaves this route's header alone (see middleware).
  if ("error" in result) return new Response(result.error === 404 ? "not found" : "forbidden", { status: result.error, headers: { "Cache-Control": "private, no-store" } });
  // Cacheability is the asset's, not the query string's. Deciding it by the
  // presence of `?s=` let an owner's own request for a PRIVATE photograph come
  // back immutable-for-a-day, which outlives both the session and the deletion.
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      "Content-Type": result.mimeType,
      "Cache-Control": result.cacheable ? "private, max-age=86400, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

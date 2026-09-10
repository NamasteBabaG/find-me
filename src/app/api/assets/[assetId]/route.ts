import { getContainer } from "@/services/container";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { readAsset } from "@/services/asset.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";

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
  const user = await currentUser();
  const result = await readAsset(getContainer(), assetId, { userId: user?.id ?? null, isAdmin: isAdminEmail(user?.email), signature: url.searchParams.get("s"), expires: url.searchParams.get("e") });
  if ("error" in result) return new Response(result.error === 404 ? "not found" : "forbidden", { status: result.error });
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

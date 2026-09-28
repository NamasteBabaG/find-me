import { qaAccessConfig, qaDeniedResponse, qaTokenFromRequest, validQaSession } from "@/lib/qa-access";

export const dynamic = "force-dynamic";

/** Outer QA gate only, no account data, session creation or expiry extension.
 * Unlike an image redirect this gives the reader an unambiguous auth signal. */
export async function GET(req: Request) {
  const c = qaAccessConfig();
  const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow, noarchive" };
  if (!c.enabled) return new Response(null, { status: 404, headers });
  if (!(await validQaSession(qaTokenFromRequest(req, c), c))) return qaDeniedResponse(c);
  return new Response(null, { status: 204, headers });
}

import { NextResponse, type NextRequest } from "next/server";
import { qaAccessConfig, qaAccessConfigured, qaCronAllowed, qaDeniedResponse, qaTokenFromRequest, safeQaNext, validQaSession } from "@/lib/qa-access";

export async function middleware(req: NextRequest) {
  const c = qaAccessConfig();
  if (!c.enabled) return NextResponse.next();
  const path = req.nextUrl.pathname;
  const read = req.method === "GET" || req.method === "HEAD";
  const publicGate = (read && (path === "/qa-access" || path.startsWith("/_next/static/"))) ||
    (req.method === "POST" && path === "/qa-access/login");
  if (publicGate || await qaCronAllowed(req, c) || await validQaSession(qaTokenFromRequest(req, c), c)) {
    const response = NextResponse.next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    // Public board pixels can reuse their body through Next's static ETag,
    // but every visit still revalidates through this access gate. Never give
    // them a fresh browser lifetime or permit a shared CDN cache.
    if (read && staticBoardImage(path)) response.headers.set("Cache-Control", "private, max-age=0, must-revalidate");
    // Prevent a CDN-cached authenticated document from outliving entry access.
    else if (!path.startsWith("/_next/static/") && !ownsCacheHeader(path)) response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
  if (!read || path.startsWith("/api/") || !qaAccessConfigured(c)) return qaDeniedResponse(c);
  const url = req.nextUrl.clone();
  url.pathname = "/qa-access";
  url.search = "";
  url.searchParams.set("next", safeQaNext(`${path}${req.nextUrl.search}`));
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return response;
}

/**
 * Picture routes that set their own Cache-Control on every response: `private` (never a shared cache), kept by this
 * browser only while it is safe (a signed game picture, or the owner's passport picture for ten minutes), `no-store`
 * otherwise. A header set here wins over the route's, so forcing no-store made every passport page download all its
 * pictures again on each visit (Guy, 2026-10-01: passport pictures took very long to appear).
 */
function ownsCacheHeader(path: string) {
  return path === "/api/passport/media" || /^\/api\/assets\/[^/]+$/.test(path);
}

/** Child-free authored board artwork only; no uploads, API pixels or HTML. */
function staticBoardImage(path: string): boolean {
  return /^\/(?:scenes|worlds)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|webp|jpe?g|avif)$/.test(path);
}

export const config = { matcher: ["/:path*"] };

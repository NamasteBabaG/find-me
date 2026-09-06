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
    // Prevent a CDN-cached authenticated document from outliving entry access.
    if (!path.startsWith("/_next/static/")) response.headers.set("Cache-Control", "private, no-store");
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

export const config = { matcher: ["/:path*"] };

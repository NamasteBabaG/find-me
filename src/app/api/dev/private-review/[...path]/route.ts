import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isLiveShop } from "@/lib/env";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { privateReviewRoot } from "@/lib/server/private-review-root";

export const dynamic = "force-dynamic";

/**
 * Serves the private board-review rasters straight off disk.
 *
 * These are a real child's illustrated appearances, so they deliberately do NOT
 * live in `public/`: nothing here may become a web-reachable file on a deploy or
 * get swept into git. The route is closed on the live shop, requires an admin,
 * and never lists a directory. It exists so the private review game can be
 * opened in the real player without publishing a single image.
 */

const assetsRoot = () => path.join(privateReviewRoot(), "assets");
const SAFE = /^[A-Za-z0-9_.-]+$/;

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (isLiveShop()) return new NextResponse("Not found", { status: 404 });
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) return new NextResponse("Not found", { status: 404 });

  const { path: segments } = await context.params;
  if (!Array.isArray(segments) || segments.length !== 2 || !segments.every(s => SAFE.test(s) && s !== "." && s !== "..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const root = assetsRoot();
  const file = path.resolve(root, segments[0]!, segments[1]!);
  // Resolve first, then prove the result is still inside the private root, so a
  // crafted segment cannot climb out of it.
  if (file !== path.normalize(file) || !file.startsWith(root + path.sep)) return new NextResponse("Not found", { status: 404 });
  if (!file.toLowerCase().endsWith(".png")) return new NextResponse("Not found", { status: 404 });

  const bytes = await readFile(file).catch(() => null);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "content-type": "image/png", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}

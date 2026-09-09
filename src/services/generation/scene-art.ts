import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createQaSession, qaAccessConfig, qaCookieName } from "@/lib/qa-access";
import { env } from "@/lib/env";

/**
 * The base art of a world.
 *
 * Worlds are rendered once and live in `public/`, so a dev box reads them off
 * disk. A serverless host serves them from its CDN and may not have them in the
 * function bundle, so we fall back to fetching them from our own origin. Either
 * way an art file is immutable for the life of a scene version, so one copy per
 * process is enough — nine worlds is ~18MB, and a run touches only the ones it
 * generates for.
 */
const cache = new Map<string, Buffer>();

export async function loadSceneArt(appUrl: string, relativePath: string, expectedSha256?: string): Promise<Buffer> {
  // Fixed public raster artwork only. No arbitrary URL, private asset route,
  // encoded traversal, query, fragment or filesystem escape is permitted.
  if (!/^\/?(?:scenes|worlds)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|webp|jpe?g|avif)$/.test(relativePath)) throw new Error("Invalid static scene art path");
  const origin = new URL(appUrl);
  if (!["https:", "http:"].includes(origin.protocol) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") throw new Error("Invalid static scene art origin");
  const assetPath = `/${relativePath.replace(/^\//, "")}`;
  const key = `${origin.origin}:${assetPath}:${expectedSha256 ?? "legacy"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const buffer = (await fromDisk(assetPath)) ?? (await fromOrigin(origin.origin, assetPath));
  if (expectedSha256 && createHash("sha256").update(buffer).digest("hex") !== expectedSha256) throw new Error(`Scene art hash mismatch: ${relativePath}`);
  cache.set(key, buffer);
  return buffer;
}

async function fromDisk(relativePath: string): Promise<Buffer | null> {
  try {
    return await readFile(path.join(process.cwd(), "public", relativePath.replace(/^\//, "")));
  } catch {
    return null;
  }
}

async function fromOrigin(appUrl: string, relativePath: string): Promise<Buffer> {
  const url = new URL(relativePath, appUrl);
  if (url.origin !== appUrl) throw new Error("Static scene art must remain same-origin");
  const config = qaAccessConfig();
  const headers: Record<string, string> = {};
  if (config.enabled) {
    // Server-authored QA gate session, never the administrator/user's cookie.
    // It is attached only to the configured application origin and the fixed
    // raster prefixes validated above. Redirects are forbidden so it cannot be
    // forwarded to another origin or used to access another application route.
    if (url.origin !== new URL(env().APP_URL).origin || config.secure && url.protocol !== "https:") throw new Error("QA static art origin differs from configured application");
    headers.cookie = `${qaCookieName(config)}=${await createQaSession(config)}`;
  }
  const res = await fetch(url.toString(), { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (res.redirected || res.url && res.url !== url.toString()) throw new Error("Static scene art redirect refused");
  if (!res.ok) throw new Error(`scene art not found: ${url} (${res.status})`);
  if (!/^image\/(?:png|webp|jpeg|avif)(?:;|$)/i.test(res.headers.get("content-type") ?? "")) throw new Error("Static scene art response is not a raster image");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > 32 * 1024 * 1024) throw new Error("Static scene art exceeds image limit");
  return bytes;
}

/** Tests and long-running scripts that swap art between runs. */
export function clearSceneArtCache(): void {
  cache.clear();
}

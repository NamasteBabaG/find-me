/**
 * A small fixed-window rate limiter for the endpoints a stranger can reach.
 *
 * It lives in the process, so on a serverless host each instance counts on its
 * own and the effective limit is (instances × limit). That is deliberate for
 * now: it costs nothing, needs no round trip, and turns "hammer the upload
 * endpoint" from free into expensive. When traffic justifies it, swap the store
 * for the database or a KV — every caller goes through `rateLimit()`.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
let lastSweep = 0;

/** Drop expired windows now and then so the map cannot grow without bound. */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}

export interface RateLimitResult {
  ok: boolean;
  /** Requests left in this window. */
  remaining: number;
  /** Seconds until the window resets — what to put in Retry-After. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now);
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  current.count++;
  const retryAfter = Math.ceil((current.resetAt - now) / 1000);
  return { ok: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfter };
}

/**
 * Who is asking. Behind a proxy the first x-forwarded-for hop is the client;
 * an unknown caller shares one bucket, which is the safe way to be wrong.
 */
export function callerKey(req: Request, scope: string): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

/** The 429 to return when a caller is over the limit. */
export function tooManyRequests(result: RateLimitResult): Response {
  return new Response(JSON.stringify({ ok: false, code: "TOO_MANY_REQUESTS" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(Math.max(1, result.retryAfter)) },
  });
}

/** One place to see what every public entry point allows. */
export const LIMITS = {
  /** Uploading a photo is the most expensive thing a stranger can make us do. */
  photoUpload: { limit: 12, windowMs: 10 * 60_000 },
  /** Sending mail to an address someone else typed. */
  magicLink: { limit: 5, windowMs: 15 * 60_000 },
  /** Starting a checkout creates an order row. */
  checkout: { limit: 10, windowMs: 10 * 60_000 },
  /** Webhooks are signed, but an unsigned flood should still be cheap to refuse. */
  webhook: { limit: 120, windowMs: 60_000 },
  /** Play progress is chatty by nature; this only stops a runaway loop. */
  progress: { limit: 240, windowMs: 60_000 },
} as const;

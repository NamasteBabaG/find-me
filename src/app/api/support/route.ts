import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { callerKey, rateLimit } from "@/lib/server/rate-limit";
import { getContainer } from "@/services/container";
import { receiveSupportRequest, SupportInput } from "@/services/support.service";
import { env } from "@/lib/env";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: responseHeaders });

export async function POST(req: Request) {
  const denied = await qaAccessDenied(req); if (denied) return denied;
  // Next may represent a proxied localhost request with a different internal
  // host. Trust configured public origins, never an arbitrary Host header.
  const origins = [new URL(env().APP_URL).origin];
  if (process.env.VERCEL_URL) origins.push(new URL(`https://${process.env.VERCEL_URL.trim()}`).origin);
  if (!origins.includes(req.headers.get("origin") ?? "")) return reply({ ok: false }, 403);
  if (!req.headers.get("content-type")?.startsWith("application/json")) return reply({ ok: false }, 415);
  const limited = rateLimit(callerKey(req, "support"), 8, 10 * 60_000);
  if (!limited.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { ...responseHeaders, "Retry-After": String(limited.retryAfter) } });
  // Bound the actual streamed body as well as Content-Length, before parsing.
  const reader = req.body?.getReader(); if (!reader) return reply({ ok: false }, 400);
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16_384) { await reader.cancel(); return reply({ ok: false }, 413); }
      chunks.push(part.value);
    }
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return reply({ ok: false }, 400); }
    const parsed = SupportInput.safeParse(raw);
    if (!parsed.success) return reply({ ok: false }, 400);
    const receipt = await receiveSupportRequest(getContainer().db, parsed.data);
    return reply({ ok: true, ...receipt });
  } catch {
    // No personal message, email, token, or raw exception enters runtime logs.
    console.error("[support] request could not be recorded");
    return reply({ ok: false }, 503);
  } finally { reader.releaseLock(); }
}

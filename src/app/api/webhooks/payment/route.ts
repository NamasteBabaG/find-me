import { getContainer } from "@/services/container";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { handlePaymentWebhook } from "@/services/order.service";
import { LIMITS, callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

/** The payment provider calls this. It is the only path to PAID. */
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  // The signature check is the real gate; this just makes a flood cheap to refuse.
  const limited = rateLimit(callerKey(req, "webhook"), LIMITS.webhook.limit, LIMITS.webhook.windowMs);
  if (!limited.ok) return tooManyRequests(limited);
  const rawBody = await req.text();
  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const outcome = await handlePaymentWebhook(getContainer(), rawBody, headers);
  return new Response(outcome.body, { status: outcome.status });
}

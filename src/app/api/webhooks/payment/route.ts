import { getContainer } from "@/services/container";
import { handlePaymentWebhook } from "@/services/order.service";

export const runtime = "nodejs";

/** The payment provider calls this. It is the only path to PAID. */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const outcome = await handlePaymentWebhook(getContainer(), rawBody, headers);
  return new Response(outcome.body, { status: outcome.status });
}

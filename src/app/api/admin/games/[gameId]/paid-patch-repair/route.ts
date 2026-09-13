import { currentAdmin } from "@/lib/server/session";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { stageLocalPatchPaidRepair } from "@/services/generation/local-patch-paid-repair";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BODY_BYTES = 250_000;
const CONFIRMATION = "review-existing-paid-images-only";
const reply = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });

/** Read at most the advertised form limit even for chunked/misdeclared requests.
 * A stored image/approval is never accepted by this boundary: the service
 * validates the paid source and stages fresh review through the normal queue. */
async function boundedForm(req: Request): Promise<URLSearchParams | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { void reader.cancel().catch(() => undefined); return null; }
      chunks.push(value);
    }
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)));
  } catch { return null; }
  finally { reader.releaseLock(); }
}

export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  if (env().APP_ENV !== "qa") return reply(404, "NOT_FOUND");
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  if (req.headers.get("origin") !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site") return reply(403, "FORBIDDEN");
  const admin = await currentAdmin();
  if (!admin) return reply(403, "FORBIDDEN");
  if (req.headers.get("content-type")?.split(";")[0]?.trim() !== "application/x-www-form-urlencoded") return reply(400, "INVALID_REQUEST");
  const form = await boundedForm(req);
  if (!form || [...form.keys()].length !== 3 || new Set(form.keys()).size !== 3
    || !["repairs", "authorizationReason", "confirm"].every(key => form.has(key))
    || form.get("confirm") !== CONFIRMATION) return reply(400, "INVALID_REQUEST");
  const authorizationReason = form.get("authorizationReason")!.trim();
  if (authorizationReason.length < 10 || authorizationReason.length > 1_000) return reply(400, "INVALID_REQUEST");
  let repairs: unknown;
  try { repairs = JSON.parse(form.get("repairs")!); } catch { return reply(400, "INVALID_REQUEST"); }
  if (!Array.isArray(repairs) || repairs.length !== 2) return reply(400, "INVALID_REQUEST");
  const { gameId } = await ctx.params;
  try {
    await stageLocalPatchPaidRepair(getContainer(), { gameId, operatorId: admin.id, authorizationReason, repairs });
    return new Response(null, { status: 303, headers: { Location: `/admin/orders/${encodeURIComponent(gameId)}?paidRepair=queued`, "Cache-Control": "no-store" } });
  } catch (error) {
    // Fixed contract messages contain no uploaded bytes, prompts or credentials.
    // Keep the response generic, but make a live refusal diagnosable by its operator.
    console.error("[paid-patch-repair] staging refused", error instanceof Error && error.message.startsWith("LOCAL_PATCH_PAID_REPAIR:")
      ? error.message.slice(0, 500) : "internal preparation or storage failure");
    return reply(409, "PAID_PATCH_REPAIR_NOT_CONFIRMED");
  }
}

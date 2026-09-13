import { currentAdmin } from "@/lib/server/session";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { stageLocalPatchExtraAttempts } from "@/services/generation/local-patch-extra-attempt";

export const runtime = "nodejs";
export const maxDuration = 300;
const reply = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });

async function boundedForm(req: Request): Promise<URLSearchParams | null> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 12000)) return null;
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 12000) { void reader.cancel().catch(() => undefined); return null; }
      chunks.push(value);
    }
    return new URLSearchParams(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)));
  } catch { return null; } finally { reader.releaseLock(); }
}

export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  if (env().APP_ENV !== "qa") return reply(404, "NOT_FOUND");
  const denied = await qaAccessDenied(req); if (denied) return denied;
  if (req.headers.get("origin") !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site") return reply(403, "FORBIDDEN");
  const admin = await currentAdmin(); if (!admin) return reply(403, "FORBIDDEN");
  if (req.headers.get("content-type")?.split(";")[0]?.trim() !== "application/x-www-form-urlencoded") return reply(400, "INVALID_REQUEST");
  const form = await boundedForm(req);
  if (!form || [...form.keys()].some(key => !["hideId", "reviewOnlyHideId", "reason", "confirm"].includes(key))
    || form.getAll("reason").length !== 1 || form.getAll("confirm").length !== 1 || form.get("confirm") !== "one-scoped-extra-attempt"
    || form.getAll("hideId").length < 1 || form.getAll("hideId").length > 3 || form.getAll("reviewOnlyHideId").length > 1) return reply(400, "INVALID_REQUEST");
  const { gameId } = await ctx.params;
  const reason = form.get("reason")!.trim();
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId) || reason.length < 10 || reason.length > 1000
    || new Set(form.getAll("hideId")).size !== form.getAll("hideId").length
    || form.getAll("reviewOnlyHideId").some(id => form.getAll("hideId").includes(id))) return reply(400, "INVALID_REQUEST");
  try {
    await stageLocalPatchExtraAttempts(getContainer(), { gameId, operatorId: admin.id, reason,
      hideIds: form.getAll("hideId"), reviewOnlyHideIds: form.getAll("reviewOnlyHideId") });
    return new Response(null, { status: 303, headers: { Location: `/admin/orders/${encodeURIComponent(gameId)}?extraAttempt=queued`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[extra-patch-attempt] staging refused", error instanceof Error && error.message.startsWith("LOCAL_PATCH_EXTRA_ATTEMPT:")
      ? error.message.slice(0, 500) : "internal preparation or storage failure");
    return reply(409, "EXTRA_ATTEMPT_NOT_CONFIRMED");
  }
}

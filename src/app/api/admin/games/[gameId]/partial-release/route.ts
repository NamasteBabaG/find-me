import { currentAdmin } from "@/lib/server/session";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { publishLocalPatchPartialGame } from "@/services/generation/local-patch-partial-release";
import { publishGame } from "@/services/publish.service";

export const runtime = "nodejs";
export const maxDuration = 300;
const reply = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });
// Exact static service reasons only. A prefix alone cannot make arbitrary
// upstream errors or future messages containing child data safe to log.
const safeReleaseErrors = new Set([
  "Explicit distinct omissions required", "Live owned paid game and illustrated identity required",
  "Paid nonrefunded order required", "Exactly nine pinned age-five boards required", "All workers must be inactive",
  "The original 45-row inventory must remain intact", "Retained assets missing", "Owned retained bytes missing",
  "Wrong identity or portrait purpose", "Original authored placements changed", "An authored target is missing or from another engine",
  "Only failed unshippable appearances may be omitted", "Every included appearance needs its existing image and geometry",
  "Included image belongs to another game or purpose", "Included pixels or geometry no longer match the retained render",
  "Each released board must retain four or five appearances", "An omission does not belong to this game",
  "Partial release audit changed", "Partial release authority changed", "The authorized images, identity, inventory or charges changed",
  "The published config differs from the atomically finalized game", "Only durable QA games may use partial release",
  "Authenticated administrator required", "Only an unpublished terminal quality failure is eligible",
  "The terminal game or worker changed", "The selected inventory changed during authorization",
  "An existing authorization names another operator or subset", "Released game has no playable config",
  "Publication lost its game or worker fence", "Partial release changed before publication",
].map(reason => `LOCAL_PATCH_PARTIAL_RELEASE: ${reason}`));

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
  if (!form || [...form.keys()].some(key => !["omittedHideId", "reason", "confirm"].includes(key))
    || form.getAll("reason").length !== 1 || form.getAll("confirm").length !== 1
    || form.get("confirm") !== "publish-retained-subset-by-human-decision") return reply(400, "INVALID_REQUEST");
  const { gameId } = await ctx.params;
  const reason = form.get("reason")!.trim(), omittedHideIds = form.getAll("omittedHideId");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId) || reason.length < 10 || reason.length > 1000
    || omittedHideIds.length < 1 || omittedHideIds.length > 9 || new Set(omittedHideIds).size !== omittedHideIds.length
    || omittedHideIds.some(id => !/^[A-Za-z0-9_-]{1,160}$/.test(id))) return reply(400, "INVALID_REQUEST");
  const c = getContainer();
  try {
    await publishLocalPatchPartialGame(c, { gameId, operatorId: admin.id, reason, omittedHideIds });
  } catch (error) {
    // Review text and operator reasons belong to the private audit, not logs.
    console.error("[partial-release] publication could not be confirmed", error instanceof Error && safeReleaseErrors.has(error.message)
      ? error.message : "internal preparation or storage failure");
    return reply(409, "PARTIAL_RELEASE_NOT_CONFIRMED");
  }
  let deliveryPending = false;
  try {
    await publishGame(c, gameId, { type: "ADMIN", id: admin.id });
  } catch {
    // Publication is already durable. Delivery trouble must not label it failed.
    deliveryPending = true;
    console.error("[partial-release] published; delivery follow-up could not be confirmed");
  }
  return new Response(null, { status: 303, headers: {
    Location: `/admin/orders/${encodeURIComponent(gameId)}?partialRelease=published${deliveryPending ? "&delivery=pending" : ""}`,
    "Cache-Control": "no-store",
  } });
}

import { currentAdmin } from "@/lib/server/session";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { env } from "@/lib/env";
import { getContainer } from "@/services/container";
import { authorizeBoardWizardTransportRecovery, BoardWizardRecoveryError, boardWizardRecoveryRequestSchema } from "@/services/generation/board-wizard-recovery";

export const runtime = "nodejs";
const reply = (status: number, code: string) => Response.json({ ok: false, code }, { status, headers: { "Cache-Control": "no-store" } });

/** Explicit same-origin ADMIN form. No GET mutation, bearer/cron bypass or
 * provider dispatch: the ordinary fenced queue handles the one approved read. */
export async function POST(req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  if (env().APP_ENV !== "qa") return reply(404, "NOT_FOUND");
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  if (req.headers.get("origin") !== new URL(req.url).origin || req.headers.get("sec-fetch-site") === "cross-site") return reply(403, "FORBIDDEN");
  const admin = await currentAdmin();
  if (!admin) return reply(403, "FORBIDDEN");
  if (req.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded"
    || Number(req.headers.get("content-length") ?? 0) > 4096) return reply(400, "INVALID_REQUEST");
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 4096) return reply(400, "INVALID_REQUEST");
  const form = new URLSearchParams(raw), { gameId } = await ctx.params;
  if ([...form.keys()].length !== 3 || new Set(form.keys()).size !== 3) return reply(400, "INVALID_REQUEST");
  const parsed = boardWizardRecoveryRequestSchema.safeParse({ gameId, ...Object.fromEntries(form) });
  if (!parsed.success) return reply(400, "INVALID_REQUEST");
  try {
    await authorizeBoardWizardTransportRecovery(getContainer(), { type: "ADMIN", id: admin.id }, parsed.data);
    return new Response(null, { status: 303, headers: { Location: `/admin/orders/${encodeURIComponent(gameId)}?recovery=authorized`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BoardWizardRecoveryError) return reply(error.code === "forbidden" ? 403 : 409, error.code.toUpperCase());
    return reply(409, "RECOVERY_NOT_CONFIRMED");
  }
}

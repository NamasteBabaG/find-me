import { NextResponse } from "next/server";
import { qaAccessDenied } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { ProgressBatchInput, recordProgress } from "@/services/progress.service";
import { LIMITS, callerKey, rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { z } from "zod";
import { currentUser } from "@/lib/server/session";
import { resolvePlayToken } from "@/services/share-link.service";
import { isPlayable } from "@/domain/order-state";
import { statusOf } from "@/services/game-status";
import { parseGameConfig } from "@/domain/game/config";

const AuthenticatedBatch = ProgressBatchInput.extend({ playToken: z.string().min(1).max(256).optional() });

export const runtime = "nodejs";

/** Aggregate play events from the player (sendBeacon-friendly). */
export async function POST(req: Request) {
  const denied = await qaAccessDenied(req);
  if (denied) return denied;
  const limited = rateLimit(callerKey(req, "progress"), LIMITS.progress.limit, LIMITS.progress.windowMs);
  if (!limited.ok) return tooManyRequests(limited);
  const c = getContainer();
  let parsed;
  try {
    parsed = AuthenticatedBatch.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  // A public game id is not permission to write events. Guests need the same
  // active bearer link as the player; family players need the owner session.
  const { playToken, ...batch } = parsed.data;
  const game = await c.db.game.findUnique({ where: { id: batch.gameId }, select: { id: true, ownerId: true, deletedAt: true, status: true, configJson: true } });
  let authorized = false;
  if (game && !game.deletedAt && isPlayable(statusOf(game)) && game.configJson) {
    if (playToken) {
      const resolved = await resolvePlayToken(c, playToken);
      authorized = resolved.ok && resolved.game.id === game.id;
    } else {
      const user = await currentUser();
      authorized = Boolean(user && user.id === game.ownerId);
    }
  }
  if (!authorized || !game?.configJson) return NextResponse.json({ ok: false }, { status: 403 });
  let config;
  try { config = parseGameConfig(game.configJson); }
  catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const validEvents = batch.events.every(event => {
    const scene = config.scenes.find(row => row.slug === event.sceneSlug);
    if (event.sceneSlug && !scene) return false;
    if (["scene_started", "scene_completed", "scene_unlocked", "target_found", "hint_used"].includes(event.eventType) && !scene) return false;
    if (event.eventType === "target_found" && !event.targetId) return false;
    return !event.targetId || Boolean(scene?.targets.some(target => target.id === event.targetId));
  });
  if (!validEvents) return NextResponse.json({ ok: false }, { status: 400 });
  // Never persist or forward the bearer credential to analytics.
  await recordProgress(c, batch);
  return new NextResponse(null, { status: 204 });
}

import type { Container } from "./container";
import { statusOf, transitionGame } from "./game-status";
import { ensurePlayerLink } from "./share-link.service";
import { createMagicLink } from "./auth.service";
import { gameReadyEmail } from "./email/templates";
import { isPlayable } from "@/domain/order-state";
import { routeMail } from "./email/fallback";
import { deleteAsset } from "./asset.service";
import { audit, type Actor } from "./audit.service";

/**
 * QA_PENDING → APPROVED → READY → (email) → DELIVERED.
 * Also enforces the privacy default: the original photo is deleted once the
 * game is approved, unless the parent explicitly chose to keep it.
 */
export async function publishGame(c: Container, gameId: string, actor: Actor): Promise<{ playUrl: string }> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { childProfile: true, owner: true, scenes: true } });
  const status = statusOf(game);
  if (status === "QA_PENDING" || status === "MANUAL_REVIEW") {
    if (status === "MANUAL_REVIEW") await transitionGame(c, gameId, "QA_PENDING", actor);
    await transitionGame(c, gameId, "APPROVED", actor);
    c.analytics.track("qa_approved", { gameId });
  }
  // Privacy default: drop the original photo once approved — before the game becomes playable.
  if (game.childProfile && !game.childProfile.retainOriginalPhoto && game.childProfile.originalPhotoAssetId) {
    await deleteAsset(c, game.childProfile.originalPhotoAssetId);
    await c.db.childProfile.update({ where: { id: game.childProfile.id }, data: { originalPhotoAssetId: null } });
    await audit(c, actor, "photo:deleted-after-qa", "ChildProfile", game.childProfile.id);
  }

  if (statusOf(await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } })) === "APPROVED") {
    await transitionGame(c, gameId, "READY", actor);
    c.analytics.track("game_ready", { gameId, sceneCount: game.scenes.length });
  }

  const link = await ensurePlayerLink(c, gameId);

  const current = statusOf(await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } }));
  if (current === "READY" && game.childProfile) await deliverGameMail(c, gameId, actor);
  return { playUrl: link.url };
}

/**
 * The "your game is ready" mail. Shared by publishing and by the parent's
 * "email me the link" button, so both send the same thing the same way.
 *
 * The game is already playable when this runs: the link works and the parent
 * can open it from their library. So a mail server having a bad afternoon must
 * never throw out of here — that once turned a finished game into a FAILED job
 * and put an email error in front of the parent as if generation had broken.
 * DELIVERED means a real recipient got it; a fallback inbox or no recipient at
 * all leaves the game READY, because the parent does not have it.
 */
export async function deliverGameMail(c: Container, gameId: string, actor: Actor): Promise<{ outcome: "sent" | "fallback" | "no-recipient" | "failed"; simulated: boolean }> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, include: { owner: true, childProfile: true, scenes: true } });
  const link = await ensurePlayerLink(c, gameId);
  const simulated = c.email.id === "console";
  if (!game.childProfile) return { outcome: "no-recipient", simulated };
  try {
    const owner = game.owner;
    const libraryLink = owner ? await createMagicLink(c, owner.id, `/library/${gameId}`) : undefined;
    const locale = game.locale === "he" ? "he" : "en";
    const mail = gameReadyEmail({ to: owner?.email ?? "", childName: game.childProfile.displayName, playLink: link.url, libraryLink, sceneCount: game.scenes.length, locale });
    // A game with nobody to send it to is a game nobody will open. Until every
    // path into a paid game guarantees an address, an operator's inbox takes
    // it, stamped — and the game stays READY, because the parent does not have it.
    const routed = routeMail(mail, c.emailFallbackTo);
    if (!routed) {
      console.error(`[publish] ${gameId} is ready but has no recipient email (set EMAIL_FALLBACK_TO to catch these)`);
      await audit(c, actor, "email:no-recipient", "Game", gameId);
      c.analytics.track("delivery_email_failed", { gameId });
      return { outcome: "no-recipient", simulated };
    }
    if (routed.viaFallback) {
      console.warn(`[email:fallback] ${gameId}: no owner email — delivered to the fallback inbox instead`);
      await c.email.send(routed.message);
      await audit(c, actor, "email:fallback", "Game", gameId);
      c.analytics.track("delivery_email_fallback", { gameId });
      return { outcome: "fallback", simulated };
    }
    await c.email.send(routed.message);
    if (statusOf(game) === "READY") await transitionGame(c, gameId, "DELIVERED", actor);
    return { outcome: "sent", simulated };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[publish] ${gameId} is ready but the email did not go out:`, message);
    await audit(c, actor, "email:failed", "Game", gameId, { error: message.slice(0, 200) });
    c.analytics.track("delivery_email_failed", { gameId });
    return { outcome: "failed", simulated };
  }
}

/**
 * The parent's "email me the link" button. Sends the same mail again — never
 * a new game, never a new link — and no more than once a minute per game.
 */
export async function resendGameMail(c: Container, gameId: string, actor: Actor): Promise<{ ok: true; outcome: "sent" | "fallback" | "no-recipient" | "failed"; simulated: boolean } | { ok: false; code: "NOT_READY" | "WAIT" }> {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } });
  if (!isPlayable(statusOf(game))) return { ok: false, code: "NOT_READY" };
  const recent = await c.db.auditLog.findFirst({ where: { action: "email:resent", entityType: "Game", entityId: gameId, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent) return { ok: false, code: "WAIT" };
  await audit(c, actor, "email:resent", "Game", gameId);
  const result = await deliverGameMail(c, gameId, actor);
  return { ok: true, ...result };
}

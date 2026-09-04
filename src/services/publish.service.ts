import type { Container } from "./container";
import { statusOf, transitionGame } from "./game-status";
import { ensurePlayerLink } from "./share-link.service";
import { createMagicLink } from "./auth.service";
import { gameReadyEmail } from "./email/templates";
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
  if (current === "READY" && game.owner && game.childProfile) {
    // The game is already playable at this point: the link works and the parent
    // can open it from their library. So a mail server having a bad afternoon
    // must not throw out of here — that turned a finished game into a FAILED job
    // and put an email error in front of the parent as if generation had broken.
    // It stays READY rather than DELIVERED, which is exactly what happened.
    try {
      const libraryLink = await createMagicLink(c, game.owner.id, `/library/${gameId}`);
      const locale = game.locale === "he" ? "he" : "en";
      await c.email.send(gameReadyEmail({ to: game.owner.email, childName: game.childProfile.displayName, playLink: link.url, libraryLink, sceneCount: game.scenes.length, locale }));
      await transitionGame(c, gameId, "DELIVERED", actor);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[publish] ${gameId} is ready but the email did not go out:`, message);
      await audit(c, actor, "email:failed", "Game", gameId, { error: message.slice(0, 200) });
      c.analytics.track("delivery_email_failed", { gameId });
    }
  }
  return { playUrl: link.url };
}

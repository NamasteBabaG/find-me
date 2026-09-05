import { NextResponse } from "next/server";
import { getContainer } from "@/services/container";
import { creationStep, isPlayable } from "@/domain/order-state";
import { creationProgress } from "@/domain/creation-progress";
import { statusOf } from "@/services/game-status";
import { RESUMABLE_STATUSES } from "@/services/generation/pipeline";
import { ensurePlayerLink } from "@/services/share-link.service";
import { signedAssetUrl } from "@/services/asset.service";
import { findScene } from "../../../../../../content/scenes";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { pick } from "@/i18n";

export const runtime = "nodejs";

const PAINTED = new Set(["GENERATED", "APPROVED"]);

/**
 * Polled by /creating. Visible to the draft owner (cookie), the account owner, or an admin.
 *
 * Carries the pipeline's own bookkeeping — the character, the count of painted
 * hiding spots, the board being painted now — so the page can show a real
 * percentage instead of a spinner that moves three times in twenty minutes.
 * The avatar is a GAME asset (the illustrated sticker, never the photograph),
 * so a signed URL for it is safe to hand out.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await ctx.params;
  const c = getContainer();
  const [game, user, draftToken] = await Promise.all([
    c.db.game.findUnique({
      where: { id: gameId },
      include: { childProfile: { select: { avatarAssetId: true } }, scenes: { orderBy: { orderIndex: "asc" }, include: { targets: { select: { status: true } } } } },
    }),
    currentUser(),
    draftTokenFromCookie(),
  ]);
  if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const status = statusOf(game);
  const step = creationStep(status);
  const locale = game.locale === "he" ? "he" : "en";

  // The character: the sticker cut from the identity sheet. A stale id (a
  // purged asset after a new photo) must not put a broken picture on the page.
  const avatarId = game.childProfile?.avatarAssetId ?? null;
  const avatar = avatarId ? await c.db.asset.findUnique({ where: { id: avatarId }, select: { status: true } }) : null;
  const characterReady = avatar?.status === "READY";
  const avatarUrl = characterReady && avatarId ? signedAssetUrl(c, avatarId) : null;

  // Hiding spots: the catalog says how many there are, the rows say how many landed.
  let spotsTotal = 0;
  let spotsDone = 0;
  let place: { slug: string; name: string } | null = null;
  for (const gs of game.scenes) {
    const def = findScene(gs.sceneSlug);
    const total = def?.targets.length ?? 0;
    const done = gs.targets.filter((t) => PAINTED.has(t.status)).length;
    spotsTotal += total;
    spotsDone += Math.min(done, total);
    if (!place && def && done < total) place = { slug: def.slug, name: pick(def.name, locale) };
  }

  const progress = creationProgress({ status, characterReady, spotsDone, spotsTotal });
  const playUrl = isPlayable(status) ? (await ensurePlayerLink(c, gameId)).url : null;
  return NextResponse.json(
    {
      status,
      ...step,
      ...progress,
      playUrl,
      awaitingQa: status === "QA_PENDING" || status === "MANUAL_REVIEW",
      pending: RESUMABLE_STATUSES.includes(status),
      // "Ready" and "sent" are different facts: DELIVERED means a real recipient
      // got the mail. On a box whose mail provider is the console, nothing was.
      delivered: status === "DELIVERED",
      mailSimulated: c.email.id === "console",
      newPhotoUrl: progress.state === "needs_new_photo" ? `/creating/${gameId}/photo` : null,
      characterReady,
      avatarUrl,
      spotsDone,
      spotsTotal,
      place: progress.current === "hiding" ? place : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

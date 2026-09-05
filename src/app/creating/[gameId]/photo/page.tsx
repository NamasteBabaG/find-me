import { notFound, redirect } from "next/navigation";
import { getContainer } from "@/services/container";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { statusOf } from "@/services/game-status";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { SiteHeader } from "@/ui/Shell";
import { PhotoUploader } from "@/app/create/photo/PhotoUploader";

export const metadata = { robots: { index: false } };

/** QA asked for a different photo. Same uploader as the create flow, posting to the paid game. */
export default async function NewPhotoPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const c = getContainer();
  const [game, user, draftToken, { t }] = await Promise.all([c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } }), currentUser(), draftTokenFromCookie(), getI18n()]);
  if (!game || !game.childProfile) notFound();
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) notFound();
  if (statusOf(game) !== "NEEDS_NEW_PHOTO") redirect(`/creating/${gameId}`);
  const name = game.childProfile.displayName;
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="fm-container fm-container--narrow fm-section create">
        <div className="create__head">
          <h1 className="create__title">{tf(t.create.photo.title, { name })}</h1>
          <p className="fm-lead">{tf(t.create.creating.needsNewPhoto, { name })}</p>
        </div>
        <PhotoUploader childName={name} hasPhoto={false} rejectedCode={null} endpoint={`/api/games/${gameId}/photo`} nextHref={`/creating/${gameId}`} />
      </main>
    </>
  );
}

import { notFound } from "next/navigation";
import { getContainer } from "@/services/container";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { tf } from "@/i18n";
import { SiteHeader } from "@/ui/Shell";
import { CreatingStatus } from "./CreatingStatus";

export const metadata = { robots: { index: false } };

export default async function CreatingPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const c = getContainer();
  const [game, user, draftToken, { t }] = await Promise.all([c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } }), currentUser(), draftTokenFromCookie(), getI18n()]);
  if (!game) notFound();
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) notFound();
  const name = game.childProfile?.displayName ?? "";
  const cr = t.create.creating;
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
        <div className="create__head">
          <h1 className="create__title">{tf(cr.title, { name })}</h1>
          <p className="fm-lead">{cr.lead}</p>
        </div>
        <CreatingStatus gameId={gameId} childName={name} isAdmin={isAdminEmail(user?.email)} />
      </main>
    </>
  );
}

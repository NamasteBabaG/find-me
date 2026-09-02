import { notFound } from "next/navigation";
import { getContainer } from "@/services/container";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { SiteHeader } from "@/ui/Shell";
import { CreatingStatus } from "./CreatingStatus";

export const metadata = { title: "יוצרים את המשחק", robots: { index: false } };

export default async function CreatingPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const c = getContainer();
  const [game, user, draftToken] = await Promise.all([c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true } }), currentUser(), draftTokenFromCookie()]);
  if (!game) notFound();
  const allowed = (draftToken && game.draftToken === draftToken) || (user && game.ownerId === user.id) || isAdminEmail(user?.email);
  if (!allowed) notFound();
  const name = game.childProfile?.displayName ?? "הילד";
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
        <div className="create__head">
          <h1 className="create__title">יוצרים את המשחק של {name}</h1>
          <p className="fm-lead">אפשר לסגור את החלון. נשלח מייל כשהמשחק יהיה מוכן.</p>
        </div>
        <CreatingStatus gameId={gameId} childName={name} isAdmin={isAdminEmail(user?.email)} />
      </main>
    </>
  );
}

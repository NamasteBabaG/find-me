import { canManageGameCreation } from "@/domain/game/access";
import { notFound } from "next/navigation";
import { getContainer } from "@/services/container";
import { currentUser, draftTokenFromCookie, isAdminEmail } from "@/lib/server/session";
import { SiteHeader } from "@/ui/Shell";
import { CreatingStatus } from "./CreatingStatus";
import { GameConfigSchema } from "@/domain/game/config";

export const metadata = { robots: { index: false } };

export default async function CreatingPage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const c = getContainer();
  const [game, user, draftToken] = await Promise.all([c.db.game.findUnique({ where: { id: gameId }, include: { childProfile: true, owner: { select: { email: true } } } }), currentUser(), draftTokenFromCookie()]);
  if (!game) notFound();
  const allowed = canManageGameCreation(game, draftToken, user?.id ?? null, isAdminEmail(user?.email));
  if (!allowed) notFound();
  let name = game.childProfile?.displayName ?? "";
  if (!name && game.configJson) {
    try {
      // Older delivered games can retain their child in the published config
      // without a linked profile. Keep the ready heading personal for them too.
      name = GameConfigSchema.parse(JSON.parse(game.configJson)).child.name;
    } catch { /* An unfinished config is not a source of display data. */ }
  }
  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user?.email)} />
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
        {/* The review link shows for an admin session, and for a game an admin owns: on a QA box the tester who paid is the person who approves, and was reading "a person checks" about themselves. */}
        <CreatingStatus gameId={gameId} childName={name} isAdmin={isAdminEmail(user?.email) || isAdminEmail(game.owner?.email)} />
      </main>
    </>
  );
}

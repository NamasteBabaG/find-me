import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getContainer } from "@/services/container";
import { getOwnedGame } from "@/services/game.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { SiteFooter, SiteHeader, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { ManageGame } from "./ManageGame";

export const metadata = { title: "ניהול המשחק", robots: { index: false } };

export default async function ManageGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/library");
  const { gameId } = await params;
  const owned = await getOwnedGame(getContainer(), gameId, user.id);
  if (!owned) notFound();
  const { game, playable, playUrl, gift, status } = owned;
  const name = game.childProfile?.displayName ?? "";

  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user.email)} />
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
        <Link href="/library" className="fm-small">
          ➜ כל המשחקים
        </Link>
        <div className="fm-row">
          {game.childProfile?.avatarAssetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${game.childProfile.avatarAssetId}`} alt="" className="fm-sticker" width={80} height={80} style={{ width: 80, height: 80 }} />
          ) : null}
          <div>
            <h1>איפה {name}?</h1>
            <p className="fm-muted">{game.scenes.length} עולמות · נוצר ב־{game.createdAt.toLocaleDateString("he-IL")}</p>
          </div>
        </div>

        {playable && playUrl ? (
          <div className="fm-row">
            <LinkButton href={playUrl} size="lg">
              שחקו עכשיו
            </LinkButton>
          </div>
        ) : (
          <Notice kind="info">
            המשחק עדיין לא מוכן ({status}). <Link href={`/creating/${game.id}`}>לצפייה בהתקדמות</Link>
          </Notice>
        )}

        <ManageGame gameId={game.id} playUrl={playUrl} gift={gift} childName={name} />
      </main>
      <SiteFooter />
    </>
  );
}

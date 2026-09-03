import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getContainer } from "@/services/container";
import { getOwnedGame } from "@/services/game.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { formatDate, tf } from "@/i18n";
import { SiteFooter, SiteHeader, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { ManageGame } from "./ManageGame";

export const metadata = { robots: { index: false } };

export default async function ManageGamePage({ params }: { params: Promise<{ gameId: string }> }) {
  const [user, { t, locale }] = await Promise.all([currentUser(), getI18n()]);
  if (!user) redirect("/library");
  const { gameId } = await params;
  const owned = await getOwnedGame(getContainer(), gameId, user.id);
  if (!owned) notFound();
  const { game, playable, playUrl, gift, status } = owned;
  const name = game.childProfile?.displayName ?? "";
  const l = t.library;

  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user.email)} />
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
        <Link href="/library" className="fm-small">
          <span className="fm-btn__arrow fm-btn__arrow--back" aria-hidden>
            ➜
          </span>{" "}
          {l.allGames}
        </Link>
        <div className="fm-row">
          {game.childProfile?.avatarAssetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/assets/${game.childProfile.avatarAssetId}`} alt="" className="fm-sticker" width={80} height={80} style={{ width: 80, height: 80 }} />
          ) : null}
          <div>
            <h1>{game.title}</h1>
            <p className="fm-muted">{tf(l.gameMeta, { worlds: game.scenes.length, date: formatDate(game.createdAt, locale) })}</p>
          </div>
        </div>

        {playable && playUrl ? (
          <div className="fm-row">
            <LinkButton href={playUrl} size="lg">
              {l.playNow}
            </LinkButton>
          </div>
        ) : (
          <Notice kind="info">
            {tf(l.notReady, { status: l.statuses[status] ?? status })} <Link href={`/creating/${game.id}`}>{l.viewProgress}</Link>
          </Notice>
        )}

        <ManageGame gameId={game.id} playUrl={playUrl} gift={gift} childName={name} />
      </main>
      <SiteFooter />
    </>
  );
}

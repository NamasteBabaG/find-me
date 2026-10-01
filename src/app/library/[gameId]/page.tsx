import { gameShape } from "@/services/world-catalog.service";
import { gameShapeLabel } from "@/i18n/game-shape";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getContainer } from "@/services/container";
import { getOwnedGame } from "@/services/game.service";
import { signedAssetUrl } from "@/services/asset.service";
import { currentUser, isAdminEmail } from "@/lib/server/session";
import { getI18n } from "@/i18n/server";
import { formatDate, tf } from "@/i18n";
import { SiteFooter, SiteHeader, Notice } from "@/ui/Shell";
import { LinkButton } from "@/ui/Button";
import { ManageGame } from "./ManageGame";
import "../../family/family.css";

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
  // A family game is managed from its child's page, so that is where "back" goes, and it is played the way that
  // page plays it. Older games without a child go back to the family area.
  const child = game.familyChildId ? await getContainer().db.familyChild.findFirst({ where: { id: game.familyChildId, ownerId: user.id, deletedAt: null }, select: { id: true, displayName: true } }) : null;
  const back = child ? { href: `/family/${child.id}`, label: tf(t.family.open, { name: child.displayName }) } : { href: "/family", label: l.allGames };
  const play = child && playable ? `/family/${child.id}/play/${game.id}` : playUrl;

  return (
    <>
      <SiteHeader user={user} isAdmin={isAdminEmail(user.email)} />
      <main className="fm-container fm-container--narrow fm-section fm-stack fm-stack--4">
        <Link href={back.href} className="family-back">
          <span className="fm-btn__arrow fm-btn__arrow--back" aria-hidden>
            ➜
          </span>{" "}
          {back.label}
        </Link>
        <div className="fm-row">
          {game.childProfile?.avatarAssetId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signedAssetUrl(getContainer(), game.childProfile.avatarAssetId)} alt="" className="fm-sticker" width={80} height={80} style={{ width: 80, height: 80 }} />
          ) : null}
          <div>
            <h1>{game.title}</h1>
            <p className="fm-muted">{tf(l.gameMeta, { shape: gameShapeLabel(t, gameShape(game.scenes)), date: formatDate(game.createdAt, locale) })}</p>
          </div>
        </div>

        {playable && play ? (
          <div className="fm-row">
            <LinkButton href={play} size="lg">
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

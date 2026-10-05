import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { familySignInHref } from "@/lib/safe-redirect";
import { getContainer } from "@/services/container";
import { gameWorlds, parseGameConfig } from "@/domain/game/config";
import { withFreshAssetUrls } from "@/services/asset.service";
import { albumSeed } from "@/services/adventure-album.service";
import { GameShell } from "@/game/components/GameShell";

export const metadata = { robots: { index: false, follow: false } };
export default async function FamilyPlay({ params, searchParams }: { params: Promise<{ childId: string; gameId: string }>; searchParams: Promise<{ board?: string; world?: string }> }) {
  await requireQaAccess();
  const [user, { childId, gameId }, query] = await Promise.all([currentUser(), params, searchParams]);
  if (!user) {
    const context = new URLSearchParams();
    if (typeof query.board === "string") context.set("board", query.board);
    if (typeof query.world === "string") context.set("world", query.world);
    redirect(familySignInHref(`/family/${encodeURIComponent(childId)}/play/${encodeURIComponent(gameId)}${context.size ? `?${context}` : ""}`));
  }
  const c = getContainer();
  const game = await c.db.game.findFirst({ where: { id: gameId, familyChildId: childId, ownerId: user.id, deletedAt: null, status: { in: ["READY", "DELIVERED"] }, familyChild: { ownerId: user.id, deletedAt: null }, orders: { some: { userId: user.id, paymentStatus: "PAID" } } }, include: { adventureAlbum: { select: { snapshotJson: true } } } });
  if (!game?.configJson) notFound();
  const config = withFreshAssetUrls(c, parseGameConfig(game.configJson));
  // The account's album comes with the page, so the map opens with the child where they really are.
  return <GameShell key={game.id} config={config} albumOwner skipGift initialWorld={gameWorlds(config).some(world => world.slug === query.world) ? query.world : undefined} initialAlbum={albumSeed(config, game.adventureAlbum?.snapshotJson)} autoStartScene={config.scenes.some(s => s.slug === query.board) ? query.board : undefined} parentZoneHref={`/family/${childId}`} />;
}

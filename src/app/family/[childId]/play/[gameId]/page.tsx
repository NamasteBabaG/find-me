import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/server/session";
import { requireQaAccess } from "@/lib/server/qa-access";
import { getContainer } from "@/services/container";
import { parseGameConfig } from "@/domain/game/config";
import { withFreshAssetUrls } from "@/services/asset.service";
import { GameShell } from "@/game/components/GameShell";

export const metadata = { robots: { index: false, follow: false } };
export default async function FamilyPlay({ params, searchParams }: { params: Promise<{ childId: string; gameId: string }>; searchParams: Promise<{ board?: string }> }) {
  await requireQaAccess();
  const [user, { childId, gameId }, query] = await Promise.all([currentUser(), params, searchParams]);
  if (!user) redirect("/family");
  const c = getContainer();
  const game = await c.db.game.findFirst({ where: { id: gameId, familyChildId: childId, ownerId: user.id, deletedAt: null, status: { in: ["READY", "DELIVERED"] }, familyChild: { ownerId: user.id, deletedAt: null }, orders: { some: { userId: user.id, paymentStatus: "PAID" } } } });
  if (!game?.configJson) notFound();
  const config = withFreshAssetUrls(c, parseGameConfig(game.configJson));
  return <GameShell config={config} albumOwner skipGift autoStartScene={config.scenes.some(s => s.slug === query.board) ? query.board : undefined} parentZoneHref={`/family/${childId}`} />;
}

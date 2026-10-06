import { isEditableDraft } from "@/domain/order-state";
import { draftBelongsTo } from "@/domain/game/access";
import { getContainer } from "@/services/container";
import { statusOf } from "@/services/game-status";
import { requireQaAccess } from "./qa-access";
import { currentUser, draftTokenFromCookie } from "./session";

/** Server-render/action helper, deliberately not a public server action. */
export async function currentDraft(explicitGameId?: string) {
  await requireQaAccess();
  const c = getContainer();
  const token = await draftTokenFromCookie();
  if (!token && !explicitGameId) return null;
  const [game, user] = await Promise.all([
    c.db.game.findUnique({ where: explicitGameId ? { id: explicitGameId } : { draftToken: token! }, include: { childProfile: true, scenes: { orderBy: { orderIndex: "asc" } } } }),
    currentUser(),
  ]);
  if (!game || !isEditableDraft(statusOf(game))) return null;
  // Explicit continuation links require the signed-in passport owner and its
  // active purchase intent, even when this browser has the matching cookie.
  if (game.deletedAt || explicitGameId && (!user || game.ownerId !== user.id || !await c.db.childWorldPurchase.findFirst({ where: { activeGameId: game.id, ownerId: user.id, familyChildId: game.familyChildId ?? "" } }))) return null;
  if (!draftBelongsTo(game, token, user?.id ?? null)) return null;
  return game;
}

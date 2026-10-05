import { allWorlds } from "../../content/worlds";
import { findScene } from "../../content/scenes";
import { gameWorlds, parseGameConfig } from "@/domain/game/config";
import { INTEGRATED_COLLECTION_VERSION } from "@/domain/scene/local-patch-versions";
import { boardSlugs } from "@/domain/world";
import { pick } from "@/i18n/config";
import { familyWorldPlayHref, familyWorldPurchaseHref, selectFamilyWorldCards, type FamilyWorldCard, type FamilyWorlds } from "@/domain/family-worlds";
import type { Container } from "./container";
import { familyAdventures } from "./family-adventures.service";
import { reconcilePaidFamilyChildren } from "./family.service";
import { purchasableWorlds } from "./world-catalog.service";

export class FamilyWorldAccessError extends Error {}

/** The current owner's paid game is the only entry point. No childId supplied
 * by a browser and no bearer link can broaden it to another child's worlds. */
export async function ownerFamilyWorlds(c: Container, ownerId: string, gameId: string, currentWorldSlug?: string): Promise<FamilyWorlds> {
  if (!ownerId) throw new FamilyWorldAccessError();
  const fence = { id: gameId, ownerId, deletedAt: null, status: { in: ["READY", "DELIVERED"] }, orders: { some: { userId: ownerId, paymentStatus: "PAID", refundedAt: null } } };
  const entry = await c.db.game.findFirst({ where: fence, select: { familyChildId: true } });
  if (!entry) throw new FamilyWorldAccessError();
  // Existing pre-passport purchases already use this owner-fenced reconciliation.
  if (!entry.familyChildId) await reconcilePaidFamilyChildren(c.db, ownerId, gameId);
  const current = await c.db.game.findFirst({ where: { ...fence, familyChild: { ownerId, deletedAt: null } }, select: { familyChildId: true, locale: true } });
  if (!current?.familyChildId) throw new FamilyWorldAccessError();
  const childId = current.familyChildId;
  const [children, games, sellable] = await Promise.all([
    familyAdventures(c, ownerId, childId),
    c.db.game.findMany({ where: { ownerId, familyChildId: childId, deletedAt: null, familyChild: { ownerId, deletedAt: null },
      status: { notIn: ["CANCELLED", "REFUNDED", "DELETED"] },
      orders: { some: { userId: ownerId, paymentStatus: { in: ["PAID", "PENDING"] }, refundedAt: null } } },
      select: { id: true, configJson: true, updatedAt: true, scenes: { select: { sceneSlug: true } },
        orders: { where: { userId: ownerId, paymentStatus: { in: ["PAID", "PENDING"] }, refundedAt: null }, select: { paymentStatus: true } } } }),
    purchasableWorlds(c, INTEGRATED_COLLECTION_VERSION),
  ]);
  const child = children.find(row => row.id === childId);
  if (!child || !games.some(game => game.id === gameId && game.orders.some(order => order.paymentStatus === "PAID"))) throw new FamilyWorldAccessError();
  const locale = current.locale === "he" ? "he" : "en";
  const available = new Set(sellable.map(world => world.slug));
  const definitions = allWorlds();
  const summaries = new Map(child.adventures.map(adventure => [adventure.gameId, adventure]));
  const cards: (FamilyWorldCard & { order: number; updatedAt: number })[] = [];
  for (const game of games) {
    const summary = summaries.get(game.id);
    const paid = game.orders.some(order => order.paymentStatus === "PAID");
    const held = new Set(game.scenes.map(scene => scene.sceneSlug));
    let slugs = definitions.filter(world => boardSlugs(world).every(slug => held.has(slug))).map(world => world.slug);
    // Frozen playable maps remain navigable even if their catalog is retired.
    if (summary?.ready && game.configJson) {
      try { slugs = gameWorlds(parseGameConfig(game.configJson)).map(world => world.slug); } catch { /* family summary already rejects invalid configs */ }
    }
    const selectedSlug = currentWorldSlug && slugs.includes(currentWorldSlug) ? currentWorldSlug : slugs[0];
    for (const slug of slugs) {
      const world = definitions.find(row => row.slug === slug);
      const progress = summary?.worlds.find(row => row.slug === slug);
      if (!world && !progress) continue;
      const ready = paid && summary?.ready === true && Boolean(progress);
      const status = ready ? "ready" : !paid ? "payment_pending" : summary?.preparation && ["preparing", "repairing", "delayed"].includes(summary.preparation) ? "preparing" : "attention";
      const places = progress?.places ?? world?.nodes.length ?? 9;
      cards.push({ worldSlug: slug, name: world ? pick(world.name, locale) : progress!.name,
        tagline: world ? pick(world.tagline, locale) : "", icon: world?.completion.icon ?? "🌍",
        gameId: game.id, status, current: game.id === gameId && selectedSlug === slug,
        completedPlaces: ready && summary?.tracked ? progress!.stamped : null, totalPlaces: places,
        foundTargets: ready && summary?.tracked ? progress!.stars : null, totalTargets: progress?.starsTotal ?? places * 3,
        playHref: ready ? familyWorldPlayHref(childId, game.id, slug) : null,
        purchaseHref: ready ? null : familyWorldPurchaseHref(childId, slug, gameId),
        updatedAt: game.updatedAt.getTime(), order: world?.order ?? definitions.length + 1 });
    }
  }
  // Offer only worlds with an approved current-engine contract. Operationally
  // disabled worlds stay visible as unavailable; planned world three stays out.
  for (const world of definitions.filter(world => world.active && boardSlugs(world).every(slug => findScene(slug, INTEGRATED_COLLECTION_VERSION)?.active))) {
    const canBuy = available.has(world.slug);
    cards.push({ worldSlug: world.slug, name: pick(world.name, locale), tagline: pick(world.tagline, locale), icon: world.completion.icon,
      gameId: null, status: canBuy ? "available" : "unavailable", current: false,
      completedPlaces: null, totalPlaces: world.nodes.length, foundTargets: null, totalTargets: world.nodes.length * 3,
      playHref: null, purchaseHref: canBuy ? familyWorldPurchaseHref(childId, world.slug, gameId) : null,
      order: world.order, updatedAt: 0 });
  }
  return { childId, currentGameId: gameId, worlds: selectFamilyWorldCards(cards) };
}

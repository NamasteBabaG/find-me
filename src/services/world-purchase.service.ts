import { Prisma } from "@prisma/client";
import { pinVisualReviewRelease } from "./generation/visual-review-release";
import { createHash } from "node:crypto";
import { validChildAge } from "@/domain/child-appearance";
import { boardSlugs } from "@/domain/world";
import { worldPurchaseState, worldPurchaseReturnHref } from "@/domain/world-purchase";
import { newDraftToken, newId } from "@/lib/ids";
import { flowError, type FlowError } from "@/i18n/errors";
import type { Locale } from "@/i18n/config";
import type { Container } from "./container";
import { newDraftStyleVersion, sceneVersionForDraft, worldsForDraft } from "./create-flow.service";
import { sceneBySlug } from "./scene-catalog.service";
import { childHasPaidWorld } from "./child-pricing.service";
import { outstandingCheckout } from "./draft-checkout-lock";
import { purchasingClosed, purchasingEnabled } from "@/lib/purchasing";

const selection = { childProfile: true, orders: true, scenes: { orderBy: { orderIndex: "asc" as const } } };
function paidForOwner(orders: readonly { userId: string; paymentStatus: string; refundedAt: Date | null }[], ownerId: string) {
  return orders.some(o => o.userId === ownerId && o.paymentStatus === "PAID" && !o.refundedAt);
}
function selectionMatches(scenes: readonly { sceneSlug: string }[], boards: readonly string[]) {
  return boards.every(slug => scenes.some(s => s.sceneSlug === slug));
}
function isSingleWorldDraft(game: { packageTier: string | null; scenes: readonly { sceneSlug: string }[] }, boards: readonly string[]) {
  return game.packageTier === "ONE_WORLD" && game.scenes.length === boards.length && selectionMatches(game.scenes, boards);
}
export type WorldPurchaseInput = { ownerId: string; familyChildId: string; worldSlug: string; returnGameId?: string | null };

/** Read-only parent context. Every URL is constructed after ownership validation. */
export async function worldPurchaseContext(c: Container, input: WorldPurchaseInput) {
  const child = await c.db.familyChild.findFirst({ where: { id: input.familyChildId, ownerId: input.ownerId, deletedAt: null } });
  if (!child) return null;
  const world = (await worldsForDraft(c)).find(w => w.slug === input.worldSlug);
  if (!world) return null;
  const games = await c.db.game.findMany({ where: { ownerId: input.ownerId, familyChildId: child.id, deletedAt: null }, include: selection, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  const returnGameId = input.returnGameId && games.some(g => g.id === input.returnGameId) ? input.returnGameId : null;
  const owned = games.find(g => selectionMatches(g.scenes, boardSlugs(world)) && paidForOwner(g.orders, input.ownerId) && !["REFUNDED", "CANCELLED", "DELETED"].includes(g.status));
  const intent = await c.db.childWorldPurchase.findUnique({ where: { familyChildId_worldSlug: { familyChildId: child.id, worldSlug: world.slug } }, include: { activeGame: { include: selection } } });
  const pending = intent?.ownerId === input.ownerId && intent.activeGame?.ownerId === input.ownerId && intent.activeGame.familyChildId === child.id
    && isSingleWorldDraft(intent.activeGame, boardSlugs(world)) ? intent.activeGame : null;
  const ordinaryDraft = games.find(g => isSingleWorldDraft(g, boardSlugs(world)) && ["photo", "checkout"].includes(worldPurchaseState({ ...g, hasPhoto: Boolean(g.childProfile?.originalPhotoAssetId), paid: paidForOwner(g.orders, input.ownerId) })));
  const active = owned ?? pending ?? ordinaryDraft;
  const state = active ? worldPurchaseState({ ...active, hasPhoto: Boolean(active.childProfile?.originalPhotoAssetId), paid: paidForOwner(active.orders, input.ownerId) }) : "new";
  const ageYears = active?.childProfile?.ageYears ?? games.find(g => g.childProfile && validChildAge(g.childProfile.ageYears))?.childProfile?.ageYears ?? null;
  // Deleted/closed art does not prove its old hosted payment page is closed.
  // This financial-only lookup never reads the historical profile or assets.
  const financialGames = await c.db.game.findMany({ where: { ownerId: input.ownerId, familyChildId: child.id, ...(active ? { id: { not: active.id } } : {}) },
    select: { id: true, orders: { where: { userId: input.ownerId, paymentStatus: { in: ["PENDING", "FAILED", "CANCELLED"] } },
      select: { paymentStatus: true, checkoutUrl: true, checkoutClaimUntil: true, providerPaymentId: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const earlierPayment = financialGames.find(g => g.orders.some(outstandingCheckout));
  return { child, world, active: state === "closed" ? null : active, state: state === "closed" ? "new" as const : state,
    ageYears, continuation: await childHasPaidWorld(c.db, { ownerId: input.ownerId, familyChildId: child.id }),
    returnGameId, returnHref: worldPurchaseReturnHref(child.id, returnGameId),
    earlierPaymentHref: earlierPayment ? `/checkout/close?game=${encodeURIComponent(earlierPayment.id)}` : null };
}

export type WorldPurchaseResult = { ok: true; gameId: string; href: string; draftToken: string | null; reused: boolean } | FlowError;

/** No provider or generation work: one parent confirmation creates one unpaid draft. */
export async function beginWorldPurchase(c: Container, input: WorldPurchaseInput & { ageYears: number; locale: Locale }): Promise<WorldPurchaseResult> {
  if (!purchasingEnabled()) return purchasingClosed();
  if (!validChildAge(input.ageYears)) return flowError("INVALID_CHILD_AGE", "בחרו גיל בין 2 ל־10.");
  const styleVersion = newDraftStyleVersion(), version = sceneVersionForDraft(styleVersion);
  const world = (await worldsForDraft(c, styleVersion)).find(w => w.slug === input.worldSlug);
  if (!world) return flowError("SCENE_UNAVAILABLE", "העולם אינו זמין.");
  const boards = boardSlugs(world);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await c.db.$transaction(async tx => {
        const child = await tx.familyChild.findFirst({ where: { id: input.familyChildId, ownerId: input.ownerId, deletedAt: null } });
        if (!child) return flowError("DRAFT_NOT_FOUND", "הילד לא נמצא.");
        // Serialize all starts/checkouts for this child, including different tabs.
        const locked = await tx.familyChild.updateMany({ where: { id: child.id, ownerId: input.ownerId, deletedAt: null, displayName: child.displayName }, data: { displayName: child.displayName } });
        if (locked.count !== 1) return flowError("DRAFT_LOCKED", "הילד השתנה.");
        const games = await tx.game.findMany({ where: { ownerId: input.ownerId, familyChildId: child.id, deletedAt: null }, include: selection, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        const owned = games.find(g => selectionMatches(g.scenes, boards) && paidForOwner(g.orders, input.ownerId) && !["REFUNDED", "CANCELLED", "DELETED"].includes(g.status));
        const existing = await tx.childWorldPurchase.findUnique({ where: { familyChildId_worldSlug: { familyChildId: child.id, worldSlug: world.slug } }, include: { activeGame: { include: selection } } });
        if (existing && existing.ownerId !== input.ownerId) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
        const ordinaryDraft = games.find(g => isSingleWorldDraft(g, boards) && ["photo", "checkout"].includes(worldPurchaseState({ ...g, hasPhoto: Boolean(g.childProfile?.originalPhotoAssetId), paid: paidForOwner(g.orders, input.ownerId) })));
        const active = owned ?? (existing?.ownerId === input.ownerId && existing.activeGame && isSingleWorldDraft(existing.activeGame, boards) ? existing.activeGame : null) ?? ordinaryDraft;
        if (active && active.ownerId === input.ownerId && active.familyChildId === child.id && selectionMatches(active.scenes, boards)) {
          const state = worldPurchaseState({ ...active, hasPhoto: Boolean(active.childProfile?.originalPhotoAssetId), paid: paidForOwner(active.orders, input.ownerId) });
          // A closed game's outstanding PSP session may still accept money.
          // Never replace it with a second payable game while that is uncertain.
          if (state === "closed" && active.orders.some(outstandingCheckout)) return flowError("DRAFT_LOCKED", "יש תשלום קודם שעדיין לא נסגר.");
          if (state !== "closed") {
            if (!owned) await tx.childWorldPurchase.upsert({ where: { familyChildId_worldSlug: { familyChildId: child.id, worldSlug: world.slug } },
              create: { id: `wpr_${createHash("sha256").update(JSON.stringify([child.id, world.slug])).digest("hex").slice(0, 32)}`, ownerId: input.ownerId, familyChildId: child.id, worldSlug: world.slug, activeGameId: active.id,
                returnGameId: input.returnGameId && games.some(g => g.id === input.returnGameId) ? input.returnGameId : null }, update: { activeGameId: active.id } });
            return { ok: true as const, gameId: active.id, draftToken: state === "photo" || state === "checkout" ? active.draftToken : null, reused: true,
            href: state === "ready" ? `/family/${encodeURIComponent(child.id)}/play/${encodeURIComponent(active.id)}` : state === "photo" ? `/create/photo?game=${encodeURIComponent(active.id)}` : state === "checkout" ? `/checkout?game=${encodeURIComponent(active.id)}` : `/creating/${encodeURIComponent(active.id)}` };
          }
        }
        const returnGameId = input.returnGameId && games.some(g => g.id === input.returnGameId) ? input.returnGameId : null;
        const gameId = newId("game"), childId = newId("chl"), draftToken = newDraftToken();
        // Fresh rendering profile protects every historical game's frozen age/photo.
        await tx.childProfile.create({ data: { id: childId, ownerId: input.ownerId, displayName: child.displayName, ageYears: input.ageYears } });
        await tx.game.create({ data: { id: gameId, ownerId: input.ownerId, familyChildId: child.id, childProfileId: childId,
          draftToken, status: "DRAFT", locale: input.locale, ...(styleVersion ? { styleVersion } : {}), packageTier: "ONE_WORLD", sceneCount: boards.length,
          title: input.locale === "he" ? `איפה ${child.displayName}?` : `Where's ${child.displayName}?` } });
        if (styleVersion === "local-patch-world-v1" && c.pinDualVisualReview) {
          if (!c.visualReview) throw Error("Dual visual review credentials are not configured");
          await pinVisualReviewRelease(tx, gameId);
        }
        await tx.gameScene.createMany({ data: boards.map((slug, orderIndex) => ({ id: newId("gsc"), gameId, sceneSlug: slug, sceneVersion: sceneBySlug(slug, version).version, orderIndex })) });
        await tx.childWorldPurchase.upsert({ where: { familyChildId_worldSlug: { familyChildId: child.id, worldSlug: world.slug } },
          create: { id: `wpr_${createHash("sha256").update(JSON.stringify([child.id, world.slug])).digest("hex").slice(0, 32)}`, ownerId: input.ownerId, familyChildId: child.id, worldSlug: world.slug, activeGameId: gameId, returnGameId },
          update: { activeGameId: gameId, returnGameId } });
        return { ok: true as const, gameId, draftToken, reused: false, href: `/create/photo?game=${encodeURIComponent(gameId)}` };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P1008"].includes(error.code)) {
        if (attempt < 2) continue;
        return flowError("DRAFT_LOCKED", "הטיוטה משתנה. נסו שוב.");
      }
      throw error;
    }
  }
  return flowError("DRAFT_LOCKED", "הטיוטה משתנה.");
}

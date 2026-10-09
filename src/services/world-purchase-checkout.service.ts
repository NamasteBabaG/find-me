import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { worldsOwned } from "./world-catalog.service";
import { boardSlugs } from "@/domain/world";
import { worldPurchaseState } from "@/domain/world-purchase";
import { newId } from "@/lib/ids";
import { flowError, type FlowError } from "@/i18n/errors";
import { LEGAL_VERSION } from "@/domain/legal";
import type { Container } from "./container";
import { transitionGame } from "./game-status";
import type { Currency, Locale } from "@/i18n/config";
import { boardsFor, isPackageTier, priceFor } from "@/domain/package";
import { childHasPaidWorld } from "./child-pricing.service";
import { outstandingCheckout, DraftCheckoutInProgress } from "./draft-checkout-lock";
import { checkoutCloseReceiptId, closeReceiptState } from "./checkout-close.service";

/** Shared by ordinary same-child checkout and the explicit world handoff. */
export async function claimChildWorldForCheckout(tx: Prisma.TransactionClient, input: {
  gameId: string; ownerId: string; familyChildId: string; scenes: readonly { sceneSlug: string }[];
}): Promise<boolean> {
  const worlds = worldsOwned(input.scenes.map(s => s.sceneSlug));
  const child = await tx.familyChild.findFirst({ where: { id: input.familyChildId, ownerId: input.ownerId, deletedAt: null } });
  if (!child || (await tx.familyChild.updateMany({ where: { id: child.id, ownerId: input.ownerId, deletedAt: null, displayName: child.displayName }, data: { displayName: child.displayName } })).count !== 1) return false;
  const other = await tx.game.findMany({ where: { familyChildId: child.id, ownerId: input.ownerId, id: { not: input.gameId } }, include: { scenes: true, orders: true } });
  // An earlier world may still accept money even when its local game closed.
  // The child row serializes this check with every new world payment claim.
  if (other.some(g => g.orders.some(outstandingCheckout))) throw new DraftCheckoutInProgress();
  // A package must contain only new worlds for this child. Historical paid
  // multi-world games still own each complete world and remain unchanged.
  if (other.some(g => !g.deletedAt && !["REFUNDED", "CANCELLED", "DELETED"].includes(g.status)
    && g.orders.some(o => o.userId === input.ownerId && o.paymentStatus === "PAID" && !o.refundedAt)
    && worlds.some(world => boardSlugs(world).every(slug => g.scenes.some(s => s.sceneSlug === slug))))) return false;
  // Every package shares the same child payment boundary. Only the exact
  // single-world product registers a continuation intent; old packages retain
  // their independent scene selection and pricing contracts.
  if (worlds.length !== 1 || input.scenes.length !== 9) return true;
  const world = worlds[0]!;
  const ownIntent = await tx.childWorldPurchase.findUnique({ where: { activeGameId: input.gameId } });
  if (ownIntent && (ownIntent.ownerId !== input.ownerId || ownIntent.familyChildId !== child.id || ownIntent.worldSlug !== world.slug)) return false;
  const previous = await tx.childWorldPurchase.findUnique({ where: { familyChildId_worldSlug: { familyChildId: child.id, worldSlug: world.slug } }, include: { activeGame: true } });
  if (previous && previous.ownerId !== input.ownerId) return false;
  if (previous?.activeGame && previous.activeGame.id !== input.gameId && worldPurchaseState({ ...previous.activeGame, hasPhoto: true, paid: false }) !== "closed") return false;
  await tx.childWorldPurchase.upsert({ where: { familyChildId_worldSlug: { familyChildId: child.id, worldSlug: world.slug } },
    create: { id: `wpr_${createHash("sha256").update(JSON.stringify([child.id, world.slug])).digest("hex").slice(0, 32)}`, ownerId: input.ownerId, familyChildId: child.id, worldSlug: world.slug, activeGameId: input.gameId },
    update: { activeGameId: input.gameId } });
  return true;
}

type CheckoutClaimInput = {
  gameId: string; userId: string; email: string; currency: Currency; amount: number; description: string; locale: Locale; legalVersion?: string;
  /** Set only when the product can no longer be sold: this request may resume this exact
   * open order (or recover its uncertain dispatch under the same key), never create,
   * replace, reprice or adopt another. Checked under the claim transaction. */
  resumeOrderId?: string;
};
type CheckoutClaimResult = { ok: true; checkoutUrl: string; userId: string } | FlowError;

/** The explicit world handoff also requires its server-owned continuation intent. */
export function startWorldPurchaseCheckout(c: Container, input: CheckoutClaimInput): Promise<CheckoutClaimResult> {
  return startClaimedCheckout(c, input, true);
}

/** First purchases use the same durable payment fence before any provider I/O. */
export function startOrdinaryCheckout(c: Container, input: CheckoutClaimInput): Promise<CheckoutClaimResult> {
  return startClaimedCheckout(c, input, false);
}

/** One immutable provider attempt, durable before dispatch and recoverable by key. */
async function startClaimedCheckout(c: Container, input: CheckoutClaimInput, requireWorldIntent: boolean): Promise<CheckoutClaimResult> {
  const now = new Date(), leaseUntil = new Date(now.getTime() + 120_000);
  const key = `world-checkout:${input.gameId}`;
  let claimed;
  try {
    claimed = await c.db.$transaction(async tx => {
      const game = await tx.game.findUnique({ where: { id: input.gameId }, include: { childProfile: true, scenes: true } });
      const intent = await tx.childWorldPurchase.findUnique({ where: { activeGameId: input.gameId } });
      if (!game || requireWorldIntent && !intent || game.ownerId !== input.userId
        || intent && (intent.ownerId !== input.userId || game.familyChildId !== intent.familyChildId || game.packageTier !== "ONE_WORLD")
        || !game.packageTier || !isPackageTier(game.packageTier) || game.scenes.length !== boardsFor(game.packageTier)
        || game.deletedAt || !["PACKAGE_SELECTED", "CHECKOUT_PENDING", "PAYMENT_FAILED"].includes(game.status)
        || !game.childProfile?.originalPhotoAssetId || game.childProfile.ownerId !== input.userId) return { state: "locked" as const };
      // Match ordinary checkout's Game -> FamilyChild fence order, avoiding
      // deadlocks between a refresh and an in-flight child checkout claim.
      const fenced = await tx.game.updateMany({ where: { id: game.id, updatedAt: game.updatedAt, ownerId: input.userId, status: game.status, deletedAt: null }, data: { updatedAt: new Date(Math.max(Date.now(), game.updatedAt.getTime() + 1)) } });
      if (fenced.count !== 1) return { state: "busy" as const };
      if (game.familyChildId && !await claimChildWorldForCheckout(tx, { gameId: game.id, ownerId: input.userId, familyChildId: game.familyChildId, scenes: game.scenes })) return { state: "locked" as const };
      // Re-read the child's paid history under its checkout fence. The page's
      // earlier quote cannot decide money after another world was paid.
      const amount = priceFor(game.packageTier, input.currency, await childHasPaidWorld(tx, { ownerId: input.userId, familyChildId: game.familyChildId, excludeGameId: game.id }));
      let order = await tx.order.findUnique({ where: { checkoutKey: key } });
      // A resume-only request holds no permission of its own: if its exact order closed,
      // changed or was replaced since the caller looked, nothing new is sold under it.
      if (input.resumeOrderId && (!order || order.id !== input.resumeOrderId || !outstandingCheckout(order))) return { state: "resume-lost" as const };
      if (order && (order.userId !== input.userId || order.provider !== c.payment.id || !["PENDING", "FAILED"].includes(order.paymentStatus))) return { state: "locked" as const };
      if (order && order.paymentStatus === "FAILED") {
        if (outstandingCheckout(order)) {
          // A decline may leave the same hosted session payable. Resume only
          // its exact saved quote; never dispatch, reprice or replace it here.
          if (!order.checkoutUrl || order.amountAgorot !== amount || order.currency !== input.currency
            || order.checkoutClaimUntil && order.checkoutClaimUntil > now) return { state: "busy" as const };
          const closing = await tx.auditLog.findUnique({ where: { id: checkoutCloseReceiptId(order.id) }, select: { metaJson: true } });
          if (closing) return { state: "busy" as const };
          return { state: "ready" as const, order };
        }
        await tx.order.update({ where: { id: order.id }, data: { checkoutKey: null, checkoutClaimUntil: null } });
        order = null;
      }
      if (order && (order.userId !== input.userId || order.provider !== c.payment.id || order.paymentStatus !== "PENDING")) return { state: "locked" as const };
      if (order && (order.amountAgorot !== amount || order.currency !== input.currency)) {
        if (outstandingCheckout(order)) return { state: "busy" as const };
        // No provider attempt exists: update the same un-dispatched order.
        order = await tx.order.update({ where: { id: order.id }, data: { amountAgorot: amount, currency: input.currency } });
      }
      if (order?.checkoutClaimUntil && order.checkoutClaimUntil > now) return { state: "busy" as const };
      const closing = order ? await tx.auditLog.findUnique({ where: { id: checkoutCloseReceiptId(order.id) }, select: { metaJson: true } }) : null;
      if (closing && closeReceiptState(closing.metaJson) !== "closed_unpaid") return { state: "busy" as const };
      if (order?.checkoutUrl) return { state: "ready" as const, order };
      // A real PSP must advertise an actual idempotency contract, not just accept a field.
      if (!c.payment.supportsCheckoutIdempotency) return { state: "unsupported" as const };
      if (!order) {
        const legacy = await tx.order.findFirst({ where: { gameId: input.gameId, paymentStatus: "PENDING" }, orderBy: { createdAt: "desc" } });
        const unsafePrevious = await tx.order.findMany({ where: { gameId: input.gameId, paymentStatus: { in: ["FAILED", "CANCELLED"] } } });
        if (unsafePrevious.some(outstandingCheckout)) return { state: "busy" as const };
        if (legacy) {
          if (legacy.userId !== input.userId || legacy.provider !== c.payment.id) return { state: "locked" as const };
          if ((legacy.amountAgorot !== amount || legacy.currency !== input.currency) && outstandingCheckout(legacy)) return { state: "busy" as const };
          if (!legacy.checkoutUrl && legacy.checkoutClaimUntil && legacy.checkoutClaimUntil > now) return { state: "busy" as const };
          order = await tx.order.update({ where: { id: legacy.id }, data: { checkoutKey: key, amountAgorot: amount, currency: input.currency,
            ...(legacy.checkoutUrl ? {} : { checkoutClaimUntil: leaseUntil }) } });
          if (order.checkoutUrl) return { state: "ready" as const, order };
        } else order = await tx.order.create({ data: { id: newId("ord"), gameId: input.gameId, userId: input.userId, amountAgorot: amount, currency: input.currency,
          packageTier: game.packageTier, provider: c.payment.id, checkoutKey: key, checkoutClaimUntil: leaseUntil } });
      } else {
        const leased = await tx.order.updateMany({ where: { id: order.id, checkoutKey: key, paymentStatus: "PENDING", checkoutUrl: null,
          OR: [{ checkoutClaimUntil: null }, { checkoutClaimUntil: { lte: now } }] }, data: { checkoutClaimUntil: leaseUntil } });
        if (leased.count !== 1) return { state: "busy" as const };
      }
      if (input.legalVersion === LEGAL_VERSION) await tx.auditLog.create({ data: { id: newId("aud"), actorType: "USER", actorId: input.userId,
        action: "checkout:terms-accepted", entityType: "Order", entityId: order.id,
        metaJson: JSON.stringify({ version: input.legalVersion, locale: input.locale, gameId: input.gameId, amountAgorot: order.amountAgorot, currency: order.currency }) } });
      await transitionGame(c, input.gameId, "CHECKOUT_PENDING", { type: "USER", id: input.userId }, { orderId: order.id }, tx);
      return { state: "claimed" as const, order, familyChildId: game.familyChildId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (error instanceof DraftCheckoutInProgress || error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P1008"].includes(error.code)) return flowError("CHECKOUT_IN_PROGRESS", "התשלום נפתח בלשונית אחרת.");
    throw error;
  }
  if (claimed.state === "ready") return { ok: true, checkoutUrl: claimed.order.checkoutUrl!, userId: input.userId };
  if (claimed.state === "resume-lost") return flowError("SEARCH_LEVEL_UNAVAILABLE", "התשלום הקודם נסגר, ומסלול הבלשים כבר לא פתוח בעולם הזה.");
  if (claimed.state === "busy") return flowError("CHECKOUT_IN_PROGRESS", "התשלום נפתח בלשונית אחרת.");
  if (claimed.state === "unsupported") return flowError("SERVICE_UNAVAILABLE", "ספק התשלום עדיין אינו תומך ברכישה בטוחה.");
  if (claimed.state !== "claimed") return flowError("DRAFT_LOCKED", "ההזמנה השתנתה. פתחו שוב את העולם.");
  try {
    const stillApplicable = await c.db.order.findFirst({ where: { id: claimed.order.id, checkoutKey: key, paymentStatus: "PENDING", checkoutUrl: null, checkoutClaimUntil: leaseUntil,
      game: { ownerId: input.userId, deletedAt: null, status: "CHECKOUT_PENDING", familyChildId: claimed.familyChildId,
        ...(claimed.familyChildId ? { familyChild: { is: { ownerId: input.userId, deletedAt: null } } } : {}) } }, select: { id: true } });
    if (!stillApplicable) return flowError("DRAFT_LOCKED", "ההזמנה השתנתה לפני פתיחת התשלום.");
    const session = await c.payment.createCheckout({ orderId: claimed.order.id, idempotencyKey: claimed.order.id,
      amountAgorot: claimed.order.amountAgorot, currency: claimed.order.currency, description: input.description, customerEmail: input.email,
      successUrl: `${c.appUrl}/creating/${input.gameId}`, cancelUrl: requireWorldIntent ? `${c.appUrl}/checkout?game=${encodeURIComponent(input.gameId)}&cancelled=1` : `${c.appUrl}/checkout?cancelled=1` });
    const saved = await c.db.order.updateMany({ where: { id: claimed.order.id, checkoutKey: key, paymentStatus: "PENDING", checkoutUrl: null, checkoutClaimUntil: leaseUntil,
      game: { ownerId: input.userId, deletedAt: null, status: "CHECKOUT_PENDING" } }, data: { checkoutUrl: session.checkoutUrl, providerPaymentId: session.providerPaymentId ?? null, checkoutClaimUntil: null } });
    if (saved.count !== 1) return flowError("DRAFT_LOCKED", "ההזמנה השתנתה לפני פתיחת התשלום.");
    c.analytics.track("checkout_started", { gameId: input.gameId, packageTier: claimed.order.packageTier });
    return { ok: true, checkoutUrl: session.checkoutUrl, userId: input.userId };
  } catch {
    // Retain the same order/key after an unknown provider result; a supported
    // adapter retries it after the lease, never purchases a new session.
    return flowError("CHECKOUT_IN_PROGRESS", "ממתינים לפתיחת התשלום. אפשר לנסות שוב בעוד רגע.");
  }
}

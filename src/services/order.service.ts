import { newId } from "@/lib/ids";
import { Prisma } from "@prisma/client";
import { boardsFor, PACKAGES, isPackageTier, isCurrency, priceFor } from "@/domain/package";
import { type Currency, pick, type Locale } from "@/i18n/config";
import { flowError, type FlowError } from "@/i18n/errors";
import type { Container } from "./container";
import { spendAllowedFor } from "@/domain/spend-policy";
import { spendGuard } from "@/lib/env";
import type { PaymentWebhookEvent } from "@/infra/payment/types";
import { canTransition, isAfterPayment, type GameStatus } from "@/domain/order-state";
import { ensureUser } from "./auth.service";
import { draftBelongsTo, loadDraft } from "./create-flow.service";
import { statusOf, transitionGame } from "./game-status";
import { WEBHOOK, audit, type Actor } from "./audit.service";
import { bindCheckoutFamilyChild, reconcilePaidFamilyChildren } from "./family.service";

/**
 * Checkout + payment webhook. The webhook is the single source of truth for
 * "paid"; the redirect back from the PSP only shows a waiting screen.
 */
export type CheckoutDraftAccess = { draftToken: string | null; userId: string | null };
class CheckoutDraftConflict extends Error {}
function requireCheckoutDraft(ok: unknown): asserts ok { if (!ok) throw new CheckoutDraftConflict("Checkout draft ownership or photo changed"); }

export async function startCheckout(c: Container, input: { gameId: string; email: string; currency: Currency; access: CheckoutDraftAccess }): Promise<{ ok: true; checkoutUrl: string; userId: string } | FlowError> {
  // Server callers must resolve geography explicitly. Never infer money from
  // the child's game language, and fail before side effects on invalid input.
  if (!isCurrency(input.currency)) throw new Error("Checkout requires a server-resolved currency");
  // On a QA box with a real painter, the money starts here.
  if (!spendAllowedFor(spendGuard(), input.email)) return flowError("QA_TESTERS_ONLY", "זו סביבת בדיקה. רק בודקים רשומים יכולים ליצור כאן משחקים.");
  const game = await loadDraft(c, input.gameId);
  if (!game || !game.childProfile || game.deletedAt || !input.access || !draftBelongsTo(game, input.access.draftToken, input.access.userId)) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
  const status = statusOf(game);
  if (status !== "PACKAGE_SELECTED" && status !== "CHECKOUT_PENDING" && status !== "PAYMENT_FAILED") return flowError("PREVIOUS_STEPS", "צריך לסיים את השלבים הקודמים.");
  if (!game.packageTier || !isPackageTier(game.packageTier)) return flowError("PICK_PACKAGE_FIRST", "קודם בוחרים חבילה.");
  if (game.scenes.length !== boardsFor(game.packageTier)) return flowError("SCENES_INCOMPLETE", "בחירת העולמות לא הושלמה.");

  let user;
  try {
    user = await ensureUser(c, input.email);
  } catch {
    return flowError("INVALID_EMAIL", "כתובת המייל לא נראית תקינה.");
  }

  // Adopt the exact uploaded photo together with its draft/child. An anonymous
  // upload starts with ownerId=null; changing only the parents of that asset
  // leaves later private reads and fenced deletion unable to prove ownership.
  // All three mutations share a transaction, and the draft proof is rechecked
  // under the Game -> Child -> Asset fence before any payment call.
  const locale: Locale = game.locale === "he" ? "he" : "en";
  try {
    await c.db.$transaction(async tx => {
      const current = await tx.game.findUnique({ where: { id: game.id } });
      requireCheckoutDraft(current && !current.deletedAt && current.ownerId === game.ownerId && current.childProfileId === game.childProfile!.id
        && current.status === game.status && current.familyChildId === game.familyChildId && current.draftToken === game.draftToken && draftBelongsTo(current, input.access.draftToken, input.access.userId));
      // A saved family child belongs to this signed-in parent. The draft cookie
      // alone must not attach it to an email entered at checkout.
      if (current.familyChildId) requireCheckoutDraft(input.access.userId === user.id && current.ownerId === user.id);
      const locked = await tx.game.updateMany({ where: { id: game.id, ownerId: game.ownerId, childProfileId: game.childProfile!.id,
        draftToken: game.draftToken, status: game.status, deletedAt: null, updatedAt: game.updatedAt }, data: { ownerId: user.id } });
      requireCheckoutDraft(locked.count === 1);
      const child = await tx.childProfile.findUnique({ where: { id: game.childProfile!.id } });
      requireCheckoutDraft(child && !child.deletedAt && child.ownerId === game.ownerId && child.originalPhotoAssetId
        && child.originalPhotoAssetId === game.childProfile!.originalPhotoAssetId);
      // Never transfer another game's shared child or reviewed identity assets.
      if (game.ownerId !== user.id) requireCheckoutDraft(!child.avatarAssetId && !child.identityAssetId);
      requireCheckoutDraft(await tx.game.count({ where: { childProfileId: child.id, NOT: { id: game.id }, deletedAt: null } }) === 0);
      const photo = await tx.asset.findUnique({ where: { id: child.originalPhotoAssetId } });
      requireCheckoutDraft(photo && photo.ownerId === game.ownerId && photo.type === "ORIGINAL_PHOTO" && photo.visibility === "PRIVATE" && photo.status === "READY" && !photo.deletedAt);
      requireCheckoutDraft(await tx.asset.count({ where: { storagePath: photo.storagePath } }) === 1);
      requireCheckoutDraft(await tx.childProfile.count({ where: { NOT: { id: child.id }, OR: [
        { originalPhotoAssetId: photo.id }, { avatarAssetId: photo.id }, { identityAssetId: photo.id },
      ] } }) === 0);
      const childChanged = await tx.childProfile.updateMany({ where: { id: child.id, ownerId: game.ownerId, originalPhotoAssetId: photo.id,
        avatarAssetId: child.avatarAssetId, identityAssetId: child.identityAssetId, deletedAt: null }, data: { ownerId: user.id } });
      const photoChanged = await tx.asset.updateMany({ where: { id: photo.id, ownerId: game.ownerId, storagePath: photo.storagePath,
        type: "ORIGINAL_PHOTO", visibility: "PRIVATE", status: "READY", deletedAt: null }, data: { ownerId: user.id } });
      requireCheckoutDraft(childChanged.count === 1 && photoChanged.count === 1);
      if (current.familyChildId) requireCheckoutDraft(await bindCheckoutFamilyChild(tx, { gameId: game.id, familyChildId: current.familyChildId, ownerId: user.id, displayName: child.displayName }));
      await tx.user.update({ where: { id: user.id }, data: { locale } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (error instanceof CheckoutDraftConflict) return flowError("DRAFT_LOCKED", "הטיוטה או התמונה השתנו. פתחו שוב את הטיוטה לפני התשלום.");
    throw error;
  }

  const pkg = PACKAGES[game.packageTier];
  const currency = input.currency;
  const amount = priceFor(pkg.tier, currency); // minor units of `currency`
  const existing = await c.db.order.findFirst({ where: { gameId: game.id, paymentStatus: "PENDING" }, orderBy: { createdAt: "desc" } });
  let order = existing;
  if (!order || order.amountAgorot !== amount || order.currency !== currency || order.userId !== user.id) {
    if (order) await c.db.order.update({ where: { id: order.id }, data: { paymentStatus: "CANCELLED" } });
    order = await c.db.order.create({
      data: { id: newId("ord"), userId: user.id, gameId: game.id, amountAgorot: amount, currency, packageTier: pkg.tier, provider: c.payment.id },
    });
  }

  const session = await c.payment.createCheckout({
    orderId: order.id,
    amountAgorot: order.amountAgorot,
    currency: order.currency,
    description: `${pick({ en: `Where's ${game.childProfile.displayName}?`, he: `איפה ${game.childProfile.displayName}?` }, locale)} — ${pick(pkg.name, locale)}`,
    customerEmail: user.email,
    successUrl: `${c.appUrl}/creating/${game.id}`,
    cancelUrl: `${c.appUrl}/checkout?cancelled=1`,
  });
  await c.db.order.update({ where: { id: order.id }, data: { checkoutUrl: session.checkoutUrl, providerPaymentId: session.providerPaymentId ?? null } });
  if (status !== "CHECKOUT_PENDING") await transitionGame(c, game.id, "CHECKOUT_PENDING", { type: "USER", id: user.id }, { orderId: order.id });
  c.analytics.track("checkout_started", { gameId: game.id, packageTier: pkg.tier });
  return { ok: true, checkoutUrl: session.checkoutUrl, userId: user.id };
}

export type WebhookOutcome = { status: 200 | 400 | 404; body: string };

export async function handlePaymentWebhook(c: Container, rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookOutcome> {
  const parsed = await c.payment.parseWebhook(rawBody, headers);
  if (!parsed.ok) return { status: 400, body: `rejected: ${parsed.reason}` };
  const ev = parsed.event;

  const order = await c.db.order.findUnique({ where: { id: ev.orderId } });
  if (!order) return { status: 404, body: "unknown order" };

  // A replay is answered before anything is touched.
  const seen = await c.db.paymentEvent.findUnique({ where: { provider_providerEventId: { provider: c.payment.id, providerEventId: ev.providerEventId } } });
  if (seen) return { status: 200, body: "duplicate event ignored" };

  // What the provider says was paid has to be what the order asked for, in the
  // currency it asked for. 990 of the wrong currency is not 990.
  if (ev.kind === "PAID" && (ev.amountAgorot !== order.amountAgorot || (ev.currency !== undefined && ev.currency !== order.currency))) {
    await audit(c, WEBHOOK, "payment:amount-mismatch", "Order", order.id, { expected: `${order.amountAgorot} ${order.currency}`, got: `${ev.amountAgorot} ${ev.currency ?? "?"}` });
    return { status: 400, body: "amount mismatch" };
  }

  // The order's money, the game's status and the event record commit together
  // or not at all.
  //
  // Before, each was its own write. An interruption between the order and the
  // game left the order PAID and the game still in CHECKOUT_PENDING, and the
  // provider's retry met `order.paymentStatus === "PAID"`, answered "already
  // paid" and recorded the event — so nothing ever finished the game, and no
  // later delivery could. A parent had paid for a game that would never be
  // queued (game status IS the queue; see below).
  //
  // Now: one transaction, and the PAID branch reconciles instead of returning
  // early, so a retry completes whatever the interrupted attempt left half
  // done. If anything inside fails, nothing is written and the provider's
  // next delivery starts again from the true state.
  let applied: Applied;
  try {
    applied = await c.db.$transaction(async (tx) => {
      // Re-read under the transaction: the order may have moved since the
      // duplicate check above.
      const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      const result = await applyPaymentEvent(c, tx, current, ev);
      await tx.paymentEvent.create({
        data: { id: newId("pev"), orderId: order.id, provider: c.payment.id, providerEventId: ev.providerEventId, kind: ev.kind, payloadJson: JSON.stringify(ev.raw) },
      });
      return result;
    });
  } catch (err) {
    // Only a unique-key collision is a duplicate — two deliveries racing, and
    // the loser's writes have just been rolled back with it. Any other error
    // is the database having a bad moment, and the provider must retry that,
    // not be told everything is fine.
    if (isUniqueViolation(err)) return { status: 200, body: "duplicate event ignored" };
    throw err;
  }
  // Outside the transaction: analytics is a side effect, and a rolled-back
  // payment must not be reported as a completed one.
  for (const event of applied.track) c.analytics.track(event.name, event.props);
  // Presentation identity must not roll back the provider's committed money.
  // A crash/failure here is repaired idempotently on the next family read.
  if (ev.kind === "PAID") {
    try {
      const game = await c.db.game.findUnique({ where: { id: order.gameId }, select: { ownerId: true } });
      if (game?.ownerId) await reconcilePaidFamilyChildren(c.db, game.ownerId, order.gameId);
    } catch {
      console.warn("[passport] post-payment family reconciliation deferred", { gameId: order.gameId });
    }
  }
  return { status: 200, body: applied.body };
}

type Applied = { body: string; track: Array<{ name: "payment_completed"; props: Record<string, string> }> };
type OrderRow = { id: string; gameId: string; paymentStatus: string; packageTier: string };

/**
 * Idempotent, monotonic and reconciling, inside the caller's transaction.
 *
 * Paid stays paid whatever arrives later: a decline delivered after the money
 * is in is stale news, not a reversal, and a refund of an order that was never
 * paid is nothing at all. A re-delivery of an event whose first attempt was
 * interrupted finishes the part that never happened.
 */
async function applyPaymentEvent(c: Container, tx: Prisma.TransactionClient, order: OrderRow, ev: PaymentWebhookEvent): Promise<Applied> {
  const gameStatus = async () => statusOf(await tx.game.findUniqueOrThrow({ where: { id: order.gameId }, select: { status: true } }));
  /**
   * Move the game if it is not there already and the lifecycle allows it.
   *
   * A game the parent cancelled or deleted while the money was in flight
   * cannot be moved at all. The order keeps the truth about the payment and a
   * person has to settle it; throwing here would only make the provider
   * redeliver the same event for ever.
   */
  const moveGame = async (to: GameStatus, done: (from: GameStatus) => boolean) => {
    const from = await gameStatus();
    if (done(from)) return;
    if (!canTransition(from, to)) {
      await audit(c, WEBHOOK, "payment:game-unreachable", "Game", order.gameId, { from, to, orderId: order.id, event: ev.kind }, tx);
      return;
    }
    await transitionGame(c, order.gameId, to, WEBHOOK, { orderId: order.id }, tx);
  };

  if (ev.kind === "PAID") {
    if (order.paymentStatus === "REFUNDED") return { body: "ignored: order already refunded", track: [] };
    const first = order.paymentStatus !== "PAID";
    if (first) await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", paidAt: new Date(), providerPaymentId: ev.providerPaymentId } });
    // `isAfterPayment`, not `=== "PAID"`: a game already being drawn has moved
    // on, and must never be dragged back to the start of the queue.
    await moveGame("PAID", isAfterPayment);
    // Deliberately no enqueue here. `c.jobs` runs the handler in the calling
    // request, so this line used to hold the PSP's webhook open for the whole
    // pipeline — dozens of renders, judgements and retries, none of which are
    // work an HTTP request should be doing. The parent was charged and then
    // waited on a socket that could only time out.
    //
    // Marking the game PAID *is* the enqueue: `nextPendingGame` selects on
    // game status, so the row this transaction just wrote is the durable
    // queue entry. The cron at /api/jobs/tick picks it up within five
    // minutes, and the /creating page the parent lands on ticks it
    // immediately, in slices, with a deadline and a lease.
    return {
      body: first ? "ok" : "already paid",
      track: first ? [{ name: "payment_completed", props: { gameId: order.gameId, packageTier: order.packageTier } }] : [],
    };
  }
  if (ev.kind === "FAILED") {
    if (order.paymentStatus !== "PENDING" && order.paymentStatus !== "FAILED") return { body: `ignored: late FAILED after ${order.paymentStatus}`, track: [] };
    if (order.paymentStatus === "PENDING") await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
    await moveGame("PAYMENT_FAILED", (from) => from === "PAYMENT_FAILED");
    return { body: "ok", track: [] };
  }
  // REFUNDED
  if (order.paymentStatus !== "PAID" && order.paymentStatus !== "REFUNDED") return { body: `ignored: refund of an order that is ${order.paymentStatus}`, track: [] };
  if (order.paymentStatus === "PAID") await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
  await moveGame("REFUNDED", (from) => from === "REFUNDED");
  return { body: "ok", track: [] };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

export async function refundOrder(c: Container, orderId: string, actor: Actor): Promise<{ ok: boolean; reason?: string }> {
  const order = await c.db.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentStatus !== "PAID") return { ok: false, reason: "ההזמנה לא במצב ששולם." };
  const res = await c.payment.refund(order.providerPaymentId ?? "", order.amountAgorot);
  if (!res.ok) return { ok: false, reason: "ספק התשלום סירב להחזר." };
  // The order row and the game move together, and only from PAID: a refund
  // that lost a race to a webhook or to another admin writes nothing rather
  // than marking an order refunded twice or re-refunding a refunded game.
  // (The provider call above is still outside the fence; two admins clicking
  // at the same instant can both reach the provider. Recorded in the handoff.)
  const claimed = await c.db.$transaction(async (tx) => {
    const marked = await tx.order.updateMany({ where: { id: orderId, paymentStatus: "PAID" }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    if (marked.count !== 1) return false;
    const status = statusOf(await tx.game.findUniqueOrThrow({ where: { id: order.gameId }, select: { status: true } }));
    if (status !== "REFUNDED" && canTransition(status, "REFUNDED")) {
      await transitionGame(c, order.gameId, "REFUNDED", actor, { orderId, providerRefundId: res.providerRefundId }, tx);
    } else if (status !== "REFUNDED") {
      await audit(c, actor, "payment:game-unreachable", "Game", order.gameId, { from: status, to: "REFUNDED", orderId }, tx);
    }
    return true;
  });
  if (!claimed) return { ok: false, reason: "ההזמנה כבר לא במצב ששולם." };
  return { ok: true };
}

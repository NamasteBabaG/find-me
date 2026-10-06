import { newId } from "@/lib/ids";
import { LEGAL_VERSION } from "@/domain/legal";
import { Prisma } from "@prisma/client";
import { boardsFor, PACKAGES, isPackageTier, isCurrency, priceFor } from "@/domain/package";
import { type Currency, pick, type Locale } from "@/i18n/config";
import { flowError, type FlowError } from "@/i18n/errors";
import type { Container } from "./container";
import { spendAllowedFor } from "@/domain/spend-policy";
import { spendGuard } from "@/lib/env";
import { purchasingClosed, purchasingEnabled } from "@/lib/purchasing";
import type { PaymentWebhookEvent } from "@/infra/payment/types";
import { canTransition, isAfterPayment, type GameStatus } from "@/domain/order-state";
import { ensureUser } from "./auth.service";
import { draftBelongsTo, loadDraft, selectPackage, worldsForDraft, sceneVersionForDraft } from "./create-flow.service";
import { GameStatusConflict, statusOf, transitionGame } from "./game-status";
import { WEBHOOK, audit, type Actor } from "./audit.service";
import { bindCheckoutFamilyChild, reconcilePaidFamilyChildren } from "./family.service";
import { childHasPaidWorld } from "./child-pricing.service";
import { claimChildWorldForCheckout, startOrdinaryCheckout, startWorldPurchaseCheckout } from "./world-purchase-checkout.service";
import { DraftCheckoutInProgress } from "./draft-checkout-lock";
import { boardSlugs } from "@/domain/world";
import { checkoutCloseReceiptId, closeReceiptState } from "./checkout-close.service";

/**
 * Checkout + payment webhook. The webhook is the single source of truth for
 * "paid"; the redirect back from the PSP only shows a waiting screen.
 */
export type CheckoutDraftAccess = { draftToken: string | null; userId: string | null };
class CheckoutDraftConflict extends Error {}
function requireCheckoutDraft(ok: unknown): asserts ok { if (!ok) throw new CheckoutDraftConflict("Checkout draft ownership or photo changed"); }

export async function startCheckout(c: Container, input: { gameId: string; email: string; currency: Currency; access: CheckoutDraftAccess; legalVersion?: string }): Promise<{ ok: true; checkoutUrl: string; userId: string } | FlowError> {
  if (!purchasingEnabled()) return purchasingClosed();
  if (input.legalVersion !== undefined && input.legalVersion !== LEGAL_VERSION) return flowError("TERMS_REQUIRED", "יש לאשר את הנוסח העדכני לפני התשלום.");
  // Server callers must resolve geography explicitly. Never infer money from
  // the child's game language, and fail before side effects on invalid input.
  if (!isCurrency(input.currency)) throw new Error("Checkout requires a server-resolved currency");
  // On a QA box with a real painter, the money starts here.
  if (!spendAllowedFor(spendGuard(), input.email)) return flowError("QA_TESTERS_ONLY", "זו סביבת בדיקה. רק בודקים רשומים יכולים ליצור כאן משחקים.");
  let game = await loadDraft(c, input.gameId);
  if (!game || !game.childProfile || game.deletedAt || !input.access || !draftBelongsTo(game, input.access.draftToken, input.access.userId)) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
  if (game.status === "PHOTO_APPROVED" && game.familyChildId && await c.db.childWorldPurchase.findUnique({ where: { activeGameId: game.id } })) {
    const selected = await selectPackage(c, game.id, "ONE_WORLD");
    if (!selected.ok) return selected;
    game = await loadDraft(c, input.gameId);
    if (!game?.childProfile) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
  }
  const status = statusOf(game);
  if (status !== "PACKAGE_SELECTED" && status !== "CHECKOUT_PENDING" && status !== "PAYMENT_FAILED") return flowError("PREVIOUS_STEPS", "צריך לסיים את השלבים הקודמים.");
  if (!game.packageTier || !isPackageTier(game.packageTier)) return flowError("PICK_PACKAGE_FIRST", "קודם בוחרים חבילה.");
  if (game.scenes.length !== boardsFor(game.packageTier)) return flowError("SCENES_INCOMPLETE", "בחירת העולמות לא הושלמה.");
  if (game.familyChildId) {
    const intent = await c.db.childWorldPurchase.findUnique({ where: { activeGameId: game.id } });
    if (intent) {
      const offered = (await worldsForDraft(c, game.styleVersion)).find(w => w.slug === intent.worldSlug);
      const version = sceneVersionForDraft(game.styleVersion);
      if (!offered || game.packageTier !== "ONE_WORLD" || intent.ownerId !== game.ownerId || intent.familyChildId !== game.familyChildId
        || !boardSlugs(offered).every(slug => game!.scenes.some(s => s.sceneSlug === slug && (version === undefined || s.sceneVersion === version)))) return flowError("SCENE_UNAVAILABLE", "העולם אינו זמין להזמנה הזאת.");
    }
  }

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
  let continuation = false;
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
      if (current.familyChildId) requireCheckoutDraft(await claimChildWorldForCheckout(tx, { gameId: game.id, ownerId: user.id, familyChildId: current.familyChildId, scenes: game.scenes }));
      continuation = await childHasPaidWorld(tx, { ownerId: user.id, familyChildId: current.familyChildId, excludeGameId: game.id });
      await tx.user.update({ where: { id: user.id }, data: { locale } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
  } catch (error) {
    if (error instanceof DraftCheckoutInProgress || error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P1008"].includes(error.code)) return flowError("CHECKOUT_IN_PROGRESS", "צריך לסיים את התשלום הקיים לפני פתיחת עולם נוסף.");
    if (error instanceof CheckoutDraftConflict) return flowError("DRAFT_LOCKED", "הטיוטה או התמונה השתנו. פתחו שוב את הטיוטה לפני התשלום.");
    throw error;
  }

  const pkg = PACKAGES[game.packageTier];
  const currency = input.currency;
  const amount = priceFor(pkg.tier, currency, continuation); // server-verified child's price
  if (game.familyChildId && await c.db.childWorldPurchase.findUnique({ where: { activeGameId: game.id } })) {
    return startWorldPurchaseCheckout(c, { gameId: game.id, userId: user.id, email: user.email, currency, amount, locale,
      description: `${pick({ en: `Where's ${game.childProfile!.displayName}?`, he: `איפה ${game.childProfile!.displayName}?` }, locale)} — ${pick(pkg.name, locale)}`,
      legalVersion: input.legalVersion });
  }
  return startOrdinaryCheckout(c, {
    gameId: game.id, userId: user.id, email: user.email, currency, amount, locale,
    description: `${pick({ en: `Where's ${game.childProfile.displayName}?`, he: `איפה ${game.childProfile.displayName}?` }, locale)} — ${pick(pkg.name, locale)}`,
    legalVersion: input.legalVersion,
  });
}

export type WebhookOutcome = { status: 200 | 400 | 404; body: string };

export async function handlePaymentWebhook(c: Container, rawBody: string, headers: Record<string, string | undefined>): Promise<WebhookOutcome> {
  const parsed = await c.payment.parseWebhook(rawBody, headers);
  if (!parsed.ok) return { status: 400, body: `rejected: ${parsed.reason}` };
  const ev = parsed.event;

  const order = await c.db.order.findUnique({ where: { id: ev.orderId } });
  if (!order) return { status: 404, body: "unknown order" };
  if (order.provider !== c.payment.id) return { status: 400, body: "provider mismatch" };

  // A replay is answered before anything is touched.
  const seen = await c.db.paymentEvent.findUnique({ where: { provider_providerEventId: { provider: c.payment.id, providerEventId: ev.providerEventId } } });
  if (seen) return { status: 200, body: "duplicate event ignored" };

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
      // Checkout, cancellation and payment all acquire Game -> FamilyChild.
      // The row write serializes close receipts and the sibling's price quote
      // with this money event; a stale game snapshot must be retried by the PSP.
      const game = await tx.game.findUniqueOrThrow({ where: { id: order.gameId } });
      const fenced = await tx.game.updateMany({ where: { id: game.id, status: game.status, updatedAt: game.updatedAt },
        data: { updatedAt: new Date(Math.max(Date.now(), game.updatedAt.getTime() + 1)) } });
      if (fenced.count !== 1) throw new GameStatusConflict(game.id, statusOf(game), statusOf(game));
      if (game.familyChildId) {
        const child = await tx.familyChild.findUnique({ where: { id: game.familyChildId } });
        if (child) await tx.familyChild.updateMany({ where: { id: child.id }, data: { displayName: child.displayName } });
      }
      // Re-read after the write fence: another delivery or a confirmed close
      // may have committed while this request was waiting for its turn.
      const current = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      if (current.provider !== c.payment.id) return { body: "provider mismatch", track: [], rejected: true };
      // Validate immutable money under the same fence as checkout repricing.
      if (ev.kind === "PAID" && (ev.amountAgorot !== current.amountAgorot || (ev.currency !== undefined && ev.currency !== current.currency))) {
        await audit(c, WEBHOOK, "payment:amount-mismatch", "Order", current.id,
          { expected: `${current.amountAgorot} ${current.currency}`, got: `${ev.amountAgorot} ${ev.currency ?? "?"}` }, tx);
        return { body: "amount mismatch", track: [], rejected: true };
      }
      const result = await applyPaymentEvent(c, tx, current, ev);
      if (result.rejected) return result;
      await tx.paymentEvent.create({
        data: { id: newId("pev"), orderId: order.id, provider: c.payment.id, providerEventId: ev.providerEventId, kind: ev.kind, payloadJson: JSON.stringify(ev.raw) },
      });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
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
  if (ev.kind === "PAID" && !applied.rejected) {
    try {
      const game = await c.db.game.findUnique({ where: { id: order.gameId }, select: { ownerId: true } });
      if (game?.ownerId) await reconcilePaidFamilyChildren(c.db, game.ownerId, order.gameId);
    } catch {
      console.warn("[passport] post-payment family reconciliation deferred", { gameId: order.gameId });
    }
  }
  return { status: applied.rejected ? 400 : 200, body: applied.body };
}

type Applied = { body: string; track: Array<{ name: "payment_completed"; props: Record<string, string> }>; rejected?: boolean };
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
    // A decline need not close the provider's hosted session. A later actual
    // payment for that same order is reconciled through existing transitions,
    // without opening another payment or waiting for a redirect to recover it.
    if (to === "PAID" && from === "PAYMENT_FAILED") {
      await transitionGame(c, order.gameId, "CHECKOUT_PENDING", WEBHOOK, { orderId: order.id, source: "late-paid-reconciliation" }, tx);
      await transitionGame(c, order.gameId, "PAID", WEBHOOK, { orderId: order.id, source: "late-paid-reconciliation" }, tx);
      return;
    }
    if (!canTransition(from, to)) {
      await audit(c, WEBHOOK, "payment:game-unreachable", "Game", order.gameId, { from, to, orderId: order.id, event: ev.kind }, tx);
      return;
    }
    await transitionGame(c, order.gameId, to, WEBHOOK, { orderId: order.id }, tx);
  };

  if (ev.kind === "PAID") {
    // The mock is the provider here: a durable terminal-close receipt is proof
    // that this session cannot charge. Real PSP money is never discarded based
    // merely on local CANCELLED/FAILED state or an expired checkout lease.
    if (c.payment.id === "mock") {
      const id = checkoutCloseReceiptId(order.id);
      const close = await tx.auditLog.findUnique({ where: { id } });
      if (close?.action === "checkout:close" && close.entityType === "Order" && close.entityId === order.id && closeReceiptState(close.metaJson) === "closed_unpaid") {
        return { body: "rejected: closed mock checkout", track: [], rejected: true };
      }
    }
    if (order.paymentStatus === "REFUNDED") return { body: "ignored: order already refunded", track: [] };
    const first = order.paymentStatus !== "PAID";
    const previousPaid = await tx.order.findFirst({ where: { gameId: order.gameId, NOT: { id: order.id },
      OR: [{ paymentStatus: { in: ["PAID", "REFUNDED"] } }, { paidAt: { not: null } }] }, select: { id: true } });
    if (first) await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", paidAt: new Date(), providerPaymentId: ev.providerPaymentId } });
    if (previousPaid) {
      if (first) await audit(c, WEBHOOK, "payment:duplicate-order-paid", "Game", order.gameId,
        { orderId: order.id, previousOrderId: previousPaid.id, provider: c.payment.id, providerEventId: ev.providerEventId }, tx);
      // Preserve both actual payments for settlement, but never enqueue or
      // count this second purchase as another successfully sold game.
      return { body: first ? "duplicate payment recorded" : "already paid", track: [] };
    }
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

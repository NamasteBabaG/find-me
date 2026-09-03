import { newId } from "@/lib/ids";
import { boardsFor, PACKAGES, isPackageTier, priceFor } from "@/domain/package";
import { type Currency, currencyFor, pick, type Locale } from "@/i18n/config";
import { flowError, type FlowError } from "@/i18n/errors";
import type { Container } from "./container";
import { ensureUser } from "./auth.service";
import { loadDraft } from "./create-flow.service";
import { statusOf, transitionGame } from "./game-status";
import { WEBHOOK, audit, type Actor } from "./audit.service";

/**
 * Checkout + payment webhook. The webhook is the single source of truth for
 * "paid"; the redirect back from the PSP only shows a waiting screen.
 */
export async function startCheckout(c: Container, input: { gameId: string; email: string; currency?: Currency }): Promise<{ ok: true; checkoutUrl: string; userId: string } | FlowError> {
  const game = await loadDraft(c, input.gameId);
  if (!game || !game.childProfile) return flowError("DRAFT_NOT_FOUND", "הטיוטה לא נמצאה.");
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

  // Attach the soft account to the draft + child profile; remember the parent's language.
  const locale: Locale = game.locale === "he" ? "he" : "en";
  await c.db.user.update({ where: { id: user.id }, data: { locale } });
  await c.db.game.update({ where: { id: game.id }, data: { ownerId: user.id } });
  await c.db.childProfile.update({ where: { id: game.childProfile.id }, data: { ownerId: user.id } });

  const pkg = PACKAGES[game.packageTier];
  const currency: Currency = input.currency ?? currencyFor(locale);
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

  // Idempotency: the unique (provider, providerEventId) makes a replay a no-op.
  const seen = await c.db.paymentEvent.findUnique({ where: { provider_providerEventId: { provider: c.payment.id, providerEventId: ev.providerEventId } } });
  if (seen) return { status: 200, body: "duplicate event ignored" };
  try {
    await c.db.paymentEvent.create({
      data: { id: newId("pev"), orderId: order.id, provider: c.payment.id, providerEventId: ev.providerEventId, kind: ev.kind, payloadJson: JSON.stringify(ev.raw) },
    });
  } catch {
    // lost a race with a concurrent delivery of the same event
    return { status: 200, body: "duplicate event ignored" };
  }

  if (ev.kind === "PAID") {
    if (ev.amountAgorot !== order.amountAgorot) {
      await audit(c, WEBHOOK, "payment:amount-mismatch", "Order", order.id, { expected: order.amountAgorot, got: ev.amountAgorot });
      return { status: 400, body: "amount mismatch" };
    }
    if (order.paymentStatus !== "PAID") {
      await c.db.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID", paidAt: new Date(), providerPaymentId: ev.providerPaymentId } });
      await transitionGame(c, order.gameId, "PAID", WEBHOOK, { orderId: order.id });
      c.analytics.track("payment_completed", { gameId: order.gameId, packageTier: order.packageTier });
      await c.jobs.enqueue("generate-game", { gameId: order.gameId });
    }
    return { status: 200, body: "ok" };
  }

  if (ev.kind === "FAILED") {
    await c.db.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
    await transitionGame(c, order.gameId, "PAYMENT_FAILED", WEBHOOK, { orderId: order.id });
    return { status: 200, body: "ok" };
  }

  // REFUNDED
  await c.db.order.update({ where: { id: order.id }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
  await transitionGame(c, order.gameId, "REFUNDED", WEBHOOK, { orderId: order.id });
  return { status: 200, body: "ok" };
}

export async function refundOrder(c: Container, orderId: string, actor: Actor): Promise<{ ok: boolean; reason?: string }> {
  const order = await c.db.order.findUnique({ where: { id: orderId } });
  if (!order || order.paymentStatus !== "PAID") return { ok: false, reason: "ההזמנה לא במצב ששולם." };
  const res = await c.payment.refund(order.providerPaymentId ?? "", order.amountAgorot);
  if (!res.ok) return { ok: false, reason: "ספק התשלום סירב להחזר." };
  await c.db.order.update({ where: { id: orderId }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
  await transitionGame(c, order.gameId, "REFUNDED", actor, { orderId, providerRefundId: res.providerRefundId });
  return { ok: true };
}

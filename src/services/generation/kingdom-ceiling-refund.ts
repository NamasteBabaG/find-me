import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "../container";
import { SYSTEM } from "../audit.service";
import { statusOf, transitionGame } from "../game-status";
import { canTransition } from "../../domain/order-state";
import { sendAdminAlert } from "../admin-alert.service";
import { gameRefundedEmail } from "../email/templates";
import { routeMail } from "../email/fallback";
import type { RefundStatus } from "../../infra/payment/types";

/**
 * kingdom-ceiling-refund/v1 (kingdom-generation/v6, review QAV6-02). The refund a world closed at its ceiling owes, and
 * the parent's notice, as durable records written with the close itself and advanced by any worker (the closing slice,
 * a named tick, the cron sweep) until each reaches a decided state.
 *
 * Money rules: an attempt is recorded ("sending") BEFORE the provider is asked; an attempt whose outcome is unknown
 * (a crash, a timeout, a lost response) is reconciled from the provider's own refund status before anything is sent
 * again, and an unknown status never authorizes a second refund. "confirmed" is written only from the provider's answer
 * (or an order already REFUNDED by its webhook). A refused or unresolvable refund is handed to a person with an alert.
 */
export const CEILING_REFUND_VERSION = "kingdom-ceiling-refund/v1" as const;
const REFUND_ACTION = "local-patch:ceiling-refund", NOTICE_ACTION = "local-patch:ceiling-notice";
export const ceilingRefundId = (gameId: string) => `aud_ceiling_refund_${gameId}`;
export const ceilingNoticeId = (gameId: string) => `aud_ceiling_notice_${gameId}`;
/** An attempt's own window: longer than any one function invocation (maxDuration 600 s) plus the adapter's call timeout.
 * While it runs, no other worker touches the attempt, whether or not the first worker's call has returned (QAV6-04). */
export const CEILING_REFUND_ATTEMPT_WINDOW_MS = 15 * 60_000;
/** A definitive "not-refunded" authorizes another attempt only once the previous one is at least this old. */
export const CEILING_REFUND_SETTLE_MS = 30 * 60_000;
export const CEILING_REFUND_MAX_ATTEMPTS = 2;
/** An uncertain refund keeps looking for positive proof: the provider is asked again on this period, for a day. */
export const CEILING_REFUND_RECHECK_MS = 10 * 60_000;
export const CEILING_REFUND_MAX_CHECKS = 144;
const NOTICE_LEASE_MS = 60_000, NOTICE_RETRY_MS = 60_000;
export const CEILING_NOTICE_MAX_ATTEMPTS = 3;

const refundSchema = z.object({ version: z.literal(CEILING_REFUND_VERSION), orderId: z.string().min(1), providerPaymentId: z.string(),
  amountAgorot: z.number().int().positive(), state: z.enum(["pending", "sending", "confirmed", "refused", "uncertain", "unresolved"]),
  attempts: z.number().int().min(0), leaseUntil: z.number().int().min(0), attemptStartedAt: z.number().int().min(0),
  checks: z.number().int().min(0), nextCheckAt: z.number().int().min(0), providerRefundId: z.string().nullable(),
  decidedAt: z.number().int().min(0).nullable() }).strict();
type Refund = z.infer<typeof refundSchema>;
const noticeSchema = z.object({ version: z.literal(CEILING_REFUND_VERSION), state: z.enum(["pending", "sending", "sent", "unknown", "cancelled"]),
  attempts: z.number().int().min(0), nextAttemptAt: z.number().int().min(0), leaseUntil: z.number().int().min(0),
  providerId: z.string().nullable() }).strict();
type Notice = z.infer<typeof noticeSchema>;
export type CeilingRefundState = "none" | "pending" | Refund["state"];

/** Inside the closing transaction: the refund owed for the world's paid order, recorded before the provider is asked. */
export async function recordCeilingRefund(tx: Prisma.TransactionClient, gameId: string): Promise<boolean> {
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { orders: true } });
  const order = game.orders.find(o => o.userId === game.ownerId && o.paymentStatus === "PAID" && o.paidAt && !o.refundedAt);
  if (!order) return false;
  const refund: Refund = { version: CEILING_REFUND_VERSION, orderId: order.id, providerPaymentId: order.providerPaymentId ?? "",
    amountAgorot: order.amountAgorot, state: "pending", attempts: 0, leaseUntil: 0, attemptStartedAt: 0, checks: 0, nextCheckAt: 0,
    providerRefundId: null, decidedAt: null };
  await tx.auditLog.create({ data: { id: ceilingRefundId(gameId), actorType: "SYSTEM", action: REFUND_ACTION, entityType: "Game", entityId: gameId,
    metaJson: JSON.stringify(refundSchema.parse(refund)) } });
  return true;
}

async function swap(c: Container, id: string, before: string, after: Refund | Notice): Promise<boolean> {
  return (await c.db.auditLog.updateMany({ where: { id, metaJson: before }, data: { metaJson: JSON.stringify(after) } })).count === 1;
}

async function handOff(c: Container, gameId: string, error: string) {
  await sendAdminAlert(c, { gameId, kind: "generation-failed", error }).catch(() => undefined);
}

/**
 * Advance this world's owed refund, then its parent notice, as far as they can go now. Never repeats a refund that may
 * have happened:
 * - positive proof (the order already REFUNDED by its webhook or a manual refund, or the provider's own "refunded")
 *   finishes ANY undecided record, uncertain, refused and unresolved included, without another refund (QAV6-03);
 * - an attempt inside its window belongs to the worker that started it, even if its call already returned (QAV6-04);
 * - after the window, only a definitive provider "not-refunded" at least CEILING_REFUND_SETTLE_MS after the last attempt
 *   began admits one more attempt (at most CEILING_REFUND_MAX_ATTEMPTS); anything else is uncertain: a person is told
 *   once, and the provider is asked again for positive proof every CEILING_REFUND_RECHECK_MS for a day.
 */
export async function advanceCeilingRefund(c: Container, gameId: string, now = Date.now()): Promise<CeilingRefundState> {
  const row = await c.db.auditLog.findUnique({ where: { id: ceilingRefundId(gameId) } });
  if (!row?.metaJson) return "none";
  const refund = refundSchema.parse(JSON.parse(row.metaJson));
  if (refund.state === "confirmed") { await advanceCeilingNotice(c, gameId, now); return "confirmed"; }
  const order = await c.db.order.findUniqueOrThrow({ where: { id: refund.orderId } });
  if (order.paymentStatus === "REFUNDED") return confirm(c, gameId, refund, row.metaJson, refund.providerRefundId, now);
  if (refund.state === "sending" && refund.leaseUntil > now) return "pending";
  if (refund.state === "refused" || refund.state === "unresolved") return refund.state;
  const status = async (): Promise<RefundStatus> => c.payment.refundStatus
    ? await c.payment.refundStatus(refund.providerPaymentId).catch((): RefundStatus => "unknown") : "unknown";
  if (refund.state === "uncertain") {
    if (refund.nextCheckAt > now) return "uncertain";
    if (await status() === "refunded") return confirm(c, gameId, refund, row.metaJson, refund.providerRefundId, now);
    const checks = refund.checks + 1, done = checks >= CEILING_REFUND_MAX_CHECKS;
    await swap(c, row.id, row.metaJson, { ...refund, state: done ? "unresolved" : "uncertain", checks, nextCheckAt: done ? 0 : now + CEILING_REFUND_RECHECK_MS });
    return done ? "unresolved" : "uncertain";
  }
  if (refund.state === "sending") {
    // The attempt's window has passed: no worker of ours can still be executing it. Know its outcome before anything else.
    const known = await status();
    if (known === "refunded") return confirm(c, gameId, refund, row.metaJson, refund.providerRefundId, now);
    const settled = now - refund.attemptStartedAt >= CEILING_REFUND_SETTLE_MS;
    if (known === "not-refunded" && !settled) return "pending";
    if (known !== "not-refunded" || refund.attempts >= CEILING_REFUND_MAX_ATTEMPTS) {
      if (await swap(c, row.id, row.metaJson, { ...refund, state: "uncertain", leaseUntil: 0, decidedAt: now, nextCheckAt: now + CEILING_REFUND_RECHECK_MS }))
        await handOff(c, gameId, "תקרת $7: ניסיון ההחזר האוטומטי הסתיים בלי תשובה ידועה מספק התשלום. יש לבדוק אצל הספק אם ההחזר בוצע, לפני כל החזר ידני.");
      return "uncertain";
    }
  }
  const sending: Refund = { ...refund, state: "sending", attempts: refund.attempts + 1, attemptStartedAt: now, leaseUntil: now + CEILING_REFUND_ATTEMPT_WINDOW_MS };
  if (!await swap(c, row.id, row.metaJson, sending)) return "pending";
  const claimed = JSON.stringify(sending);
  let answer: { ok: boolean; providerRefundId?: string };
  try { answer = await c.payment.refund(refund.providerPaymentId, refund.amountAgorot); }
  catch {
    // Outcome unknown (timeout, lost response). The attempt keeps its window: the provider may still finish it.
    return "pending";
  }
  if (!answer.ok) {
    if (await swap(c, row.id, claimed, { ...sending, state: "refused", leaseUntil: 0, decidedAt: now }))
      await handOff(c, gameId, "תקרת $7: ספק התשלום סירב להחזר האוטומטי. יש להחזיר ידנית מהאדמין.");
    return "refused";
  }
  return confirm(c, gameId, sending, claimed, answer.providerRefundId ?? null, now);
}

async function confirm(c: Container, gameId: string, refund: Refund, before: string, providerRefundId: string | null, now: number): Promise<CeilingRefundState> {
  const confirmed = await c.db.$transaction(async tx => {
    const done = await tx.auditLog.updateMany({ where: { id: ceilingRefundId(gameId), metaJson: before },
      data: { metaJson: JSON.stringify({ ...refund, state: "confirmed", leaseUntil: 0, providerRefundId, decidedAt: now } satisfies Refund) } });
    if (done.count !== 1) return false;
    await tx.order.updateMany({ where: { id: refund.orderId, paymentStatus: "PAID" }, data: { paymentStatus: "REFUNDED", refundedAt: new Date(now) } });
    const status = statusOf(await tx.game.findUniqueOrThrow({ where: { id: gameId }, select: { status: true } }));
    if (status !== "REFUNDED" && canTransition(status, "REFUNDED"))
      await transitionGame(c, gameId, "REFUNDED", SYSTEM, { orderId: refund.orderId, providerRefundId, policy: CEILING_REFUND_VERSION }, tx);
    const notice: Notice = { version: CEILING_REFUND_VERSION, state: "pending", attempts: 0, nextAttemptAt: 0, leaseUntil: 0, providerId: null };
    await tx.auditLog.upsert({ where: { id: ceilingNoticeId(gameId) }, update: {}, create: { id: ceilingNoticeId(gameId), actorType: "SYSTEM",
      action: NOTICE_ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(notice) } });
    return true;
  });
  if (!confirmed) return "pending";
  await sendAdminAlert(c, { gameId, kind: "ceiling-refunded" }).catch(() => undefined);
  await advanceCeilingNotice(c, gameId, now);
  return "confirmed";
}

/** The parent's "refunded" notice: at most three transport attempts, one stable idempotency key, then a person is told. */
export async function advanceCeilingNotice(c: Container, gameId: string, now = Date.now()): Promise<Notice["state"] | "none"> {
  const row = await c.db.auditLog.findUnique({ where: { id: ceilingNoticeId(gameId) } });
  if (!row?.metaJson) return "none";
  const notice = noticeSchema.parse(JSON.parse(row.metaJson));
  if (notice.state !== "pending" && notice.state !== "sending") return notice.state;
  if (notice.nextAttemptAt > now || notice.state === "sending" && notice.leaseUntil > now) return notice.state;
  if (notice.attempts >= CEILING_NOTICE_MAX_ATTEMPTS) {
    if (await swap(c, row.id, row.metaJson, { ...notice, state: "unknown", leaseUntil: 0 }))
      await sendAdminAlert(c, { gameId, kind: "ceiling-notice-failed" }).catch(() => undefined);
    return "unknown";
  }
  const game = await c.db.game.findUnique({ where: { id: gameId }, include: { owner: { select: { email: true } }, childProfile: true } });
  const routed = game && !game.deletedAt ? routeMail(gameRefundedEmail({ to: game.owner?.email ?? "", childName: game.childProfile?.displayName ?? "",
    locale: game.locale === "he" ? "he" : "en" }), c.emailFallbackTo) : null;
  if (!routed) { await swap(c, row.id, row.metaJson, { ...notice, state: "cancelled", leaseUntil: 0 }); return "cancelled"; }
  const sending: Notice = { ...notice, state: "sending", attempts: notice.attempts + 1, leaseUntil: now + NOTICE_LEASE_MS };
  if (!await swap(c, row.id, row.metaJson, sending)) return notice.state;
  const claimed = JSON.stringify(sending);
  try {
    const receipt = await c.email.send({ ...routed.message, idempotencyKey: `game-refunded:${gameId}` });
    await swap(c, row.id, claimed, { ...sending, state: "sent", leaseUntil: 0, providerId: receipt.id });
    return "sent";
  } catch {
    await swap(c, row.id, claimed, { ...sending, state: "pending", leaseUntil: 0, nextAttemptAt: now + NOTICE_RETRY_MS });
    return "pending";
  }
}

/** Cron sweep: every owed refund or notice not yet decided, oldest first, within the deadline. */
export async function resumeKingdomCeilingRefunds(c: Container, options: { deadlineAt?: number; limit?: number } = {}): Promise<number> {
  const rows = await c.db.auditLog.findMany({ where: { action: { in: [REFUND_ACTION, NOTICE_ACTION] },
    OR: [{ metaJson: { contains: '"state":"pending"' } }, { metaJson: { contains: '"state":"sending"' } }, { metaJson: { contains: '"state":"uncertain"' } }] },
    orderBy: { createdAt: "asc" }, take: options.limit ?? 20, select: { entityId: true } });
  let advanced = 0;
  for (const gameId of new Set(rows.map(r => r.entityId))) {
    if (options.deadlineAt !== undefined && options.deadlineAt - Date.now() < 10_000) break;
    try { await advanceCeilingRefund(c, gameId); advanced++; } catch { console.error("[ceiling-refund] advance failed", { gameId }); }
  }
  return advanced;
}

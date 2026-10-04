import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "./container";
import { sendAdminAlert } from "./admin-alert.service";
import { GENERATION_STALE_MS } from "@/domain/generation-health";

const ACTION = "generation:health-alert";
const PAGE_SIZE = 50;
const SEND_LIMIT = 5;
const LEASE_MS = 60_000;
const HISTORY_PAGE_SIZE = 100;
const ACTIVE_STATUSES = ["PAID", "AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING", "NEEDS_REGENERATION", "GENERATION_FAILED", "QA_PENDING", "MANUAL_REVIEW", "APPROVED"];
export const GENERATION_ALERT_FRESH_MS = 24 * 60 * 60_000;
type Claim = { state: "sending" | "pending" | "done"; leaseUntil: number; nextAttemptAt: number };
type Candidate = { id: string; status: string; updatedAt: Date; paidAt: Date | null;
  jobs: Array<{ status: string; currentStep: string | null; updatedAt: Date }> };
type HealthCandidate = Candidate & { deletedAt: Date | null;
  orders: Array<{ paymentStatus: string; paidAt: Date | null; refundedAt: Date | null }> };

/** No private error text, inferred spending grant, image approval or status mutation. */
export function generationConcern(game: Candidate, now: number): string | null {
  const job = game.jobs[0];
  if (job?.currentStep === "local-patch:needs-release") return "Generation is held by an unresolved operation or accounting record.";
  if (job?.currentStep === "local-patch:recovery-budget-wait") return "Automatic generation is waiting for authorized service budget capacity.";
  if (game.status === "MANUAL_REVIEW") return "Paid generation needs a service investigation; it is not a parent approval request.";
  const lastActivity = job?.updatedAt ?? game.paidAt ?? game.updatedAt;
  return now - lastActivity.getTime() >= GENERATION_STALE_MS ? "Paid preparation has recorded no generation activity for at least 30 minutes." : null;
}

/** The sweep and delayed sender must use the same fresh, verified payment and
 * live generation evidence. An old unresolved order is not a recurring notice. */
export function generationHealthConcern(game: HealthCandidate, now: number): string | null {
  if (game.deletedAt || !ACTIVE_STATUSES.includes(game.status)
    || game.orders.some(order => order.paymentStatus === "REFUNDED" || order.refundedAt)
    || !game.orders.some(order => order.paymentStatus === "PAID" && order.paidAt
      && order.paidAt.getTime() >= now - GENERATION_ALERT_FRESH_MS && order.paidAt.getTime() <= now)) return null;
  return generationConcern(game, now);
}

function claimId(gameId: string): string {
  return `aud_ghealth_${createHash("sha256").update(gameId).digest("hex").slice(0, 40)}`;
}

function metadata(value: string | null): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/** Paginate historical evidence without truncating it into a false "unsent".
 * If time runs out, unchecked games wait; successful legacy incidents never
 * become new notices merely because the claim format changed on deployment. */
async function previousNotices(c: Container, gameIds: string[], deadlineAt: number): Promise<{ notified: Set<string>; stableDone: Set<string>; complete: boolean }> {
  const notified = new Set<string>(), stableDone = new Set<string>();
  let cursor: string | undefined;
  while (deadlineAt - Date.now() >= 4_000) {
    const rows = await c.db.auditLog.findMany({
      where: { entityType: "Game", entityId: { in: gameIds }, action: { in: [ACTION, "admin-alert:generation-stalled", "admin-alert:notification-sent"] } },
      orderBy: { id: "asc" }, take: HISTORY_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { id: true, entityId: true, action: true, metaJson: true },
    });
    for (const row of rows) {
      const meta = metadata(row.metaJson);
      const success = row.action === ACTION ? meta?.state === "done"
        : row.action === "admin-alert:generation-stalled" ? Array.isArray(meta?.sentTo) && meta.sentTo.some(to => typeof to === "string" && to.trim())
        : meta?.version === "admin-alert-notification/v1" && meta.kind === "generation-stalled" && meta.state === "sent";
      if (!success) continue;
      notified.add(row.entityId);
      if (row.action === ACTION && row.id === claimId(row.entityId)) stableDone.add(row.entityId);
    }
    if (rows.length < HISTORY_PAGE_SIZE || notified.size === gameIds.length) return { notified, stableDone, complete: true };
    cursor = rows.at(-1)!.id;
  }
  return { notified, stableDone, complete: false };
}

async function seedDoneClaim(c: Container, gameId: string): Promise<void> {
  const id = claimId(gameId), metaJson = JSON.stringify({ state: "done", leaseUntil: 0, nextAttemptAt: 0 } satisfies Claim);
  await c.db.auditLog.upsert({ where: { id },
    create: { id, actorType: "SYSTEM", action: ACTION, entityType: "Game", entityId: gameId, metaJson },
    update: { metaJson },
  });
}

/** A bounded cron sweep discovers stalled games, not only alerts already emitted.
 * One durable claim per game suppresses overlapping workers and clock rollover.
 * The sender owns bounded recipient retries. No generation row is modified. */
export async function alertStalledGeneration(c: Container, options: { deadlineAt?: number } = {}): Promise<{ attempted: number }> {
  const deadlineAt = Math.min(options.deadlineAt ?? Infinity, Date.now() + 15_000);
  let attempted = 0;
  if (!c.adminEmails?.length) return { attempted };
  const passAt = new Date(Date.now());
  let cursor: string | undefined;
  try {
    while (deadlineAt - Date.now() >= 4_000 && attempted < SEND_LIMIT) {
      const rows = await c.db.game.findMany({
        where: { deletedAt: null, status: { in: ACTIVE_STATUSES },
          orders: { some: { paymentStatus: "PAID", paidAt: { gte: new Date(passAt.getTime() - GENERATION_ALERT_FRESH_MS), lte: passAt }, refundedAt: null },
            none: { OR: [{ paymentStatus: "REFUNDED" }, { refundedAt: { not: null } }] } }, createdAt: { lte: passAt } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, status: true, updatedAt: true, paidAt: true, deletedAt: true,
          orders: { select: { paymentStatus: true, paidAt: true, refundedAt: true } },
          jobs: { select: { status: true, currentStep: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
      });
      const concerns = rows.flatMap(game => {
        const reason = generationHealthConcern(game, passAt.getTime());
        return reason ? [{ game, reason }] : [];
      });
      const history = concerns.length ? await previousNotices(c, concerns.map(({ game }) => game.id), deadlineAt) : null;
      for (const { game, reason } of concerns) {
        if (deadlineAt - Date.now() < 4_000 || attempted >= SEND_LIMIT) break;
        if (history?.notified.has(game.id)) {
          if (!history.stableDone.has(game.id)) await seedDoneClaim(c, game.id);
          continue;
        }
        if (!history?.complete) continue;
        const id = claimId(game.id);
        const sending: Claim = { state: "sending", leaseUntil: Date.now() + LEASE_MS, nextAttemptAt: 0 };
        const metaJson = JSON.stringify(sending);
        try {
          await c.db.auditLog.create({ data: { id, actorType: "SYSTEM", action: ACTION, entityType: "Game", entityId: game.id, metaJson } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
          const previous = await c.db.auditLog.findUnique({ where: { id } });
          if (!previous?.metaJson) continue;
          const claim = metadata(previous.metaJson);
          if (!claim || !["sending", "pending"].includes(String(claim.state))
            || typeof claim.leaseUntil !== "number" || typeof claim.nextAttemptAt !== "number"
            || !Number.isFinite(claim.leaseUntil) || !Number.isFinite(claim.nextAttemptAt)
            || claim.leaseUntil > Date.now() || claim.nextAttemptAt > Date.now()) continue;
          const won = await c.db.auditLog.updateMany({ where: { id, action: ACTION, metaJson: previous.metaJson }, data: { metaJson } });
          if (won.count !== 1) continue;
        }
        attempted++;
        const result = await sendAdminAlert(c, { gameId: game.id, kind: "generation-stalled", problems: [reason] }, { deadlineAt });
        const recorded = result.failed.length === 0 && result.sent.length + result.skipped.length > 0;
        const outcome: Claim = { state: recorded ? "done" : "pending", leaseUntil: 0, nextAttemptAt: recorded ? 0 : Date.now() + 60_000 };
        await c.db.auditLog.updateMany({ where: { id, action: ACTION, metaJson }, data: { metaJson: JSON.stringify(outcome) } });
      }
      if (rows.length < PAGE_SIZE) break;
      cursor = rows.at(-1)!.id;
    }
  } catch {
    // Health monitoring must not consume the paid generation request or expose
    // a raw database/provider error in logs. An expired intent retries later.
    console.error("[generation-health] bounded alert sweep failed");
  }
  return { attempted };
}

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Container } from "./container";
import { sendAdminAlert, ALERT_ONCE_MS } from "./admin-alert.service";
import { GENERATION_STALE_MS } from "@/domain/generation-health";

const ACTION = "generation:health-alert";
const PAGE_SIZE = 50;
const SEND_LIMIT = 5;
const LEASE_MS = 60_000;
type Claim = { state: "sending" | "pending" | "done"; leaseUntil: number; nextAttemptAt: number };
type Candidate = { id: string; status: string; updatedAt: Date; paidAt: Date | null;
  jobs: Array<{ status: string; currentStep: string | null; updatedAt: Date }> };

/** No private error text, inferred spending grant, image approval or status mutation. */
export function generationConcern(game: Candidate, now: number): string | null {
  const job = game.jobs[0];
  if (job?.currentStep === "local-patch:needs-release") return "Generation is held by an unresolved operation or accounting record.";
  if (job?.currentStep === "local-patch:recovery-budget-wait") return "Automatic generation is waiting for authorized service budget capacity.";
  if (game.status === "MANUAL_REVIEW") return "Paid generation needs a service investigation; it is not a parent approval request.";
  const lastActivity = job?.updatedAt ?? game.paidAt ?? game.updatedAt;
  return now - lastActivity.getTime() >= GENERATION_STALE_MS ? "Paid preparation has recorded no generation activity for at least 30 minutes." : null;
}

/** A bounded cron sweep discovers stalled games, not only alerts already emitted.
 * Durable six-hour claims suppress overlapping workers. Provider failures still
 * use the existing recipient-aware alert retry. No generation row is modified. */
export async function alertStalledGeneration(c: Container, options: { deadlineAt?: number } = {}): Promise<{ attempted: number }> {
  const deadlineAt = Math.min(options.deadlineAt ?? Infinity, Date.now() + 15_000);
  let attempted = 0;
  if (!c.adminEmails?.length) return { attempted };
  const passAt = new Date();
  let cursor: string | undefined;
  try {
    while (deadlineAt - Date.now() >= 4_000 && attempted < SEND_LIMIT) {
      const rows = await c.db.game.findMany({
        where: { deletedAt: null, status: { in: ["PAID", "AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING", "NEEDS_REGENERATION", "GENERATION_FAILED", "QA_PENDING", "MANUAL_REVIEW", "APPROVED"] },
          orders: { some: { paymentStatus: "PAID", paidAt: { not: null }, refundedAt: null },
            none: { OR: [{ paymentStatus: "REFUNDED" }, { refundedAt: { not: null } }] } }, createdAt: { lte: passAt } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, status: true, updatedAt: true, paidAt: true,
          jobs: { select: { status: true, currentStep: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 } },
      });
      for (const game of rows) {
        if (deadlineAt - Date.now() < 4_000 || attempted >= SEND_LIMIT) break;
        const reason = generationConcern(game, passAt.getTime());
        if (!reason) continue;
        const id = `aud_ghealth_${createHash("sha256").update(`${game.id}:${Math.floor(passAt.getTime() / ALERT_ONCE_MS)}`).digest("hex").slice(0, 40)}`;
        const sending: Claim = { state: "sending", leaseUntil: Date.now() + LEASE_MS, nextAttemptAt: 0 };
        const metaJson = JSON.stringify(sending);
        try {
          await c.db.auditLog.create({ data: { id, actorType: "SYSTEM", action: ACTION, entityType: "Game", entityId: game.id, metaJson } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
          const previous = await c.db.auditLog.findUnique({ where: { id } });
          if (!previous?.metaJson) continue;
          const claim = JSON.parse(previous.metaJson) as Claim;
          if (claim.state === "done" || claim.leaseUntil > Date.now() || claim.nextAttemptAt > Date.now()) continue;
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

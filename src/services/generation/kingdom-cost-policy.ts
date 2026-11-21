import type { Prisma } from "@prisma/client";
import type { Container } from "../container";
import { SYSTEM } from "../audit.service";
import { sendAdminAlert } from "../admin-alert.service";
import { transitionGame } from "../game-status";
import { boardWizardBudgetOf, boardWizardWorldId } from "./board-conditioned-wizard";
import { worldCostPolicyOf } from "./world-cost-rule";
import { advanceCeilingRefund, recordCeilingRefund, type CeilingRefundState } from "./kingdom-ceiling-refund";
import { LOCAL_PATCH_CEILING_CLOSED } from "../../domain/generation/kingdom-ceiling";
export { LOCAL_PATCH_CEILING_CLOSED };
const usd = (micro: number) => `$${(micro / 1_000_000).toFixed(2)}`;

/**
 * Once per world and admin, tell the service that committed spend (settled + every pending and UNKNOWN
 * reservation) passed the v6 alert line. Information only: it never stops, parks or slows the world.
 * True when the line is passed (whether or not this call was the one that sent the notice).
 */
export async function noticeKingdomCostAboveAlert(c: Container, gameId: string, options: { deadlineAt?: number } = {}): Promise<boolean> {
  const policy = await worldCostPolicyOf(c.db, gameId);
  if (!policy) return false;
  const budget = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
  if (budget.committedMicroUsd <= policy.alertAboveMicroUsd) return false;
  await sendAdminAlert(c, { gameId, kind: "cost-above-alert", problems: [
    `מחויב עד עכשיו: ${usd(budget.committedMicroUsd)} (כולל רזרבות פתוחות), סף התראה ${usd(policy.alertAboveMicroUsd)}, תקרה ${usd(policy.ceilingMicroUsd)}.`,
    policy.ceilingOutcome === "hold" ? `בתקרה העולם נעצר ומחכה לך, בלי החזר אוטומטי.` : `בתקרה העולם נסגר וההזמנה מוחזרת אוטומטית.`,
  ] }, options);
  return true;
}

export type KingdomCeilingOutcome = { readonly closed: true; readonly refunded: boolean; readonly reason: string };

/**
 * The hard ceiling: nothing in flight can return capacity and the next required purchase does not fit. The world closes
 * (GENERATION_FAILED, job local-patch:ceiling-closed); nothing more is bought for it.
 * - v6 ($7, `refund`): in the SAME transaction the refund it owes is recorded (kingdom-ceiling-refund/v1); that record is
 *   then advanced here and by any later worker until the provider decides it, and the parent notice follows through its
 *   own durable outbox (review QAV6-02).
 * - v7 ($6, `hold`, Guy 2026-11-20): stopped and held for a person. No refund is recorded and the parent is not written
 *   to; the service is told at once, so a person can try to save the world or refund it from the admin.
 * - world-cost-rule/v1 (a new Explorer or Journey Detective world): exactly the v7 hold at $6.
 *
 * The customer outcome is separate from supplier accounting (review QAV6-01): every UNKNOWN reservation and receipt stays
 * exactly as it is, counted in full, for reconciliation with the image/review provider; closing never releases it.
 * Null for every pin before v6: those keep their historical park.
 */
export async function closeKingdomWorldAtCeiling(c: Container, gameId: string, jobId: string, reason: string,
  fence: (tx: Prisma.TransactionClient) => Promise<void>): Promise<KingdomCeilingOutcome | null> {
  const policy = await worldCostPolicyOf(c.db, gameId);
  if (!policy) return null;
  const budget = await boardWizardBudgetOf(c).audit(boardWizardWorldId(gameId));
  const unknown = budget.unknownRequestKeys.length;
  const hold = policy.ceilingOutcome === "hold";
  const closing = `${reason} ${policy.version}: the world ${hold ? "stopped" : "closed"} at its ${usd(policy.ceilingMicroUsd)} ceiling `
    + `(${usd(budget.committedMicroUsd)} committed${unknown ? `, ${unknown} of unknown outcome kept in full for supplier reconciliation` : ""}); `
    + (hold ? "held for a person: no automatic refund." : "the order is refunded automatically.");
  const owed = await c.db.$transaction(async tx => {
    await fence(tx);
    await transitionGame({ ...c, db: tx as Container["db"] }, gameId, "GENERATION_FAILED", SYSTEM, { reason: closing });
    // A held world keeps whatever it has, so a person can still save it; a refunded one is gone.
    await tx.game.update({ where: { id: gameId }, data: { lastError: closing.slice(0, 500), ...(hold ? {} : { configJson: null }) } });
    await tx.generationJob.update({ where: { id: jobId }, data: { status: "FAILED", currentStep: LOCAL_PATCH_CEILING_CLOSED, lastError: closing.slice(0, 500) } });
    await tx.auditLog.create({ data: { id: `aud_ceiling_closed_${gameId}`, actorType: "SYSTEM", action: "local-patch:ceiling-closed/v1", entityType: "Game", entityId: gameId,
      metaJson: JSON.stringify({ version: "kingdom-ceiling-close/v1", committedMicroUsd: budget.committedMicroUsd,
        settledMicroUsd: budget.settledMicroUsd, ceilingMicroUsd: policy.ceilingMicroUsd, unknownRequestKeys: budget.unknownRequestKeys, providerCalls: 0,
        ...(hold ? { outcome: "hold" } : {}) }) } });
    return hold ? false : recordCeilingRefund(tx, gameId);
  });
  if (hold) {
    await sendAdminAlert(c, { gameId, kind: "ceiling-held", problems: [
      `מחויב: ${usd(budget.committedMicroUsd)} (כולל רזרבות פתוחות${unknown ? `, ${unknown} בתוצאה לא ידועה` : ""}), תקרה ${usd(policy.ceilingMicroUsd)}.`,
    ] }).catch(() => undefined);
    return { closed: true, refunded: false, reason: closing };
  }
  if (!owed) {
    await sendAdminAlert(c, { gameId, kind: "generation-failed", error: "הגיע לתקרת $7 ונסגר, אבל אין הזמנה ששולמה להחזיר. יש לבדוק באדמין." }).catch(() => undefined);
    return { closed: true, refunded: false, reason: closing };
  }
  const state = await advanceCeilingRefund(c, gameId).catch((): CeilingRefundState => "pending");
  return { closed: true, refunded: state === "confirmed", reason: closing };
}

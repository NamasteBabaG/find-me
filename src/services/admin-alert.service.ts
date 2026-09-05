import type { Container } from "./container";
import { audit, SYSTEM } from "./audit.service";
import { statusOf } from "./game-status";
import { failedSpotsForAdmin, generationCostCents } from "./admin.service";
import { adminAlertEmail, type AdminAlertKind } from "./email/templates";

/**
 * Tell the admins about a game that needs a look, without holding it back.
 *
 * With no human gate (QA_AUTO_APPROVE) a finished game goes to the parent the
 * moment it is done, problems and all; this is the other half of that bargain.
 * One mail per admin, sent right after the parent's, with what went wrong,
 * which hiding spots did not come out and why, what it cost, and the way in.
 *
 * A mail that fails is logged and audited, never thrown: the parent already
 * has the game, and an alert must not undo that. And a crash that the next
 * tick repeats must not repeat the alert — one per game, per kind, per six
 * hours, decided by the audit log the same way the resend button is.
 */
export const ALERT_ONCE_MS = 6 * 60 * 60 * 1000;

export async function sendAdminAlert(
  c: Container,
  input: { gameId: string; kind: AdminAlertKind; problems?: string[]; error?: string },
): Promise<{ sent: number; throttled: boolean }> {
  const admins = c.adminEmails ?? [];
  const action = `admin-alert:${input.kind}`;
  if (admins.length === 0) {
    console.warn(`[admin-alert] ${input.gameId}: ${input.kind}, but ADMIN_EMAILS is empty — nobody to tell`);
    return { sent: 0, throttled: false };
  }
  const recent = await c.db.auditLog.findFirst({ where: { action, entityType: "Game", entityId: input.gameId, createdAt: { gt: new Date(Date.now() - ALERT_ONCE_MS) } } });
  if (recent) return { sent: 0, throttled: true };

  const game = await c.db.game.findUniqueOrThrow({ where: { id: input.gameId }, include: { childProfile: true, owner: { select: { email: true } }, scenes: true } });
  const failed = await failedSpotsForAdmin(c, input.gameId).catch(() => []);
  const costCents = await generationCostCents(c, input.gameId).catch(() => 0);
  const mail = adminAlertEmail({
    kind: input.kind,
    gameId: input.gameId,
    adminUrl: `${c.appUrl}/admin/orders/${input.gameId}`,
    childName: game.childProfile?.displayName ?? "",
    ownerEmail: game.owner?.email ?? null,
    status: statusOf(game),
    sceneCount: game.scenes.length,
    problems: input.problems ?? [],
    failedSpots: failed.map((f) => ({ where: `${f.sceneSlug}/${f.targetId}/${f.variant}`, attempts: f.attempts, reason: f.lastError ?? "" })),
    costCents,
    error: input.error,
  });
  let sent = 0;
  for (const to of admins) {
    try {
      await c.email.send({ ...mail, to });
      sent++;
    } catch (err) {
      console.error(`[admin-alert] ${input.gameId}: could not mail ${to}:`, err instanceof Error ? err.message : err);
    }
  }
  await audit(c, SYSTEM, action, "Game", input.gameId, { sent, admins: admins.length, problems: input.problems?.slice(0, 10), error: input.error?.slice(0, 200) });
  return { sent, throttled: false };
}

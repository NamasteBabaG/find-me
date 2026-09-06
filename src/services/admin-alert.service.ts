import type { Container } from "./container";
import { audit, SYSTEM } from "./audit.service";
import { statusOf } from "./game-status";
import { failedSpotsForAdmin, generationCostCents } from "./admin.service";
import { adminAlertEmail, type AdminAlertKind } from "./email/templates";

/**
 * Tell the admins about a game that needs a look, without holding it back.
 *
 * With no human gate (QA_AUTO_APPROVE on a QA box) a finished game goes to the
 * parent the moment it is done, problems and all; this is the other half of
 * that bargain. One mail per admin, sent right after the parent's, with what
 * went wrong, which hiding spots did not come out and why, what it cost, and
 * the way in. A game held for a person gets the same mail, so the person
 * knows.
 *
 * Nothing here ever throws: the parent already has the game, and an alert
 * must not undo that. A mail that failed is audited as failed and tried
 * again on the next call or the next cron tick; only a mail that was actually
 * sent counts against the six-hour repeat, per recipient. The first version
 * audited the attempt and read that back as "already sent", so one bad
 * afternoon at the mail provider silenced the alert for six hours.
 */
export const ALERT_ONCE_MS = 6 * 60 * 60 * 1000;
/** How far back a failed alert is still worth retrying. */
export const ALERT_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface AdminAlertInput {
  gameId: string;
  kind: AdminAlertKind;
  problems?: string[];
  error?: string;
}

export interface AdminAlertOutcome {
  /** Recipients the mail reached this time. */
  sent: string[];
  /** Recipients the provider refused this time; they are tried again later. */
  failed: string[];
  /** Recipients who already had this alert within the window. */
  skipped: string[];
}

interface AlertMeta {
  sentTo?: string[];
  failedTo?: string[];
  problems?: string[];
  error?: string;
}

export async function sendAdminAlert(c: Container, input: AdminAlertInput): Promise<AdminAlertOutcome> {
  const outcome: AdminAlertOutcome = { sent: [], failed: [], skipped: [] };
  const admins = c.adminEmails ?? [];
  const action = `admin-alert:${input.kind}`;
  try {
    if (admins.length === 0) {
      console.warn(`[admin-alert] ${input.gameId}: ${input.kind}, but ADMIN_EMAILS is empty — nobody to tell`);
      return outcome;
    }
    // Who already got this one. Only a mail that went out counts.
    const recent = await c.db.auditLog.findMany({
      where: { action, entityType: "Game", entityId: input.gameId, createdAt: { gt: new Date(Date.now() - ALERT_ONCE_MS) } },
      select: { metaJson: true },
    });
    const already = new Set<string>();
    for (const row of recent) for (const to of parseMeta(row.metaJson).sentTo ?? []) already.add(to);
    const due = admins.filter((to) => !already.has(to));
    outcome.skipped.push(...admins.filter((to) => already.has(to)));
    if (due.length === 0) return outcome;

    const game = await c.db.game.findUniqueOrThrow({ where: { id: input.gameId }, include: { childProfile: true, owner: { select: { email: true } }, scenes: true } });
    const failedSpots = await failedSpotsForAdmin(c, input.gameId).catch(() => []);
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
      failedSpots: failedSpots.map((f) => ({ where: `${f.sceneSlug}/${f.targetId}/${f.variant}`, attempts: f.attempts, reason: f.lastError ?? "" })),
      costCents,
      error: input.error,
    });
    for (const to of due) {
      try {
        await c.email.send({ ...mail, to });
        outcome.sent.push(to);
      } catch (err) {
        outcome.failed.push(to);
        console.error(`[admin-alert] ${input.gameId}: could not mail ${to}:`, err instanceof Error ? err.message : err);
      }
    }
    const meta: AlertMeta = { sentTo: outcome.sent, failedTo: outcome.failed, problems: input.problems?.slice(0, 10), error: input.error?.slice(0, 200) };
    // Sent and failed are separate records, so a failure can be found and retried
    // and never reads as "already sent".
    if (outcome.sent.length > 0) await audit(c, SYSTEM, action, "Game", input.gameId, { ...meta });
    if (outcome.failed.length > 0) await audit(c, SYSTEM, `${action}:failed`, "Game", input.gameId, { ...meta });
  } catch (err) {
    console.error(`[admin-alert] ${input.gameId}: ${input.kind} could not be sent:`, err instanceof Error ? err.message : err);
  }
  return outcome;
}

/**
 * Try again for every alert that failed to reach someone in the last day.
 * Runs from the cron tick beside retention; each retry goes through the same
 * per-recipient check, so a recipient who was reached meanwhile is skipped.
 */
export async function retryFailedAdminAlerts(c: Container): Promise<{ retried: number }> {
  let retried = 0;
  try {
    const rows = await c.db.auditLog.findMany({
      where: { action: { endsWith: ":failed" }, entityType: "Game", createdAt: { gt: new Date(Date.now() - ALERT_RETRY_WINDOW_MS) } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { action: true, entityId: true, metaJson: true },
    });
    const seen = new Set<string>();
    for (const row of rows) {
      const kind = row.action.replace(/^admin-alert:/, "").replace(/:failed$/, "") as AdminAlertKind;
      const key = `${row.entityId}:${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const meta = parseMeta(row.metaJson);
      const outcome = await sendAdminAlert(c, { gameId: row.entityId, kind, problems: meta.problems, error: meta.error });
      if (outcome.sent.length > 0) retried++;
    }
  } catch (err) {
    console.error("[admin-alert] retry pass failed:", err instanceof Error ? err.message : err);
  }
  return { retried };
}

function parseMeta(json: string | null | undefined): AlertMeta {
  if (!json) return {};
  try {
    return JSON.parse(json) as AlertMeta;
  } catch {
    return {};
  }
}

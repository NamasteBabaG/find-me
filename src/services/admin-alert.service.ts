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
 * sent counts against the six-hour repeat, per recipient. Cron retries resolve
 * each recipient's failure against later successes, even after six hours.
 * They are not reminders for an alert that already arrived. The first version
 * audited the attempt and read that back as "already sent", so one bad
 * afternoon at the mail provider silenced the alert for six hours.
 */
export const ALERT_ONCE_MS = 6 * 60 * 60 * 1000;
/** How far back a failed alert is still worth retrying. */
export const ALERT_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RETRY_PAGE_SIZE = 100;
const RETRY_LIMIT = 20;
const FAILURE_KINDS = new Map<string, AdminAlertKind>(
  (["delivered-with-problems", "held-for-review", "generation-failed", "needs-new-photo"] as const)
    .map((kind) => [`admin-alert:${kind}:failed`, kind]),
);
const RETRY_ACTIONS = [...FAILURE_KINDS.keys(), ...[...FAILURE_KINDS.keys()].map((action) => action.replace(/:failed$/, ""))];

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
  return sendAlert(c, input);
}

/** A retry carries only the recipients who failed, and when each last failed. */
async function sendAlert(c: Container, input: AdminAlertInput, retryFailures?: Map<string, Date>): Promise<AdminAlertOutcome> {
  const outcome: AdminAlertOutcome = { sent: [], failed: [], skipped: [] };
  const admins = [...new Set(c.adminEmails ?? [])].filter((to) => !retryFailures || retryFailures.has(to));
  const action = `admin-alert:${input.kind}`;
  try {
    if (admins.length === 0) {
      console.warn(`[admin-alert] ${input.gameId}: ${input.kind}, but ADMIN_EMAILS is empty — nobody to tell`);
      return outcome;
    }
    // New alerts use the six-hour throttle. For retries, a success after that
    // recipient's failed attempt resolves it permanently, not just for six hours.
    const throttleSince = Date.now() - ALERT_ONCE_MS;
    let since = throttleSince;
    if (retryFailures) for (const failedAt of retryFailures.values()) since = Math.min(since, failedAt.getTime());
    const recent = await c.db.auditLog.findMany({
      where: { action, entityType: "Game", entityId: input.gameId, createdAt: { gte: new Date(since) } },
      select: { metaJson: true, createdAt: true },
    });
    const already = new Set<string>();
    for (const row of recent) {
      for (const to of parseMeta(row.metaJson).sentTo ?? []) {
        const failedAt = retryFailures?.get(to);
        if (row.createdAt.getTime() > throttleSince || (failedAt && row.createdAt >= failedAt)) already.add(to);
      }
    }
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
 * Page through the day's outcomes BEFORE applying the send limit. One
 * game's repeated failures must not crowd another game out of a `take: 20`.
 * Group by game/kind, retaining each recipient's latest failure. Oldest last
 * attempt first gives unattempted games a turn when an outage spans >20 games.
 * Resolved groups do not consume the limit. This is an audit-backed retry, not
 * an atomic outbox: overlapping workers / a failed post-send audit can still
 * duplicate mail. The existing schema is unchanged.
 */
export async function retryFailedAdminAlerts(c: Container): Promise<{ retried: number }> {
  let retried = 0;
  try {
    const admins = new Set(c.adminEmails ?? []);
    if (admins.size === 0) return { retried };
    const passAt = new Date();
    const pending = new Map<string, { input: AdminAlertInput; failures: Map<string, Date>; successes: Map<string, Date>; lastAttempt: number }>();
    let cursor: string | undefined;
    while (true) {
      const rows = await c.db.auditLog.findMany({
        where: { action: { in: RETRY_ACTIONS }, entityType: "Game", createdAt: { gt: new Date(passAt.getTime() - ALERT_RETRY_WINDOW_MS), lte: passAt } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: RETRY_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, action: true, entityId: true, metaJson: true, createdAt: true },
      });
      for (const row of rows) {
        const failed = FAILURE_KINDS.has(row.action);
        const kind = FAILURE_KINDS.get(failed ? row.action : `${row.action}:failed`);
        if (!kind) continue;
        const meta = parseMeta(row.metaJson);
        const recipients = ((failed ? meta.failedTo : meta.sentTo) ?? []).filter((to) => admins.has(to));
        if (recipients.length === 0) continue;
        const key = JSON.stringify([row.entityId, kind]);
        const group = pending.get(key) ?? { input: { gameId: row.entityId, kind }, failures: new Map<string, Date>(), successes: new Map<string, Date>(), lastAttempt: 0 };
        if (failed) group.input = { gameId: row.entityId, kind, problems: meta.problems, error: meta.error };
        for (const to of recipients) (failed ? group.failures : group.successes).set(to, row.createdAt);
        pending.set(key, group);
      }
      if (rows.length < RETRY_PAGE_SIZE) break;
      cursor = rows[rows.length - 1]!.id;
    }
    // Resolve in bulk, rather than one database read per already-resolved game.
    // The send still rechecks for success that landed after this pass's snapshot.
    for (const [key, group] of pending) {
      for (const [to, failedAt] of group.failures) {
        const sentAt = group.successes.get(to);
        if (sentAt && sentAt >= failedAt) group.failures.delete(to);
        else group.lastAttempt = Math.max(group.lastAttempt, failedAt.getTime());
      }
      if (group.failures.size === 0) pending.delete(key);
    }
    let attempted = 0;
    for (const group of [...pending.values()].sort((a, b) => a.lastAttempt - b.lastAttempt)) {
      const outcome = await sendAlert(c, group.input, group.failures);
      if (outcome.sent.length > 0) retried++;
      if (outcome.sent.length + outcome.failed.length > 0 && ++attempted >= RETRY_LIMIT) break;
    }
  } catch (err) {
    console.error("[admin-alert] retry pass failed:", err instanceof Error ? err.message : err);
  }
  return { retried };
}

function parseMeta(json: string | null | undefined): AlertMeta {
  if (!json) return {};
  try {
    const meta: unknown = JSON.parse(json);
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
    const value = meta as Record<string, unknown>;
    const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((item): item is string => typeof item === "string") : [];
    return { sentTo: strings(value.sentTo), failedTo: strings(value.failedTo), problems: strings(value.problems), error: typeof value.error === "string" ? value.error : undefined };
  } catch {
    return {};
  }
}

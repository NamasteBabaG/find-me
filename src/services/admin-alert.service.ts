import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Container } from "./container";
import { audit, SYSTEM } from "./audit.service";
import { statusOf } from "./game-status";
import { failedSpotsForAdmin, generationCostForDisplay } from "./admin.service";
import { adminAlertEmail, type AdminAlertKind } from "./email/templates";
import type { EmailMessage } from "../infra/email/types";
import { deliverLocalPatchNotifications } from "./local-patch-notifications";
import { generationHealthConcern } from "./generation-health.service";
import { adminAlertNotificationPrefix } from "./admin-alert-deletion";
export { adminAlertNotificationPrefix } from "./admin-alert-deletion";

export const ALERT_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 60_000;
const RETRY_PAGE_SIZE = 100;
const RETRY_LIMIT = 20;
export const ADMIN_ALERT_PENDING_ACTION = "admin-alert:notification-pending";
const KINDS = ["delivered-with-problems", "held-for-review", "generation-failed", "needs-new-photo", "generation-stalled"] as const;
const SUCCESS_ACTIONS = KINDS.map(kind => `admin-alert:${kind}`);
const FAILURE_KINDS = new Map<string, AdminAlertKind>(KINDS.map(kind => [`admin-alert:${kind}:failed`, kind]));
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const recipients = (c: Container) => [...new Set((c.adminEmails ?? []).map(to => to.trim().toLowerCase()).filter(Boolean))];
const noticeId = (gameId: string, kind: AdminAlertKind, to: string) => {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) throw Error("ADMIN_ALERT: canonical game id required");
  return `aud_aan_${sha(JSON.stringify([gameId, kind, to])).slice(0, 40)}`;
};

const noticeSchema = z.object({
  version: z.literal("admin-alert-notification/v1"), kind: z.enum(KINDS),
  state: z.enum(["pending", "sending", "sent", "unknown", "cancelled"]),
  payloadKey: z.string().nullable(), payloadSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  recipientSha256: z.string().regex(/^[a-f0-9]{64}$/),
  attempts: z.number().int().min(0).max(MAX_ATTEMPTS), firstAttemptAt: z.number().int().min(0).nullable(),
  nextAttemptAt: z.number().int().min(0), leaseUntil: z.number().int().min(0),
  providerId: z.string().min(1).max(256).optional(),
}).strict();
type Notice = z.infer<typeof noticeSchema>;
type Event = { id: string; action: string; entityId: string; metaJson: string | null };

export interface AdminAlertInput { gameId: string; kind: AdminAlertKind; problems?: string[]; error?: string }
export interface AdminAlertOutcome { sent: string[]; failed: string[]; skipped: string[] }
interface AlertMeta { sentTo: string[]; failedTo: string[]; noticeId?: string }

async function context(c: Container, input: AdminAlertInput) {
  const game = await c.db.game.findUniqueOrThrow({ where: { id: input.gameId }, include: {
    childProfile: true, owner: { select: { email: true } }, scenes: true, orders: true,
    jobs: { select: { status: true, currentStep: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
  } });
  const failedSpots = await failedSpotsForAdmin(c, input.gameId);
  return { game, failedSpots };
}
function relevant(input: AdminAlertInput, current: Awaited<ReturnType<typeof context>>, allowReadyIntent = false): boolean {
  const { game, failedSpots } = current;
  if (game.deletedAt || ["DELETED", "REFUNDED", "CANCELLED"].includes(game.status)
    || game.orders.some(order => order.paymentStatus === "REFUNDED" || order.refundedAt)) return false;
  if (input.kind === "delivered-with-problems") return (game.status === "DELIVERED" || (allowReadyIntent && game.status === "READY"))
    && (!!game.lastError?.trim() || failedSpots.length > 0);
  if (["READY", "DELIVERED"].includes(game.status)) return false;
  if (input.kind === "generation-stalled") return generationHealthConcern(game, Date.now()) !== null;
  if (input.kind === "needs-new-photo") return game.status === "NEEDS_NEW_PHOTO";
  if (input.kind === "held-for-review") return ["QA_PENDING", "MANUAL_REVIEW"].includes(game.status);
  return game.status === "GENERATION_FAILED" || (["PAID", "AVATAR_GENERATING", "TARGETS_GENERATING", "SCENES_COMPOSING", "NEEDS_REGENERATION", "MANUAL_REVIEW"].includes(game.status)
    && game.jobs[0]?.status === "FAILED");
}

/** Old sends without a provider key are never replayed on rollout. */
async function seedTerminal(c: Container, input: AdminAlertInput, to: string, state: "sent" | "unknown") {
  const id = noticeId(input.gameId, input.kind, to);
  const notice: Notice = { version: "admin-alert-notification/v1", kind: input.kind, state,
    payloadKey: null, payloadSha256: null, recipientSha256: sha(to), attempts: 0,
    firstAttemptAt: null, nextAttemptAt: 0, leaseUntil: 0 };
  try {
    return await c.db.auditLog.create({ data: { id, actorType: "SYSTEM", action: `admin-alert:notification-${state}`,
      entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(notice) } });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return c.db.auditLog.findUniqueOrThrow({ where: { id } });
  }
}
async function historicalState(c: Container, input: AdminAlertInput, to: string): Promise<"sent" | "unknown" | null> {
  // No time cutoff: a success from months ago resolves the same alert forever.
  const rows = await c.db.auditLog.findMany({ where: { entityType: "Game", entityId: input.gameId,
    action: { in: [`admin-alert:${input.kind}`, `admin-alert:${input.kind}:failed`] } }, select: { action: true, metaJson: true } });
  if (rows.some(row => row.action === `admin-alert:${input.kind}` && parseMeta(row.metaJson).sentTo.includes(to))) return "sent";
  return rows.some(row => parseMeta(row.metaJson).failedTo.includes(to)) ? "unknown" : null;
}
async function ensureNotice(c: Container, input: AdminAlertInput, to: string): Promise<Event | null> {
  const id = noticeId(input.gameId, input.kind, to), existing = await c.db.auditLog.findUnique({ where: { id } });
  if (existing) return existing;
  const historical = await historicalState(c, input, to);
  if (historical) return seedTerminal(c, input, to, historical);
  const current = await context(c, input);
  if (!relevant(input, current, true)) return null;
  const { game, failedSpots } = current;
  const message: EmailMessage = { ...adminAlertEmail({ kind: input.kind, gameId: input.gameId,
    adminUrl: `${c.appUrl}/admin/orders/${encodeURIComponent(input.gameId)}`,
    childName: game.childProfile?.displayName ?? "", ownerEmail: game.owner?.email ?? null,
    status: statusOf(game), sceneCount: game.scenes.length, problems: input.problems ?? [],
    failedSpots: failedSpots.map(f => ({ where: `${f.sceneSlug}/${f.targetId}/${f.variant}`, attempts: f.attempts, reason: f.lastError ?? "" })),
    costCents: await generationCostForDisplay(c, input.gameId), error: input.error }), to, idempotencyKey: id };
  const bytes = Buffer.from(JSON.stringify(message)), payloadKey = `${adminAlertNotificationPrefix(input.gameId)}${id}.json`;
  const notice: Notice = { version: "admin-alert-notification/v1", kind: input.kind, state: "pending",
    payloadKey, payloadSha256: sha(bytes), recipientSha256: sha(to), attempts: 0,
    firstAttemptAt: null, nextAttemptAt: 0, leaseUntil: 0 };
  try {
    return await c.db.$transaction(async tx => {
      // Deletion acquires this same game row before purging private blobs.
      // Hold its lock through intent publication so a stale context cannot
      // insert private email bytes after deletion has finished its purge.
      const live = await tx.game.updateMany({ where: { id: input.gameId, ownerId: game.ownerId,
        status: game.status, deletedAt: null, updatedAt: game.updatedAt }, data: { updatedAt: game.updatedAt } });
      if (live.count !== 1) return null;
      await tx.fileBlob.create({ data: { key: payloadKey, contentType: "application/json", data: new Uint8Array(bytes) } });
      return tx.auditLog.create({ data: { id, actorType: "SYSTEM", action: ADMIN_ALERT_PENDING_ACTION,
        entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify(notice) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 10_000 });
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    return c.db.auditLog.findUniqueOrThrow({ where: { id } });
  }
}
async function deliverNotice(c: Container, event: Event, to: string, deadlineAt: number): Promise<"sent" | "failed" | "skipped"> {
  const parsed = noticeSchema.safeParse(parseJson(event.metaJson));
  if (!parsed.success || event.id !== noticeId(event.entityId, parsed.data.kind, to)
    || parsed.data.recipientSha256 !== sha(to)) return "skipped";
  let notice = parsed.data;
  if (event.action !== ADMIN_ALERT_PENDING_ACTION || !["pending", "sending"].includes(notice.state)
    || notice.nextAttemptAt > Date.now() || notice.leaseUntil > Date.now() || deadlineAt - Date.now() < 4_000) return "skipped";
  const finish = async (state: "unknown" | "cancelled") => {
    await c.db.auditLog.updateMany({ where: { id: event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: JSON.stringify(notice) },
      data: { action: `admin-alert:notification-${state}`, metaJson: JSON.stringify({ ...notice, state, leaseUntil: 0 }) } });
  };
  if (!recipients(c).includes(to)) { await finish("cancelled"); return "skipped"; }
  if (notice.attempts >= MAX_ATTEMPTS || (notice.firstAttemptAt !== null && Date.now() - notice.firstAttemptAt >= RETRY_WINDOW_MS)) {
    await finish("unknown"); return "skipped";
  }
  if (!notice.payloadKey || notice.payloadKey !== `${adminAlertNotificationPrefix(event.entityId)}${event.id}.json` || !notice.payloadSha256) {
    await finish("cancelled"); return "skipped";
  }
  const blob = await c.db.fileBlob.findUnique({ where: { key: notice.payloadKey } });
  if (!blob || sha(Buffer.from(blob.data)) !== notice.payloadSha256) { await finish("cancelled"); return "skipped"; }
  const mail = parseJson(Buffer.from(blob.data).toString()) as EmailMessage | null;
  if (!mail || mail.to !== to || mail.tag !== "admin-alert" || mail.idempotencyKey !== event.id) {
    await finish("cancelled"); return "skipped";
  }
  const sending: Notice = { ...notice, state: "sending", attempts: notice.attempts + 1,
    firstAttemptAt: notice.firstAttemptAt ?? Date.now(), leaseUntil: Date.now() + LEASE_MS };
  const claim = await c.db.auditLog.updateMany({ where: { id: event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: event.metaJson }, data: { metaJson: JSON.stringify(sending) } });
  if (claim.count !== 1) return "skipped";
  if (deadlineAt - Date.now() < 4_000) {
    await c.db.auditLog.updateMany({ where: { id: event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: JSON.stringify(sending) }, data: { metaJson: event.metaJson } });
    return "skipped";
  }
  notice = sending;
  try {
    // Recheck lifecycle and the current heartbeat after claiming the message.
    const current = await context(c, { gameId: event.entityId, kind: notice.kind });
    if (!recipients(c).includes(to) || !relevant({ gameId: event.entityId, kind: notice.kind }, current, true)) { await finish("cancelled"); return "skipped"; }
    if (notice.kind === "delivered-with-problems" && current.game.status === "READY") {
      // The customer notification can still be pending after publication. Keep
      // the report until delivery without spending a transport retry attempt.
      const waiting: Notice = { ...parsed.data, state: "pending", nextAttemptAt: Date.now() + 60_000, leaseUntil: 0 };
      await c.db.auditLog.updateMany({ where: { id: event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: JSON.stringify(sending) }, data: { metaJson: JSON.stringify(waiting) } });
      return "skipped";
    }
    if (deadlineAt - Date.now() < 4_000) {
      await c.db.auditLog.updateMany({ where: { id: event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: JSON.stringify(sending) }, data: { metaJson: event.metaJson } });
      return "skipped";
    }
    const receipt = await c.email.send(mail, { deadlineAt: deadlineAt - 3_000 });
    const recorded = await c.db.auditLog.updateMany({ where: { id: event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: JSON.stringify(sending) },
      data: { action: "admin-alert:notification-sent", metaJson: JSON.stringify({ ...notice, state: "sent", leaseUntil: 0, providerId: receipt.id }) } });
    if (recorded.count !== 1) return "skipped";
    // Losing the secondary historical audit cannot undo this durable receipt.
    await audit(c, SYSTEM, `admin-alert:${notice.kind}`, "Game", event.entityId, { sentTo: [to], failedTo: [], noticeId: event.id }).catch(() => {
      console.error("[admin-alert] historical audit unavailable; durable delivery receipt retained");
    });
    return "sent";
  } catch {
    const pending: Notice = { ...notice, state: "pending", nextAttemptAt: Date.now() + 60_000, leaseUntil: 0 };
    await c.db.auditLog.updateMany({ where: { id: event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: JSON.stringify(sending) }, data: { metaJson: JSON.stringify(pending) } });
    await audit(c, SYSTEM, `admin-alert:${notice.kind}:failed`, "Game", event.entityId, { sentTo: [], failedTo: [to], noticeId: event.id }).catch(() => undefined);
    return "failed";
  }
}

/** One immutable internal alert; transport retries reuse its key and body. */
export async function sendAdminAlert(c: Container, input: AdminAlertInput, options: { deadlineAt?: number } = {}): Promise<AdminAlertOutcome> {
  const outcome: AdminAlertOutcome = { sent: [], failed: [], skipped: [] }, deadlineAt = Math.min(options.deadlineAt ?? Infinity, Date.now() + 20_000);
  try {
    for (const to of recipients(c)) {
      if (deadlineAt - Date.now() < 4_000) break;
      const event = await ensureNotice(c, input, to), result = event ? await deliverNotice(c, event, to, deadlineAt) : "skipped";
      outcome[result].push(to);
    }
  } catch { console.error("[admin-alert] bounded internal notification unavailable"); }
  return outcome;
}

/** Cron retries only idempotent intents. Old failures without provider keys
 * are quarantined, never replayed on rollout. Customer mail remains separate. */
export async function retryFailedAdminAlerts(c: Container, options: { deadlineAt?: number } = {}): Promise<{ retried: number }> {
  const deadlineAt = Math.min(options.deadlineAt ?? Infinity, Date.now() + 20_000), sent = new Set<string>();
  await deliverLocalPatchNotifications(c, undefined, { deadlineAt }).catch(() => console.error("[local-patch notifications] bounded retry unavailable"));
  try {
    const admins = recipients(c);
    if (!admins.length || deadlineAt - Date.now() < 4_000) return { retried: 0 };
    const pending: Event[] = [], passAt = new Date();
    let cursor: string | undefined;
    for (;;) {
      if (deadlineAt - Date.now() < 4_000) return { retried: sent.size };
      const rows = await c.db.auditLog.findMany({ where: { action: ADMIN_ALERT_PENDING_ACTION, entityType: "Game", createdAt: { lte: passAt } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: RETRY_PAGE_SIZE, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      pending.push(...rows);
      if (rows.length < RETRY_PAGE_SIZE) break;
      cursor = rows.at(-1)!.id;
    }
    const due = pending.map(event => ({ event, notice: noticeSchema.safeParse(parseJson(event.metaJson)) }))
      .filter(row => row.notice.success && row.notice.data.nextAttemptAt <= Date.now() && row.notice.data.leaseUntil <= Date.now())
      .sort((a, b) => (a.notice.success ? a.notice.data.nextAttemptAt : 0) - (b.notice.success ? b.notice.data.nextAttemptAt : 0));
    let attempted = 0;
    for (const row of due) {
      if (deadlineAt - Date.now() < 4_000 || attempted >= RETRY_LIMIT) break;
      if (!row.notice.success) continue;
      const notice = row.notice.data, to = admins.find(to => sha(to) === notice.recipientSha256);
      if (!to) {
        await c.db.auditLog.updateMany({ where: { id: row.event.id, action: ADMIN_ALERT_PENDING_ACTION, metaJson: row.event.metaJson },
          data: { action: "admin-alert:notification-cancelled", metaJson: JSON.stringify({ ...notice, state: "cancelled", leaseUntil: 0 }) } });
        continue;
      }
      const result = await deliverNotice(c, row.event, to, deadlineAt);
      if (result === "sent") sent.add(JSON.stringify([row.event.entityId, notice.kind]));
      if (result !== "skipped") attempted++;
    }
    const legacy = new Map<string, { input: AdminAlertInput; to: string }>();
    cursor = undefined;
    for (;;) {
      if (deadlineAt - Date.now() < 4_000) return { retried: sent.size };
      const rows: Array<Event & { createdAt: Date }> = await c.db.auditLog.findMany({ where: { action: { in: [...FAILURE_KINDS.keys()] }, entityType: "Game",
        createdAt: { gt: new Date(passAt.getTime() - ALERT_RETRY_WINDOW_MS), lte: passAt } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: RETRY_PAGE_SIZE, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      for (const row of rows) {
        const kind = FAILURE_KINDS.get(row.action), meta = parseMeta(row.metaJson);
        if (!kind || meta.noticeId) continue;
        for (const to of meta.failedTo.filter(to => admins.includes(to))) legacy.set(noticeId(row.entityId, kind, to), { input: { gameId: row.entityId, kind }, to });
      }
      if (rows.length < RETRY_PAGE_SIZE) break;
      cursor = rows.at(-1)!.id;
    }
    if (legacy.size) {
      const successful = await c.db.auditLog.findMany({ where: { action: { in: SUCCESS_ACTIONS }, entityType: "Game", entityId: { in: [...new Set([...legacy.values()].map(item => item.input.gameId))] } }, select: { action: true, entityId: true, metaJson: true } });
      const delivered = new Set(successful.flatMap(row => parseMeta(row.metaJson).sentTo.map(to => noticeId(row.entityId, row.action.slice("admin-alert:".length) as AdminAlertKind, to))));
      for (const [id, item] of legacy) {
        if (deadlineAt - Date.now() < 4_000) break;
        if (!(await c.db.auditLog.findUnique({ where: { id } }))) await seedTerminal(c, item.input, item.to, delivered.has(id) ? "sent" : "unknown");
      }
    }
  } catch { console.error("[admin-alert] bounded internal notification retry unavailable"); }
  return { retried: sent.size };
}

function parseJson(json: string | null | undefined): unknown {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}
function parseMeta(json: string | null | undefined): AlertMeta {
  const parsed = parseJson(json), value = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  const addresses = (input: unknown) => Array.isArray(input) ? [...new Set(input.filter((item): item is string => typeof item === "string").map(to => to.trim().toLowerCase()).filter(Boolean))] : [];
  return { sentTo: addresses(value.sentTo), failedTo: addresses(value.failedTo), ...(typeof value.noticeId === "string" ? { noticeId: value.noticeId } : {}) };
}

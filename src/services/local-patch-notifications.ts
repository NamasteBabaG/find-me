import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { GameConfig } from "../domain/game/config";
import type { EmailMessage } from "../infra/email/types";
import type { Container } from "./container";
import { ensurePlayerLink, tokenForLink } from "./share-link.service";
import { hashToken } from "../lib/ids";
import { gameReadyEmail } from "./email/templates";
import { routeMail } from "./email/fallback";
import { IDENTITY_GATE_ACTION } from "./generation/board-wizard-identity-gate";
import { JUDGE_CHECKS } from "./generation/local-patch-judge";
import { DbStorage } from "../infra/storage/db";
import { requireCanonicalIdentityReuse } from "./generation/local-patch-identity-reuse";

const ACTION = "local-patch:notification-pending";
const MAX_ATTEMPTS = 3;
// Resend's deduplication window is 24h. Never automatically retry an uncertain
// delivery beyond it: a new delivery there could duplicate a received message.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEASE_MS = 60_000;
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const localPatchNotificationPrefix = (gameId: string) => `private/local-patch-notification/${gameId}/`;
type Notice = { kind: "ready" | "concerns"; state: "pending" | "sending" | "sent" | "failed" | "unknown" | "cancelled";
  key: string; payloadSha256: string; configSha256: string; recipientSha256: string; viaFallback: boolean;
  shareLinkId: string | null; shareTokenSha256: string | null;
  attempts: number; firstAttemptAt: number | null; nextAttemptAt: number; leaseUntil: number; providerId?: string; error?: string };

/** Display repair does not change a ready link or the reviewed-hide report.
 * Move only their expected config digest, atomically with the avatar URL edit.
 * Never change the mail bytes, key, attempt history or recipient. A live sender
 * owns its metadata until it finishes; the admin can retry the free repair then. */
export async function rebindLocalPatchNotificationAvatar(tx: Prisma.TransactionClient, input: {
  gameId: string; previousConfig: string; nextConfig: string; previousAvatarId: string; avatarId: string;
}): Promise<boolean> {
  if (input.nextConfig !== input.previousConfig.replaceAll(`/api/assets/${input.previousAvatarId}`, `/api/assets/${input.avatarId}`)) return false;
  const events = await tx.auditLog.findMany({ where: { action: ACTION, entityType: "Game", entityId: input.gameId } });
  for (const event of events) {
    let notice: Notice;
    try { notice = JSON.parse(event.metaJson ?? "null"); } catch { return false; }
    if (!notice || notice.configSha256 !== sha(input.previousConfig)) continue;
    if (notice.leaseUntil > Date.now()) return false;
    const changed = await tx.auditLog.updateMany({ where: { id: event.id, action: ACTION, metaJson: event.metaJson },
      data: { metaJson: JSON.stringify({ ...notice, configSha256: sha(input.nextConfig) }) } });
    if (changed.count !== 1) return false;
  }
  return true;
}
export type LocalPatchConcern = { board: string; hide: string; targetId: string; reason: string; uncertainty: boolean };
type ReviewedRow = { assetId: string | null; judgeJson: string | null; targetId: string; board: string };

/** Counts the CURRENT shipped hide, once, not its faults or historical attempts. */
export function localPatchConcerns(rows: readonly ReviewedRow[]): LocalPatchConcern[] {
  const concerns = new Map<string, LocalPatchConcern>();
  for (const row of rows) {
    if (!row.assetId) continue;
    let receipt: Record<string, any> | null = null;
    try { receipt = JSON.parse(row.judgeJson ?? "null"); } catch { /* unavailable review */ }
    const verdict = receipt?.verdict;
    const contradicted = verdict?.verdictOverridden === true;
    const claimedConcern = verdict?.claimedVerdict === "fail" || verdict?.claimedVerdict === "unsure";
    const checkConcern = JUDGE_CHECKS.some(check => verdict?.[check] === "fail" || verdict?.[check] === "unsure");
    const hasFaults = Array.isArray(verdict?.faults) && verdict.faults.length > 0;
    // The aggregate is a report of what the judge actually said, not the old
    // acceptance gate. A derived pass must not erase a contrary raw summary,
    // a non-blocking uncertain check, or a located complaint.
    if (verdict?.verdict === "pass" && !receipt?.wireFault && !contradicted && !claimedConcern && !checkConcern && !hasFaults) continue;
    const hide = typeof receipt?.hide === "string" ? receipt.hide : row.targetId;
    concerns.set(`${row.board}:${row.targetId}`, { board: row.board, hide, targetId: row.targetId,
      uncertainty: !verdict || verdict.verdict === "unsure" || verdict.claimedVerdict === "unsure" || contradicted || !!receipt?.wireFault || JUDGE_CHECKS.some(check => verdict?.[check] === "unsure"),
      reason: (typeof verdict?.reason === "string" ? verdict.reason : "השיפוט לא הושלם או לא הכריע").slice(0, 800),
    });
  }
  return [...concerns.values()];
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function concernsMail(appUrl: string, gameId: string, to: string, concerns: LocalPatchConcern[], identityConcern: string | null): EmailMessage {
  const adminUrl = `${appUrl}/admin/orders/${encodeURIComponent(gameId)}`;
  const subject = `השופט סימן ${concerns.length} מחבואים לבדיקה — המשחק כבר פורסם`;
  const lead = "המשחק פורסם וכל המחבואים זמינים. אלו הסתייגויות של השופט בלבד; אין צורך לאשר כדי לשחק.";
  const lines = concerns.map(item => `${item.board} / ${item.hide} — ${item.uncertainty ? "אי־הכרעה" : "הסתייגות"}: ${item.reason}`);
  const identity = identityConcern ? [`זהות ראשונית (אינה נספרת כמחבוא): ${identityConcern}`] : [];
  return { to, tag: "admin-alert", subject,
    text: [subject, lead, ...lines, ...identity, `אדמין: ${adminUrl}`].join("\n"),
    html: `<html dir="rtl" lang="he"><body><h1>${escape(subject)}</h1><p>${lead}</p><ul>${concerns.map((item, index) =>
      `<li>${escape(lines[index]!)} <a href="${escape(`${adminUrl}?board=${encodeURIComponent(item.board)}&target=${encodeURIComponent(item.targetId)}#hide-${encodeURIComponent(item.board)}-${encodeURIComponent(item.targetId)}`)}">צפייה באדמין</a></li>`).join("")}</ul>${identity.map(line => `<p>${escape(line)}</p>`).join("")}<p><a href="${escape(adminUrl)}">לפתוח באדמין</a></p></body></html>`,
  };
}

/** Immutable payload + outbox metadata commit with READY. No sending in this transaction. */
export async function enqueueLocalPatchNotifications(c: Container, tx: Prisma.TransactionClient, gameId: string, config: GameConfig) {
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, include: { owner: true, childProfile: true,
    scenes: { include: { targets: { include: { variants: true } } } } } });
  if (game.deletedAt || !game.childProfile || !["READY", "DELIVERED"].includes(game.status)) throw new Error("Notifications require a published owned game");
  const configSha256 = sha(JSON.stringify(config));
  const link = await ensurePlayerLink({ ...c, db: tx as Container["db"] }, gameId);
  const ready = routeMail(gameReadyEmail({ to: game.owner?.email ?? "", childName: game.childProfile.displayName,
    playLink: link.url, libraryLink: `${c.appUrl}/library/${gameId}`, sceneCount: game.scenes.length, locale: game.locale === "he" ? "he" : "en", playMode: "find-any" }), c.emailFallbackTo);
  const rows = game.scenes.flatMap(scene => scene.targets.flatMap(target => target.variants.filter(row => row.variant === "A" && row.status === "GENERATED")
    .map(row => ({ assetId: row.assetId, judgeJson: row.judgeJson, board: scene.sceneSlug, targetId: target.targetId }))));
  const concerns = localPatchConcerns(rows);
  const identity = await tx.auditLog.findFirst({ where: { action: IDENTITY_GATE_ACTION, entityType: "Asset", entityId: game.childProfile.identityAssetId ?? "" }, orderBy: { createdAt: "desc" } });
  let identityConcern: string | null = null;
  try {
    const reused = !identity && game.scenes.every(scene => scene.sceneVersion === 8)
      ? await requireCanonicalIdentityReuse({ ...c, db: tx as Container["db"], storage: new DbStorage(tx as Container["db"]) }, { gameId }) : null;
    const receipt = reused?.sourceReceipt ?? JSON.parse(identity?.metaJson ?? "null");
    if (!receipt?.approved) identityConcern = typeof receipt?.reason === "string" ? receipt.reason.slice(0, 800) : "ביקורת הזהות לא אישרה את האיור; התוצר פורסם לפי מדיניות ההתראות";
  } catch { identityConcern = "ביקורת הזהות אינה זמינה לפענוח"; }
  const messages: { kind: Notice["kind"]; message: EmailMessage; viaFallback: boolean }[] = [];
  if (ready) messages.push({ kind: "ready", message: ready.message, viaFallback: ready.viaFallback });
  if (concerns.length || identityConcern) for (const to of [...new Set((c.adminEmails ?? []).map(email => email.trim().toLowerCase()).filter(Boolean))]) {
    messages.push({ kind: "concerns", message: concernsMail(c.appUrl, gameId, to, concerns, identityConcern), viaFallback: false });
  }
  for (const item of messages) {
    const id = `aud_lpn_${sha(JSON.stringify([gameId, configSha256, item.kind, item.message.to.toLowerCase()])).slice(0, 32)}`;
    const key = `${localPatchNotificationPrefix(gameId)}${id}.json`;
    const message = { ...item.message, idempotencyKey: id };
    const bytes = Buffer.from(JSON.stringify(message));
    const meta: Notice = { kind: item.kind, state: "pending", key, payloadSha256: sha(bytes), configSha256,
      recipientSha256: sha(item.message.to.toLowerCase()), viaFallback: item.viaFallback,
      shareLinkId: item.kind === "ready" ? link.id : null, shareTokenSha256: item.kind === "ready" ? hashToken(link.token) : null,
      attempts: 0, firstAttemptAt: null, nextAttemptAt: 0, leaseUntil: 0 };
    const existing = await tx.auditLog.findUnique({ where: { id } });
    if (existing) continue; // An already persisted event is never re-minted or sent twice.
    await tx.fileBlob.create({ data: { key, contentType: "application/json", data: new Uint8Array(bytes) } });
    await tx.auditLog.create({ data: { id, actorType: "SYSTEM", action: ACTION, entityType: "Game", entityId: gameId, metaJson: JSON.stringify(meta) } });
  }
}

/** Two independent deliveries. Failure of either never changes the playable config. */
export async function deliverLocalPatchNotifications(c: Container, gameId?: string, options: { deadlineAt?: number } = {}): Promise<{ sent: number; failed: number }> {
  const outcome = { sent: 0, failed: 0 };
  const deadlineAt = Math.min(options.deadlineAt ?? Infinity, Date.now() + 20_000);
  // Keep three seconds for the durable outcome after the provider returns.
  const canDispatch = () => deadlineAt - Date.now() >= 4_000;
  if (!canDispatch()) return outcome;
  const events = await c.db.auditLog.findMany({ where: { action: ACTION, entityType: "Game", ...(gameId ? { entityId: gameId } : {}) }, orderBy: { createdAt: "asc" }, take: 50 });
  for (const event of events) {
    if (!canDispatch()) break;
    let notice: Notice;
    try { notice = JSON.parse(event.metaJson ?? "null"); } catch { continue; }
    if (!notice || notice.nextAttemptAt > Date.now() || notice.leaseUntil > Date.now()) continue;
    const finish = async (state: Notice["state"], extra: Partial<Notice> = {}) => {
      await c.db.auditLog.updateMany({ where: { id: event.id, action: ACTION, metaJson: JSON.stringify(notice) }, data: { action: `local-patch:notification-${state}`, metaJson: JSON.stringify({ ...notice, ...extra, state, leaseUntil: 0 }) } });
    };
    try {
      const game = await c.db.game.findUnique({ where: { id: event.entityId }, include: { owner: true } });
      if (!game || game.deletedAt || !["READY", "DELIVERED"].includes(game.status) || !game.configJson || sha(game.configJson) !== notice.configSha256) { await finish("cancelled"); continue; }
      if (notice.kind === "ready") {
        const link = notice.shareLinkId ? await c.db.shareLink.findUnique({ where: { id: notice.shareLinkId } }) : null;
        if (!link || link.gameId !== game.id || link.kind !== "PLAYER" || !link.active || link.revokedAt
          || (link.expiresAt && link.expiresAt.getTime() <= Date.now()) || link.tokenHash !== notice.shareTokenSha256
          || hashToken(tokenForLink(c, link)) !== notice.shareTokenSha256) {
          // Do not rewrite an already attempted body under its idempotency key.
          // The owner's explicit resend can issue a fresh current-link email.
          await finish("cancelled", { error: "player link revoked, expired or changed" }); continue;
        }
      }
      if (notice.attempts >= MAX_ATTEMPTS || (notice.firstAttemptAt !== null && Date.now() - notice.firstAttemptAt >= RETRY_WINDOW_MS)) { await finish("unknown"); continue; }
      const blob = await c.db.fileBlob.findUnique({ where: { key: notice.key } });
      if (!blob || sha(Buffer.from(blob.data)) !== notice.payloadSha256) { await finish("cancelled", { error: "notification payload unavailable or changed" }); continue; }
      const mail: EmailMessage = JSON.parse(Buffer.from(blob.data).toString());
      const authorized = notice.kind === "concerns" ? (c.adminEmails ?? []).some(email => email.toLowerCase() === mail.to.toLowerCase())
        : (notice.viaFallback ? c.emailFallbackTo : game.owner?.email)?.toLowerCase() === mail.to.toLowerCase();
      if (!authorized || sha(mail.to.toLowerCase()) !== notice.recipientSha256 || mail.idempotencyKey !== event.id) { await finish("cancelled", { error: "recipient authorization changed" }); continue; }
      if (!canDispatch()) break;
      const now = Date.now();
      const sending = { ...notice, state: "sending" as const, attempts: notice.attempts + 1, firstAttemptAt: notice.firstAttemptAt ?? now, leaseUntil: now + LEASE_MS };
      const claim = await c.db.auditLog.updateMany({ where: { id: event.id, action: ACTION, metaJson: event.metaJson }, data: { metaJson: JSON.stringify(sending) } });
      if (claim.count !== 1) continue;
      if (!canDispatch()) {
        // A slow claim has not sent anything. Restore the exact unattempted
        // event, fenced to this claim, instead of consuming a delivery retry.
        await c.db.auditLog.updateMany({ where: { id: event.id, action: ACTION, metaJson: JSON.stringify(sending) }, data: { metaJson: event.metaJson } });
        break;
      }
      notice = sending;
      try {
        const receipt = await c.email.send(mail, { deadlineAt: deadlineAt - 3_000 });
        await c.db.$transaction(async tx => {
          const recorded = await tx.auditLog.updateMany({ where: { id: event.id, action: ACTION, metaJson: JSON.stringify(sending) }, data: {
            action: "local-patch:notification-sent", metaJson: JSON.stringify({ ...notice, state: "sent", providerId: receipt.id, leaseUntil: 0 }),
          } });
          if (recorded.count === 1 && notice.kind === "ready" && !notice.viaFallback) await tx.game.updateMany({ where: { id: game.id, status: "READY", deletedAt: null, configJson: game.configJson }, data: { status: "DELIVERED" } });
        });
        outcome.sent++;
      } catch (err) {
        // A timeout can mean that the provider sent it. Same key+body is safe
        // inside its retention window; outside it the event needs reconciliation.
        const failed = { ...notice, state: "failed" as const, nextAttemptAt: Date.now() + 60_000, leaseUntil: 0,
          error: "email-delivery-unconfirmed" };
        await c.db.auditLog.updateMany({ where: { id: event.id, action: ACTION, metaJson: JSON.stringify(sending) }, data: { metaJson: JSON.stringify(failed) } });
        outcome.failed++;
      }
    } catch (err) {
      console.error(`[local-patch notification] ${event.id}:`, err instanceof Error ? err.message : String(err));
      outcome.failed++;
    }
  }
  return outcome;
}

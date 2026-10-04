import type { Prisma } from "@prisma/client";

export const adminAlertNotificationPrefix = (gameId: string) => `private/admin-alert-notification/${gameId}/`;
const pendingAction = "admin-alert:notification-pending";
const cancelledAction = "admin-alert:notification-cancelled";

/** Called only after the owner's deletion fence, inside that same transaction.
 * The cancelled action and metadata CAS also defeat an in-flight sender's late
 * completion; immutable private email bodies cannot survive their game. */
export async function purgeAdminAlertNotifications(tx: Pick<Prisma.TransactionClient, "fileBlob" | "auditLog">, gameId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(gameId)) throw Error("ADMIN_ALERT_DELETE: canonical game id required");
  const rows = await tx.auditLog.findMany({
    where: { entityType: "Game", entityId: gameId, action: pendingAction },
    select: { id: true, metaJson: true },
  });
  for (const row of rows) {
    let metadata: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(row.metaJson ?? "null");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed as Record<string, unknown>;
    } catch { /* A corrupt pending receipt must still lose its send authority. */ }
    const cancelled = await tx.auditLog.updateMany({
      where: { id: row.id, entityType: "Game", entityId: gameId, action: pendingAction, metaJson: row.metaJson },
      data: { action: cancelledAction, metaJson: JSON.stringify({ ...metadata, state: "cancelled", leaseUntil: 0 }) },
    });
    if (cancelled.count !== 1) throw Error("ADMIN_ALERT_DELETE: pending notification changed during deletion");
  }
  const prefix = adminAlertNotificationPrefix(gameId);
  // Prisma's startsWith is SQL LIKE: '_' in a canonical game id is a wildcard
  // (and SQLite LIKE is case-insensitive). Only delete exact string-prefix keys.
  const candidates = await tx.fileBlob.findMany({ where: { key: { startsWith: prefix } }, select: { key: true } });
  const keys = candidates.filter(row => row.key.startsWith(prefix)).map(row => row.key);
  if (keys.length) await tx.fileBlob.deleteMany({ where: { key: { in: keys } } });
}

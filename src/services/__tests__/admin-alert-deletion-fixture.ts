import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { expect } from "vitest";

type AlertDb = Pick<PrismaClient, "fileBlob" | "auditLog">;

/** Synthetic durable email body/receipt, independent of the deletion helper. */
export async function seedAdminAlertNotification(db: AlertDb, gameId: string, state: "pending" | "sending" = "pending", suffix: string = state) {
  const id = `${gameId}-test-alert-${suffix}`, payloadKey = `private/admin-alert-notification/${gameId}/${suffix}.json`;
  const body = Buffer.from(JSON.stringify({ to: "synthetic-admin@example.invalid", subject: "Synthetic alert", text: "Synthetic child and game diagnostics" }));
  const metadata = {
    version: "admin-alert-notification/v1", kind: "generation-failed", state, payloadKey,
    payloadSha256: createHash("sha256").update(body).digest("hex"),
    recipientSha256: createHash("sha256").update("synthetic-admin@example.invalid").digest("hex"),
    attempts: state === "sending" ? 1 : 0, firstAttemptAt: state === "sending" ? 100 : null,
    nextAttemptAt: 100, leaseUntil: state === "sending" ? 200 : 0,
  };
  const metaJson = JSON.stringify(metadata);
  await db.fileBlob.create({ data: { key: payloadKey, contentType: "application/json", data: new Uint8Array(body) } });
  await db.auditLog.create({ data: { id, actorType: "SYSTEM", action: "admin-alert:notification-pending", entityType: "Game", entityId: gameId, metaJson } });
  return { id, gameId, payloadKey, metadata, metaJson };
}
type Alert = Awaited<ReturnType<typeof seedAdminAlertNotification>>;

export async function expectAdminAlertPurged(db: AlertDb, alert: Alert) {
  expect(await db.fileBlob.findUnique({ where: { key: alert.payloadKey } })).toBeNull();
  const row = await db.auditLog.findUniqueOrThrow({ where: { id: alert.id } });
  expect(row.action).toBe("admin-alert:notification-cancelled");
  expect(JSON.parse(row.metaJson!)).toEqual({ ...alert.metadata, state: "cancelled", leaseUntil: 0 });
}

export async function expectAdminAlertUnchanged(db: AlertDb, alert: Alert) {
  expect(await db.fileBlob.findUnique({ where: { key: alert.payloadKey } })).not.toBeNull();
  expect(await db.auditLog.findUniqueOrThrow({ where: { id: alert.id } })).toMatchObject({ action: "admin-alert:notification-pending", metaJson: alert.metaJson });
}

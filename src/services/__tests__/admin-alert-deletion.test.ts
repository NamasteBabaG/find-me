import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../lib/test-schema";
import { DbStorage } from "../../infra/storage/db";
import type { Container } from "../container";
import { deleteGame } from "../game.service";
import { purgeAdminAlertNotifications } from "../admin-alert-deletion";
import { seedAdminAlertNotification, expectAdminAlertPurged, expectAdminAlertUnchanged } from "./admin-alert-deletion-fixture";

vi.mock("../../lib/env", () => ({ env: () => ({ APP_ENV: "test" }), spendGuard: () => ({ appEnv: "test", realGeneration: false, testers: [] }), flag: () => false }));
let scratch: string, db: PrismaClient, sequence = 0;
const ownerId = "synthetic-alert-delete-owner";
beforeAll(async () => {
  scratch = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-alert-delete-")));
  db = new PrismaClient({ datasources: { db: { url: `file:${path.join(scratch, "test.sqlite").replace(/\\/g, "/")}` } } });
  await applyTestSchema(db);
  await db.user.create({ data: { id: ownerId, email: "synthetic-owner@example.invalid" } });
});
afterAll(async () => {
  await db?.$disconnect();
  if (scratch && path.dirname(scratch) === realpathSync(tmpdir()) && path.basename(scratch).startsWith("findme-alert-delete-")) rmSync(scratch, { recursive: true, force: true });
});
async function fixture() {
  const gameId = `legacy_alert_delete_${++sequence}`;
  await db.game.create({ data: { id: gameId, ownerId, status: "DELIVERED", styleVersion: "legacy-test-v1", configJson: "{}" } });
  const c = { db, storage: new DbStorage(db), analytics: { track() {} } } as unknown as Container;
  const remove = (id = ownerId) => deleteGame(c, gameId, { type: "USER", id }, id);
  return { gameId, c, remove };
}

describe("admin alert deletion joins the game's deletion fence", () => {
  it("purges all game-owned body bytes and cancels pending/sending authority without touching similar-prefix games", async () => {
    const f = await fixture(), pending = await seedAdminAlertNotification(db, f.gameId), sending = await seedAdminAlertNotification(db, f.gameId, "sending");
    const sibling = await seedAdminAlertNotification(db, `${f.gameId}-sibling`);
    const wildcardSibling = await seedAdminAlertNotification(db, f.gameId.replaceAll("_", "-"));
    const caseSibling = await seedAdminAlertNotification(db, f.gameId.toUpperCase());
    const orphanKey = `private/admin-alert-notification/${f.gameId}/orphan.json`;
    await db.fileBlob.create({ data: { key: orphanKey, contentType: "application/json", data: new Uint8Array(Buffer.from("synthetic orphan email body")) } });
    // Terminal audit metadata remains useful, but its private email body is also removed.
    const terminal = await seedAdminAlertNotification(db, f.gameId, "sending", "terminal");
    await db.auditLog.update({ where: { id: terminal.id }, data: { action: "admin-alert:notification-sent", metaJson: JSON.stringify({ ...terminal.metadata, state: "sent", providerId: "synthetic-delivery" }) } });
    expect(await f.remove()).toBe(true);
    await expectAdminAlertPurged(db, pending);
    await expectAdminAlertPurged(db, sending);
    const remaining = await db.fileBlob.findMany({ select: { key: true } });
    expect(remaining.filter(row => row.key.startsWith(`private/admin-alert-notification/${f.gameId}/`))).toHaveLength(0);
    await expectAdminAlertUnchanged(db, sibling);
    await expectAdminAlertUnchanged(db, wildcardSibling);
    await expectAdminAlertUnchanged(db, caseSibling);
    expect(await db.auditLog.findUniqueOrThrow({ where: { id: terminal.id } })).toMatchObject({ action: "admin-alert:notification-sent" });
    // A provider response that was already in flight cannot undo a deletion cancellation.
    expect((await db.auditLog.updateMany({ where: { id: sending.id, action: "admin-alert:notification-pending", metaJson: sending.metaJson }, data: { action: "admin-alert:notification-sent" } })).count).toBe(0);
    expect(await f.remove()).toBe(false);
  });

  it("a nonowner cannot purge bodies or suppress pending alerts", async () => {
    const f = await fixture(), alert = await seedAdminAlertNotification(db, f.gameId, "sending");
    expect(await f.remove("other-synthetic-owner")).toBe(false);
    await expectAdminAlertUnchanged(db, alert);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "DELIVERED", deletedAt: null, configJson: "{}" });
  });

  it("rolls cancellation and body purge back with the game's final transactional write", async () => {
    const f = await fixture(), alert = await seedAdminAlertNotification(db, f.gameId);
    const before = await db.game.findUniqueOrThrow({ where: { id: f.gameId } });
    // Body deletion fails after the game fence and receipt cancellation, proving their atomic rollback.
    await db.$executeRawUnsafe(`CREATE TRIGGER fail_alert_delete BEFORE DELETE ON FileBlob WHEN OLD.key = '${alert.payloadKey}' BEGIN SELECT RAISE(ABORT, 'synthetic outbox purge failure'); END`);
    try { await expect(f.remove()).rejects.toThrow(); }
    finally { await db.$executeRawUnsafe("DROP TRIGGER fail_alert_delete"); }
    await expectAdminAlertUnchanged(db, alert);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toEqual(before);
    expect(await f.remove()).toBe(true);
    await expectAdminAlertPurged(db, alert);
  });

  it("cancels corrupt pending receipts without adopting their untrusted payload path", async () => {
    const f = await fixture(), alert = await seedAdminAlertNotification(db, f.gameId);
    const foreignKey = `private/admin-alert-notification/${f.gameId}-foreign/not-ours.json`;
    await db.fileBlob.create({ data: { key: foreignKey, contentType: "application/json", data: new Uint8Array(Buffer.from("foreign synthetic body")) } });
    await db.auditLog.update({ where: { id: alert.id }, data: { metaJson: `{"payloadKey":"${foreignKey}",broken` } });
    expect(await f.remove()).toBe(true);
    expect(await db.fileBlob.findUnique({ where: { key: alert.payloadKey } })).toBeNull();
    expect(await db.fileBlob.findUnique({ where: { key: foreignKey } })).not.toBeNull();
    const receipt = await db.auditLog.findUniqueOrThrow({ where: { id: alert.id } });
    expect(receipt.action).toBe("admin-alert:notification-cancelled");
    expect(JSON.parse(receipt.metaJson!)).toEqual({ state: "cancelled", leaseUntil: 0 });
  });

  it("does not commit a deletion when a receipt claim wins the cancellation CAS", async () => {
    const f = await fixture(), alert = await seedAdminAlertNotification(db, f.gameId);
    await expect(db.$transaction(async tx => {
      await tx.game.update({ where: { id: f.gameId }, data: { status: "DELETED", deletedAt: new Date(), configJson: null } });
      let claimed = false;
      const racing = new Proxy(tx, { get(target, key, receiver) {
        if (key !== "auditLog") return Reflect.get(target, key, receiver);
        return new Proxy(tx.auditLog, { get(model, member, modelReceiver) {
          const value = Reflect.get(model, member, modelReceiver) as unknown;
          if (member !== "updateMany") return typeof value === "function" ? value.bind(model) : value;
          return async (args: Parameters<typeof model.updateMany>[0]) => {
            if (!claimed) {
              claimed = true;
              await model.update({ where: { id: alert.id }, data: { metaJson: JSON.stringify({ ...alert.metadata, state: "sending", leaseUntil: 250 }) } });
            }
            return model.updateMany(args);
          };
        } });
      } });
      await purgeAdminAlertNotifications(racing, f.gameId);
    })).rejects.toThrow("pending notification changed");
    await expectAdminAlertUnchanged(db, alert);
    expect(await db.game.findUniqueOrThrow({ where: { id: f.gameId } })).toMatchObject({ status: "DELIVERED", deletedAt: null, configJson: "{}" });
    expect(await f.remove()).toBe(true);
    await expectAdminAlertPurged(db, alert);
  });

  it("rejects a widened or noncanonical id before touching any rows", async () => {
    const f = await fixture(), alert = await seedAdminAlertNotification(db, f.gameId);
    await expect(db.$transaction(tx => purgeAdminAlertNotifications(tx, "../"))).rejects.toThrow("canonical game id");
    await expectAdminAlertUnchanged(db, alert);
  });
});

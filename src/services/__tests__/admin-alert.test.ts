import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Container } from "../container";
import { retryFailedAdminAlerts, sendAdminAlert } from "../admin-alert.service";

/**
 * The alert to the admins, with the database and the mail provider faked in
 * memory. Codex reproduced the first version's defect this way: a send that
 * failed was audited like a send that worked, and the next attempt six hours
 * of silence. Only a mail that went out counts now, per recipient; a failure
 * is recorded as a failure and tried again; and nothing in here throws.
 */

interface Sent {
  to: string;
  subject: string;
  tag: string;
  text: string;
}

function fakes(opts: { admins: string[]; fail?: (to: string) => boolean }) {
  const audits: Array<{ id: string; action: string; entityType: string; entityId: string; metaJson: string; createdAt: Date }> = [];
  const sent: Sent[] = [];
  let attempts = 0;
  let fail = opts.fail ?? (() => false);
  const c = {
    adminEmails: opts.admins,
    appUrl: "https://example.invalid",
    db: {
      auditLog: {
        findMany: async ({ where, orderBy, take, cursor, skip = 0 }: {
          where: { action?: string | { endsWith?: string; in?: string[] }; entityId?: string; entityType?: string; createdAt?: { gt?: Date; gte?: Date; lte?: Date } };
          orderBy?: { createdAt?: "asc" | "desc"; id?: "asc" | "desc" } | Array<{ createdAt?: "asc" | "desc"; id?: "asc" | "desc" }>;
          take?: number; cursor?: { id: string }; skip?: number;
        }) => {
          const rows = audits.filter((a) => {
            const action = where.action;
            const dates = where.createdAt;
            return (typeof action === "string" ? a.action === action :
              (!action?.endsWith || a.action.endsWith(action.endsWith)) && (!action?.in || action.in.includes(a.action))) &&
              (!where.entityId || a.entityId === where.entityId) && (!where.entityType || a.entityType === where.entityType) &&
              (!dates?.gt || a.createdAt > dates.gt) && (!dates?.gte || a.createdAt >= dates.gte) && (!dates?.lte || a.createdAt <= dates.lte);
          });
          const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
          rows.sort((a, b) => {
            for (const order of orders) {
              const diff = order.createdAt ? a.createdAt.getTime() - b.createdAt.getTime() : a.id.localeCompare(b.id);
              if (diff) return diff * ((order.createdAt ?? order.id) === "desc" ? -1 : 1);
            }
            return 0;
          });
          const start = (cursor ? rows.findIndex((r) => r.id === cursor.id) : 0) + skip;
          return rows.slice(start, take === undefined ? undefined : start + take);
        },
        create: async ({ data }: { data: { id: string; action: string; entityType: string; entityId: string; metaJson: string } }) => {
          audits.push({ ...data, createdAt: new Date() });
          return data;
        },
      },
      game: { findUniqueOrThrow: async () => ({ status: "DELIVERED", childProfile: { displayName: "Noa" }, owner: { email: "p@example.com" }, scenes: [{}] }) },
      targetVariantAsset: { findMany: async () => [] },
      asset: { findMany: async () => [] },
    },
    email: {
      id: "console",
      send: async (m: Sent) => {
        attempts++;
        if (fail(m.to)) throw new Error("simulated outage");
        sent.push(m);
        return { id: "m" };
      },
    },
  } as unknown as Container;
  return { c, audits, sent, attempts: () => attempts, setFail: (f: (to: string) => boolean) => (fail = f) };
}

const input = { gameId: "gam_x", kind: "delivered-with-problems" as const, problems: ["one spot fell back"] };
const start = new Date("2026-09-06T00:00:00Z");
function atMinute(minute: number) { vi.setSystemTime(start.getTime() + minute * 60_000); }

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("the admin alert", () => {
  it("tries again after an outage instead of staying silent for six hours", async () => {
    const f = fakes({ admins: ["ops@example.com"], fail: () => true });
    const first = await sendAdminAlert(f.c, input);
    expect(first).toEqual({ sent: [], failed: ["ops@example.com"], skipped: [] });
    f.setFail(() => false);
    const second = await sendAdminAlert(f.c, input);
    expect(second.sent).toEqual(["ops@example.com"]);
    expect(f.attempts()).toBe(2);
    // and the third is the repeat the window is for
    const third = await sendAdminAlert(f.c, input);
    expect(third).toEqual({ sent: [], failed: [], skipped: ["ops@example.com"] });
    expect(f.attempts()).toBe(2);
  });

  it("remembers who was reached, one recipient at a time", async () => {
    const f = fakes({ admins: ["ops@example.com", "guy@example.com"], fail: (to) => to === "guy@example.com" });
    const first = await sendAdminAlert(f.c, input);
    expect(first.sent).toEqual(["ops@example.com"]);
    expect(first.failed).toEqual(["guy@example.com"]);
    f.setFail(() => false);
    const second = await sendAdminAlert(f.c, input);
    expect(second.sent).toEqual(["guy@example.com"]);
    expect(second.skipped).toEqual(["ops@example.com"]);
    expect(f.sent.map((m) => m.to)).toEqual(["ops@example.com", "guy@example.com"]);
  });

  it("never throws, even when the audit log is down", async () => {
    const f = fakes({ admins: ["ops@example.com"] });
    (f.c.db.auditLog as { findMany: unknown }).findMany = async () => {
      throw new Error("database gone");
    };
    await expect(sendAdminAlert(f.c, input)).resolves.toEqual({ sent: [], failed: [], skipped: [] });
  });

  it("is retried from the cron for whoever was not reached", async () => {
    const f = fakes({ admins: ["ops@example.com"], fail: () => true });
    await sendAdminAlert(f.c, input);
    expect(f.audits.map((a) => a.action)).toEqual(["admin-alert:delivered-with-problems:failed"]);
    f.setFail(() => false);
    const { retried } = await retryFailedAdminAlerts(f.c);
    expect(retried).toBe(1);
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0]!.subject).toContain("נשלח עם בעיות");
    // nothing left to retry, nothing sent twice
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(0);
    expect(f.sent).toHaveLength(1);
  });

  it("does not revive a resolved failure after the six-hour suppression expires", async () => {
    const f = fakes({ admins: ["ops@example.com"], fail: () => true });
    await sendAdminAlert(f.c, input);
    atMinute(5);
    f.setFail(() => false);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    atMinute(366);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(0);
    expect(f.sent).toHaveLength(1);
  });

  it("does not let twenty recent failures of one game hide an older game", async () => {
    const f = fakes({ admins: ["ops@example.com"], fail: () => true });
    await sendAdminAlert(f.c, { ...input, gameId: "older" });
    for (let i = 1; i <= 20; i++) {
      atMinute(i);
      await sendAdminAlert(f.c, { ...input, gameId: "repeated" });
    }
    f.setFail(() => false);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(2);
    expect(f.sent.some((m) => m.text.includes("/admin/orders/older"))).toBe(true);
  });

  it("retries only failed recipients, not an already-reached or newly-added admin", async () => {
    const f = fakes({ admins: ["ok@example.com", "retry@example.com"], fail: (to) => to.startsWith("retry") });
    await sendAdminAlert(f.c, input);
    atMinute(361);
    f.c.adminEmails = ["ok@example.com", "retry@example.com", "new@example.com"];
    f.setFail(() => false);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.sent.map((m) => m.to)).toEqual(["ok@example.com", "retry@example.com"]);
  });

  it("allows a new alert and its retry after a previous failure was resolved", async () => {
    const f = fakes({ admins: ["ops@example.com"], fail: () => true });
    await sendAdminAlert(f.c, input);
    atMinute(5);
    f.setFail(() => false);
    await retryFailedAdminAlerts(f.c);
    atMinute(366);
    f.setFail(() => true);
    await sendAdminAlert(f.c, { ...input, error: "a new failure" });
    atMinute(371);
    f.setFail(() => false);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.sent).toHaveLength(2);
    expect(f.sent[1]!.text).toContain("a new failure");
  });

  it("looks beyond a page of resolved failures without consuming the retry limit", async () => {
    const f = fakes({ admins: ["ops@example.com"], fail: () => true });
    for (let i = 0; i < 105; i++) {
      atMinute(i);
      f.setFail(() => true);
      await sendAdminAlert(f.c, { ...input, gameId: `resolved_${i}` });
      f.setFail(() => false);
      await sendAdminAlert(f.c, { ...input, gameId: `resolved_${i}` });
    }
    atMinute(106);
    f.setFail(() => true);
    await sendAdminAlert(f.c, { ...input, gameId: "pending" });
    f.setFail(() => false);
    atMinute(700);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.sent).toHaveLength(106);
    expect(f.sent.at(-1)!.text).toContain("/admin/orders/pending");
  });

  it("limits a pass to twenty distinct pending alerts and gives the rest a turn next time", async () => {
    const f = fakes({ admins: ["ops@example.com"], fail: () => true });
    for (let i = 0; i < 21; i++) {
      atMinute(i);
      await sendAdminAlert(f.c, { ...input, gameId: `gam_${i}` });
    }
    atMinute(30);
    const before = f.attempts();
    await retryFailedAdminAlerts(f.c);
    expect(f.attempts() - before).toBe(20);
    atMinute(35);
    f.setFail(() => false);
    await retryFailedAdminAlerts(f.c);
    expect(f.sent[0]!.text).toContain("/admin/orders/gam_20");
  });

  it("ignores other audit failure actions and invalid alert kinds", async () => {
    const f = fakes({ admins: ["ops@example.com"] });
    for (const action of ["email:failed", "admin-alert:not-a-kind:failed"]) {
      f.audits.push({ id: action, action, entityType: "Game", entityId: input.gameId, metaJson: JSON.stringify({ failedTo: ["ops@example.com"] }), createdAt: new Date() });
    }
    await retryFailedAdminAlerts(f.c);
    expect(f.attempts()).toBe(0);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("ignores malformed metadata without losing a valid pending alert", async () => {
    const f = fakes({ admins: ["ops@example.com"] });
    for (const [i, metaJson] of ["null", "[]", "{", '{"failedTo":"ops@example.com"}'].entries()) {
      f.audits.push({ id: `bad_${i}`, action: "admin-alert:delivered-with-problems:failed", entityType: "Game", entityId: "bad", metaJson, createdAt: new Date() });
    }
    f.setFail(() => true);
    await sendAdminAlert(f.c, input);
    f.setFail(() => false);
    expect((await retryFailedAdminAlerts(f.c)).retried).toBe(1);
    expect(f.sent).toHaveLength(1);
  });

  it("keeps a recovered recipient resolved while another recipient continues failing", async () => {
    const f = fakes({ admins: ["one@example.com", "two@example.com"], fail: () => true });
    await sendAdminAlert(f.c, input);
    atMinute(5);
    f.setFail((to) => to.startsWith("two"));
    await retryFailedAdminAlerts(f.c);
    atMinute(366);
    f.setFail(() => false);
    await retryFailedAdminAlerts(f.c);
    expect(f.sent.map((m) => m.to)).toEqual(["one@example.com", "two@example.com"]);
  });

  it("does not throw out of a cron pass when the audit database is down", async () => {
    const f = fakes({ admins: ["ops@example.com"] });
    vi.spyOn(f.c.db.auditLog, "findMany").mockRejectedValue(new Error("database gone"));
    await expect(retryFailedAdminAlerts(f.c)).resolves.toEqual({ retried: 0 });
    expect(f.attempts()).toBe(0);
  });

  it("does not retry expired failures or mail removed admins", async () => {
    const f = fakes({ admins: ["old@example.com"], fail: () => true });
    await sendAdminAlert(f.c, input);
    f.c.adminEmails = ["replacement@example.com"];
    f.setFail(() => false);
    await retryFailedAdminAlerts(f.c);
    expect(f.sent).toHaveLength(0);
    f.c.adminEmails = ["old@example.com"];
    atMinute(1441);
    await retryFailedAdminAlerts(f.c);
    expect(f.sent).toHaveLength(0);
  });
});

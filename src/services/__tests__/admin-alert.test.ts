import { describe, expect, it } from "vitest";
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
}

function fakes(opts: { admins: string[]; fail?: (to: string) => boolean }) {
  const audits: Array<{ action: string; entityId: string; metaJson: string; createdAt: Date }> = [];
  const sent: Sent[] = [];
  let attempts = 0;
  let fail = opts.fail ?? (() => false);
  const c = {
    adminEmails: opts.admins,
    appUrl: "https://example.invalid",
    db: {
      auditLog: {
        findMany: async ({ where }: { where: { action?: string | { endsWith: string }; entityId?: string } }) =>
          audits.filter((a) => (typeof where.action === "string" ? a.action === where.action : where.action ? a.action.endsWith(where.action.endsWith) : true) && (!where.entityId || a.entityId === where.entityId)),
        create: async ({ data }: { data: { action: string; entityId: string; metaJson: string } }) => {
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
});

import { describe, expect, it } from "vitest";
import { MONEY_NOTICE_KINDS, TEAM_NOTICE_KINDS, alertRecipients, allNoticeRecipients, noticeRecipients } from "../team-notices";

/** team-notices/v1 (Guy, 2026-11-26): every alert and order to the alerts inbox, orders and money also to finance. */
const lists = { adminEmails: ["Admin@Example.test"], alertEmails: [" alerts@example.test ", "ALERTS@example.test"], financeEmails: ["money@example.test"] };

describe("who on the team is told what", () => {
  it("sends alerts to the alerts inbox, normalized and once, and to the admins only when it is unset", () => {
    expect(alertRecipients(lists)).toEqual(["alerts@example.test"]);
    expect(alertRecipients({ ...lists, alertEmails: [] })).toEqual(["admin@example.test"]);
    expect(alertRecipients({})).toEqual([]);
  });

  it("adds finance for orders and money, and only for them", () => {
    for (const kind of TEAM_NOTICE_KINDS) {
      expect(noticeRecipients(lists, kind)).toEqual(MONEY_NOTICE_KINDS.has(kind) ? ["alerts@example.test", "money@example.test"] : ["alerts@example.test"]);
    }
    expect([...MONEY_NOTICE_KINDS].sort()).toEqual(["ceiling-held", "ceiling-notice-failed", "ceiling-refunded", "cost-above-alert",
      "order-duplicate-paid", "order-paid", "order-refunded"]);
  });

  it("never sends one address the same notice twice", () => {
    expect(noticeRecipients({ alertEmails: ["same@example.test"], financeEmails: ["Same@example.test"] }, "order-paid")).toEqual(["same@example.test"]);
    expect(allNoticeRecipients(lists)).toEqual(["alerts@example.test", "money@example.test"]);
  });
});

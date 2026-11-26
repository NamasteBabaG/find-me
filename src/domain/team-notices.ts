/**
 * team-notices/v1 (Guy, 2026-11-26): who on the team is told what.
 *
 * - Every alert about a game and every order notice goes to the alerts inbox (ALERT_EMAILS; findmeworlds@gmail.com
 *   in production). Without it set, to the admins, exactly as before.
 * - Everything about orders and money also goes to the finance inbox (FINANCE_EMAILS).
 *
 * Who is told is separate from who may act: ADMIN_EMAILS still decides admin access, and is never widened by
 * receiving a notice. Pure: the lists come in, addresses come out, normalized and once each.
 */
export const TEAM_NOTICE_KINDS = ["delivered-with-problems", "held-for-review", "generation-failed", "needs-new-photo",
  "generation-stalled", "cost-above-alert", "ceiling-refunded", "ceiling-notice-failed", "ready-mail-failed", "ceiling-held",
  "order-paid", "order-duplicate-paid", "order-refunded"] as const;
export type TeamNoticeKind = typeof TEAM_NOTICE_KINDS[number];

/** Orders and money: a payment, a second payment for the same world, a refund, and every cost threshold of a world. */
export const MONEY_NOTICE_KINDS: ReadonlySet<TeamNoticeKind> = new Set<TeamNoticeKind>(["order-paid", "order-duplicate-paid",
  "order-refunded", "cost-above-alert", "ceiling-held", "ceiling-refunded", "ceiling-notice-failed"]);

/** The order notices themselves: real money only. A simulated checkout (QA, development) is not an order to report. */
export const ORDER_NOTICE_KINDS: ReadonlySet<TeamNoticeKind> = new Set<TeamNoticeKind>(["order-paid", "order-duplicate-paid", "order-refunded"]);

export type TeamLists = { adminEmails?: readonly string[]; alertEmails?: readonly string[]; financeEmails?: readonly string[] };

const clean = (list: readonly string[]) => [...new Set(list.map(email => email.trim().toLowerCase()).filter(Boolean))];

/** The alerts inbox: ALERT_EMAILS when set, otherwise the admins. */
export function alertRecipients(lists: TeamLists): string[] {
  const alerts = clean(lists.alertEmails ?? []);
  return alerts.length ? alerts : clean(lists.adminEmails ?? []);
}

/** Everyone told about this kind of notice. */
export function noticeRecipients(lists: TeamLists, kind: TeamNoticeKind): string[] {
  return clean([...alertRecipients(lists), ...(MONEY_NOTICE_KINDS.has(kind) ? lists.financeEmails ?? [] : [])]);
}

/** Every address any notice may go to: what a stored notice's recipient is matched against. */
export function allNoticeRecipients(lists: TeamLists): string[] {
  return clean([...alertRecipients(lists), ...(lists.financeEmails ?? [])]);
}

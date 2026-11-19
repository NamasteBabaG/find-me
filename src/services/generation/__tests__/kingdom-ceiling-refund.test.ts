import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { applyTestSchema } from "../../../lib/test-schema";
import { DbStorage } from "../../../infra/storage/db";
import type { Container } from "../../container";
import type { EmailMessage } from "../../../infra/email/types";
import type { RefundStatus } from "../../../infra/payment/types";
import { advanceCeilingRefund, ceilingNoticeId, ceilingRefundId, recordCeilingRefund, resumeKingdomCeilingRefunds,
  CEILING_NOTICE_MAX_ATTEMPTS, CEILING_REFUND_ATTEMPT_WINDOW_MS, CEILING_REFUND_RECHECK_MS, CEILING_REFUND_SETTLE_MS,
  CEILING_REFUND_MAX_ATTEMPTS } from "../kingdom-ceiling-refund";
import { seedApprovedGame } from "./local-patch-fixtures";

// kingdom-ceiling-refund/v1 (review QAV6-02). The ledger, transactions, order/game transitions and outbox are real;
// only the payment provider and the mail transport are controlled. No real money, provider or mail.
vi.mock("../../../lib/env", () => ({ env: () => ({ APP_ENV: "qa" }), flag: () => false, adminEmails: () => [] }));
let directory: string, db: PrismaClient;
beforeAll(async () => {
  directory = realpathSync(mkdtempSync(path.join(realpathSync(tmpdir()), "findme-ceiling-refund-")));
  db = new PrismaClient({ datasources: { db: { url: "file:" + path.join(directory, "test.db").replaceAll("\\", "/") } } });
  await applyTestSchema(db);
  vi.stubGlobal("fetch", vi.fn(async () => { throw Error("Live network forbidden in the ceiling refund regression"); }));
}, 120_000);
afterAll(async () => {
  vi.unstubAllGlobals(); await db.$disconnect();
  if (path.dirname(directory) === realpathSync(tmpdir()) && path.basename(directory).startsWith("findme-ceiling-refund-")) rmSync(directory, { recursive: true });
});

/** A paid world closed at its ceiling, with its owed refund recorded in the closing transaction and nothing advanced yet. */
async function closedWorld(gameId: string, provider: { refund: Container["payment"]["refund"]; refundStatus?: (id: string) => Promise<RefundStatus> }) {
  const mails: EmailMessage[] = [];
  const c = { db, storage: new DbStorage(db), appUrl: "http://localhost:3000", analytics: { track: vi.fn() }, adminEmails: ["ops@example.invalid"],
    emailFallbackTo: null, payment: { id: "mock", ...provider }, email: { id: "console", send: vi.fn(async (m: EmailMessage) => { mails.push(m); return { id: "mail-" + mails.length }; }) },
  } as unknown as Container;
  const seeded = await seedApprovedGame(c, db, { gameId, approved: false, status: "GENERATION_FAILED", styleVersion: "local-patch-world-v1", withJob: true, scenes: [] });
  await db.order.create({ data: { id: "ord-" + gameId, gameId, userId: seeded.userId, provider: "mock", packageTier: "ONE_WORLD",
    amountAgorot: 2900, paymentStatus: "PAID", paidAt: new Date(), providerPaymentId: "pay-" + gameId } });
  expect(await db.$transaction(tx => recordCeilingRefund(tx, gameId))).toBe(true);
  const refundOf = async () => JSON.parse((await db.auditLog.findUniqueOrThrow({ where: { id: ceilingRefundId(gameId) } })).metaJson!);
  const noticeOf = async () => { const row = await db.auditLog.findUnique({ where: { id: ceilingNoticeId(gameId) } }); return row ? JSON.parse(row.metaJson!) : null; };
  // Per world: a sweep in one case may also advance another case's record through this container.
  const parentMails = () => mails.filter(m => m.tag === "game-refunded" && m.to === seeded.email);
  const alerts = () => mails.filter(m => m.tag === "admin-alert");
  const state = async () => ({ game: (await db.game.findUniqueOrThrow({ where: { id: gameId } })).status,
    order: (await db.order.findUniqueOrThrow({ where: { id: "ord-" + gameId } })).paymentStatus });
  return { c, gameId, mails, refundOf, noticeOf, parentMails, alerts, state };
}

describe("kingdom-ceiling-refund/v1", () => {
  it("confirms one refund from the provider's answer, moves order and game together, and sends one parent notice", async () => {
    const refund = vi.fn(async () => ({ ok: true, providerRefundId: "rf-1" }));
    const w = await closedWorld("ceiling-refund-clean", { refund });
    expect(await advanceCeilingRefund(w.c, w.gameId)).toBe("confirmed");
    expect(refund).toHaveBeenCalledTimes(1); expect(refund).toHaveBeenCalledWith("pay-ceiling-refund-clean", 2900);
    expect(await w.state()).toEqual({ game: "REFUNDED", order: "REFUNDED" });
    expect(await w.refundOf()).toMatchObject({ state: "confirmed", attempts: 1, providerRefundId: "rf-1" });
    expect(await w.noticeOf()).toMatchObject({ state: "sent", attempts: 1 });
    expect(w.parentMails()).toHaveLength(1); expect(w.parentMails()[0]!.idempotencyKey).toBe("game-refunded:ceiling-refund-clean");
    // Idempotent: nothing more is asked or sent.
    expect(await advanceCeilingRefund(w.c, w.gameId)).toBe("confirmed");
    expect(refund).toHaveBeenCalledTimes(1); expect(w.parentMails()).toHaveLength(1);
  });

  it("finishes the owed refund from the cron sweep after a crash right after the close committed", async () => {
    const refund = vi.fn(async () => ({ ok: true, providerRefundId: "rf-2" }));
    const w = await closedWorld("ceiling-refund-crash-after-close", { refund });
    expect(await w.refundOf()).toMatchObject({ state: "pending", attempts: 0 });
    expect(await resumeKingdomCeilingRefunds(w.c)).toBeGreaterThanOrEqual(1);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await w.state()).toEqual({ game: "REFUNDED", order: "REFUNDED" });
    expect(w.parentMails()).toHaveLength(1);
  });

  it("reconciles a lost provider answer from the provider's own status, never sending the refund twice", async () => {
    let refundedAtProvider = false;
    const refund = vi.fn(async () => { refundedAtProvider = true; throw Error("synthetic timeout after the provider moved the money"); });
    const refundStatus = vi.fn(async (): Promise<RefundStatus> => refundedAtProvider ? "refunded" : "not-refunded");
    const w = await closedWorld("ceiling-refund-lost-answer", { refund, refundStatus }), t0 = Date.now();
    expect(await advanceCeilingRefund(w.c, w.gameId, t0)).toBe("pending");
    // The attempt keeps its window after the call failed: the provider may still be finishing it.
    expect(await w.refundOf()).toMatchObject({ state: "sending", attempts: 1, leaseUntil: t0 + CEILING_REFUND_ATTEMPT_WINDOW_MS });
    expect(await advanceCeilingRefund(w.c, w.gameId, t0 + 1_000)).toBe("pending");
    expect(refundStatus).not.toHaveBeenCalled();
    expect(await w.state()).toEqual({ game: "GENERATION_FAILED", order: "PAID" });
    expect(await advanceCeilingRefund(w.c, w.gameId, t0 + CEILING_REFUND_ATTEMPT_WINDOW_MS + 1)).toBe("confirmed");
    expect(refund).toHaveBeenCalledTimes(1); expect(refundStatus).toHaveBeenCalledTimes(1);
    expect(await w.state()).toEqual({ game: "REFUNDED", order: "REFUNDED" });
    expect(w.parentMails()).toHaveLength(1);
  });

  it("never sends a second refund on an unknown outcome; a person is told instead", async () => {
    const refund = vi.fn(async () => { throw Error("synthetic timeout"); });
    const refundStatus = vi.fn(async (): Promise<RefundStatus> => "unknown");
    const w = await closedWorld("ceiling-refund-unknown", { refund, refundStatus }), t0 = Date.now(), after = t0 + CEILING_REFUND_ATTEMPT_WINDOW_MS + 1;
    expect(await advanceCeilingRefund(w.c, w.gameId, t0)).toBe("pending");
    expect(await advanceCeilingRefund(w.c, w.gameId, after)).toBe("uncertain");
    expect(await advanceCeilingRefund(w.c, w.gameId, after + 1_000)).toBe("uncertain");
    // Asked again for positive proof only on its period, and never refunded again.
    expect(refundStatus).toHaveBeenCalledTimes(1);
    expect(await advanceCeilingRefund(w.c, w.gameId, after + CEILING_REFUND_RECHECK_MS + 1)).toBe("uncertain");
    expect(refundStatus).toHaveBeenCalledTimes(2);
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await w.state()).toEqual({ game: "GENERATION_FAILED", order: "PAID" });
    expect(w.alerts().length).toBeGreaterThan(0); expect(w.parentMails()).toHaveLength(0);
  });

  it("a provider without a status query leaves an uncertain refund to a person, never a blind retry", async () => {
    const refund = vi.fn(async () => { throw Error("synthetic network failure"); });
    const w = await closedWorld("ceiling-refund-no-status", { refund }), t0 = Date.now();
    await advanceCeilingRefund(w.c, w.gameId, t0);
    expect(await advanceCeilingRefund(w.c, w.gameId, t0 + CEILING_REFUND_ATTEMPT_WINDOW_MS + 1)).toBe("uncertain");
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure the provider confirms did not move money", async () => {
    let calls = 0;
    const refund = vi.fn(async () => { if (++calls === 1) throw Error("synthetic 503 before acceptance"); return { ok: true, providerRefundId: "rf-3" }; });
    const refundStatus = vi.fn(async (): Promise<RefundStatus> => "not-refunded");
    const w = await closedWorld("ceiling-refund-transient", { refund, refundStatus }), t0 = Date.now();
    expect(await advanceCeilingRefund(w.c, w.gameId, t0)).toBe("pending");
    // A definitive "not-refunded" is acted on only once the earlier attempt is old enough to have settled.
    expect(await advanceCeilingRefund(w.c, w.gameId, t0 + CEILING_REFUND_ATTEMPT_WINDOW_MS + 1)).toBe("pending");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await advanceCeilingRefund(w.c, w.gameId, t0 + CEILING_REFUND_SETTLE_MS + 1)).toBe("confirmed");
    expect(refund).toHaveBeenCalledTimes(2);
    expect(await w.refundOf()).toMatchObject({ state: "confirmed", attempts: 2, providerRefundId: "rf-3" });
  });

  // Codex QAV6-03 (tracked regression; timing adapted: a failed call now keeps its attempt window, per QAV6-04).
  it("Codex QAV6-03: a late confirmed refund finishes the durable record and the parent notice after uncertain", async () => {
    const refund = vi.fn(async () => { throw Error("synthetic lost response"); });
    const refundStatus = vi.fn(async (): Promise<RefundStatus> => "unknown");
    const w = await closedWorld("codex-late-refund-proof", { refund, refundStatus }), t0 = Date.now(), after = t0 + CEILING_REFUND_ATTEMPT_WINDOW_MS + 1;
    expect(await advanceCeilingRefund(w.c, w.gameId, t0)).toBe("pending");
    expect(await advanceCeilingRefund(w.c, w.gameId, after)).toBe("uncertain");
    // The paid order's refund webhook commits the provider's proof.
    await db.$transaction(async tx => {
      await tx.order.update({ where: { id: "ord-" + w.gameId }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
      await tx.game.update({ where: { id: w.gameId }, data: { status: "REFUNDED" } });
    });
    const resumed = await advanceCeilingRefund(w.c, w.gameId, after + 1);
    expect({ resumed, refundCalls: refund.mock.calls.length, parentNotices: w.parentMails().length, durableState: (await w.refundOf()).state })
      .toEqual({ resumed: "confirmed", refundCalls: 1, parentNotices: 1, durableState: "confirmed" });
  });

  it("the cron sweep wakes an uncertain refund and confirms it from the provider's later proof", async () => {
    let proven = false;
    const refund = vi.fn(async (_paymentId: string, _amount: number): Promise<{ ok: boolean }> => { throw Error("synthetic lost response"); });
    const refundStatus = vi.fn(async (): Promise<RefundStatus> => proven ? "refunded" : "unknown");
    const w = await closedWorld("ceiling-refund-sweep-uncertain", { refund, refundStatus }), t0 = Date.now(), after = t0 + CEILING_REFUND_ATTEMPT_WINDOW_MS + 1;
    await advanceCeilingRefund(w.c, w.gameId, t0);
    expect(await advanceCeilingRefund(w.c, w.gameId, after)).toBe("uncertain");
    proven = true;
    const clock = vi.spyOn(Date, "now").mockReturnValue(after + CEILING_REFUND_RECHECK_MS + 1);
    try { await resumeKingdomCeilingRefunds(w.c); } finally { clock.mockRestore(); }
    expect(await w.refundOf()).toMatchObject({ state: "confirmed" });
    expect(refund.mock.calls.filter(([id]) => id === "pay-ceiling-refund-sweep-uncertain")).toHaveLength(1); expect(w.parentMails()).toHaveLength(1);
  });

  it("a manual refund after a provider refusal finishes the record and tells the parent", async () => {
    const refund = vi.fn(async () => ({ ok: false }));
    const w = await closedWorld("ceiling-refund-manual-after-refusal", { refund });
    expect(await advanceCeilingRefund(w.c, w.gameId)).toBe("refused");
    await db.order.update({ where: { id: "ord-" + w.gameId }, data: { paymentStatus: "REFUNDED", refundedAt: new Date() } });
    expect(await advanceCeilingRefund(w.c, w.gameId)).toBe("confirmed");
    expect(refund).toHaveBeenCalledTimes(1);
    expect(await w.state()).toEqual({ game: "REFUNDED", order: "REFUNDED" }); expect(w.parentMails()).toHaveLength(1);
  });

  // Codex QAV6-04 (tracked regression, verbatim): a not-refunded-YET snapshot never repeats an attempt still in flight.
  it("Codex QAV6-04: an expired worker lease must not repeat a refund while its first call remains in flight", async () => {
    let resolveFirst!: (value: { ok: boolean; providerRefundId?: string }) => void;
    let signalFirst!: () => void;
    const firstStarted = new Promise<void>(resolve => { signalFirst = resolve; });
    let invocations = 0;
    const refund = vi.fn(async () => {
      if (++invocations === 1) { signalFirst(); return await new Promise<{ ok: boolean; providerRefundId?: string }>(resolve => { resolveFirst = resolve; }); }
      return { ok: true, providerRefundId: "synthetic-second-refund" };
    });
    const refundStatus = vi.fn(async (): Promise<RefundStatus> => "not-refunded");
    const w = await closedWorld("codex-overlapping-refund-workers", { refund, refundStatus });
    const start = Date.now();
    const firstWorker = advanceCeilingRefund(w.c, w.gameId, start);
    await firstStarted;
    let secondOutcome: unknown;
    try { secondOutcome = await advanceCeilingRefund(w.c, w.gameId, start + 120_001); }
    finally { resolveFirst({ ok: true, providerRefundId: "synthetic-first-refund" }); await firstWorker; }
    expect({ refundCalls: refund.mock.calls.length, secondOutcome, parentNotices: w.parentMails().length })
      .toEqual({ refundCalls: 1, secondOutcome: "pending", parentNotices: 1 });
  });

  it("bounds automatic attempts: after the last allowed attempt only positive proof or a person decides", async () => {
    const refund = vi.fn(async () => { throw Error("synthetic 503"); });
    const refundStatus = vi.fn(async (): Promise<RefundStatus> => "not-refunded");
    const w = await closedWorld("ceiling-refund-attempt-bound", { refund, refundStatus });
    let now = Date.now();
    for (let i = 0; i < 6; i++, now += CEILING_REFUND_SETTLE_MS + 1) await advanceCeilingRefund(w.c, w.gameId, now);
    expect(refund).toHaveBeenCalledTimes(CEILING_REFUND_MAX_ATTEMPTS);
    expect(await w.refundOf()).toMatchObject({ state: "uncertain", attempts: CEILING_REFUND_MAX_ATTEMPTS });
    expect(await w.state()).toEqual({ game: "GENERATION_FAILED", order: "PAID" });
  });

  it("hands an explicit provider refusal to a person and never asks again", async () => {
    const refund = vi.fn(async (_paymentId: string, _amount: number) => ({ ok: false }));
    const w = await closedWorld("ceiling-refund-refused", { refund });
    expect(await advanceCeilingRefund(w.c, w.gameId)).toBe("refused");
    await resumeKingdomCeilingRefunds(w.c);
    expect(await advanceCeilingRefund(w.c, w.gameId)).toBe("refused");
    expect(refund.mock.calls.filter(([id]) => id === "pay-ceiling-refund-refused")).toHaveLength(1);
    expect(await w.state()).toEqual({ game: "GENERATION_FAILED", order: "PAID" });
    expect(w.alerts().length).toBeGreaterThan(0);
  });

  it("retries a failed parent notice from its outbox and sends it once; after three failures a person is told", async () => {
    const refund = vi.fn(async () => ({ ok: true, providerRefundId: "rf-4" }));
    const w = await closedWorld("ceiling-refund-mail-retry", { refund });
    let failures = 1;
    const send = w.c.email.send as ReturnType<typeof vi.fn>, real = send.getMockImplementation() as (m: EmailMessage) => Promise<{ id: string }>;
    send.mockImplementation(async (m: EmailMessage) => { if (m.tag === "game-refunded" && failures-- > 0) throw Error("synthetic mail outage"); return real(m); });
    const t0 = Date.now();
    expect(await advanceCeilingRefund(w.c, w.gameId, t0)).toBe("confirmed");
    expect(await w.noticeOf()).toMatchObject({ state: "pending", attempts: 1 });
    expect(w.parentMails()).toHaveLength(0);
    expect(await advanceCeilingRefund(w.c, w.gameId, t0 + 1_000)).toBe("confirmed");
    expect(w.parentMails()).toHaveLength(0);
    expect(await advanceCeilingRefund(w.c, w.gameId, t0 + 61_000)).toBe("confirmed");
    expect(await w.noticeOf()).toMatchObject({ state: "sent", attempts: 2 });
    expect(w.parentMails()).toHaveLength(1); expect(refund).toHaveBeenCalledTimes(1);

    const v = await closedWorld("ceiling-refund-mail-gives-up", { refund: vi.fn(async () => ({ ok: true })) });
    const send2 = v.c.email.send as ReturnType<typeof vi.fn>, real2 = send2.getMockImplementation() as (m: EmailMessage) => Promise<{ id: string }>;
    send2.mockImplementation(async (m: EmailMessage) => { if (m.tag === "game-refunded") throw Error("synthetic mail outage"); return real2(m); });
    let now = Date.now();
    for (let i = 0; i <= CEILING_NOTICE_MAX_ATTEMPTS; i++, now += 61_000) await advanceCeilingRefund(v.c, v.gameId, now);
    expect(await v.noticeOf()).toMatchObject({ state: "unknown", attempts: CEILING_NOTICE_MAX_ATTEMPTS });
    expect(v.alerts().some(m => m.subject.includes("📭"))).toBe(true);
  });
});
